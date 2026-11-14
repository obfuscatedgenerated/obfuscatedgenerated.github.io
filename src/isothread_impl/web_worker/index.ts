import {AbstractIsoThreadManager} from "../../kernel/isothreads";
import type {FoundProgram} from "../../kernel";
import {type KernelEndpoint, type RPCKernelToProgramMessage, type RPCProgramToKernelMessage, serialise_error} from "../../kernel/rpc";
import {endpoint_from_message_port} from "../util/message_port_endpoint";
import {HOST_SRCDOC} from "./host";

interface HostReady {
    frame: HTMLIFrameElement;
    worker_source: string;
}

/**
 * Runs each program in its own web worker, created inside a sandboxed iframe so the worker gets an opaque origin and can't reach the OS's storage.
 */
export class WebWorkerIsoThreadManager extends AbstractIsoThreadManager {
    get_unique_type_name(): string {
        return "web_worker";
    }

    readonly #ready: Promise<HostReady>;
    #next_id = 1;

    /**
     * @param worker_url URL of the isothread worker bundle. It is fetched as text, as a sandboxed iframe can't create a worker from a URL on the os's origin.
     */
    constructor(worker_url: string) {
        super();
        this.#ready = Promise.all([this.#fetch_worker_source(worker_url), this.#create_host_frame()])
            .then(([worker_source, frame]) => ({frame, worker_source}));
    }

    async #fetch_worker_source(worker_url: string): Promise<string> {
        const response = await fetch(worker_url);
        if (!response.ok) {
            throw new Error(`Failed to fetch isothread worker from ${worker_url}: ${response.status}`);
        }

        return await response.text();
    }

    #create_host_frame(): Promise<HTMLIFrameElement> {
        return new Promise((resolve) => {
            const frame = document.createElement("iframe");

            // allow-scripts without allow-same-origin gives the frame (and its workers) an opaque origin
            frame.sandbox.add("allow-scripts");
            frame.srcdoc = HOST_SRCDOC;
            frame.style.display = "none";

            frame.addEventListener("load", () => resolve(frame), {once: true});
            document.body.appendChild(frame);
        });
    }

    // every post goes through one .then on the same promise, so a terminate can never overtake its spawn
    #post_to_host(build_message: (worker_source: string) => object, transfer: Transferable[] = []): Promise<void> {
        return this.#ready.then(({frame, worker_source}) => {
            // the frame's origin is opaque so it can't be named, but we post to the window we created rather than one we looked up
            frame.contentWindow?.postMessage(build_message(worker_source), "*", transfer);
        });
    }

    _start(source: string, found: FoundProgram): {endpoint: KernelEndpoint, terminate(): void} {
        const id = this.#next_id++;
        const channel = new MessageChannel();
        const source_url = found.code_path ?? found.metadata.name;

        this.#post_to_host((worker_source) => ({type: "spawn", id, worker_source, source, source_url}), [channel.port2])
            .catch((error) => {
                // the host never came up, so answer as the program would have, or the session would wait forever
                const exit_message: RPCProgramToKernelMessage = {type: "exit", exit_code: 1, error: serialise_error(error)};
                channel.port2.postMessage(exit_message);
            });

        return {
            // messages queue on the port until the worker picks up the other end
            endpoint: endpoint_from_message_port<RPCKernelToProgramMessage, RPCProgramToKernelMessage>(channel.port1),
            terminate: () => {
                this.#post_to_host(() => ({type: "terminate", id})).catch(() => {});
                channel.port1.close();
            },
        };
    }
}
