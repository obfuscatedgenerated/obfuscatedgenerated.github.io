import {AbstractIsoThreadManager, type ThreadEntry} from "../../kernel/isothreads";
import type {FoundProgram} from "../../kernel";
import type {ProcessContext} from "../../kernel/processes";
import {type KernelEndpoint, type RPCKernelToProgramMessage, type RPCProgramToKernelMessage, serialise_error} from "../../kernel/rpc";
import {endpoint_from_message_port} from "../util/message_port_endpoint";
import {fetch_entry_source} from "../util/entry_source";
import {HOST_SRCDOC} from "./host";

interface HostReady {
    frame: HTMLIFrameElement;
    worker_source: string;
}

/**
 * Runs each program in its own web worker, created inside a sandboxed iframe so the worker gets an opaque origin and can't reach the OS's storage.
 * Programs allowed to connect to services on this device run in a second iframe that has that permission, as workers get their permissions from the frame they're made in.
 */
export class WebWorkerIsoThreadManager extends AbstractIsoThreadManager {
    get_unique_type_name(): string {
        return "web_worker";
    }

    readonly #worker_url: string;
    readonly #ready: Promise<HostReady>;

    // only created once a program needs it
    #loopback_ready: Promise<HostReady> | null = null;

    #next_id = 1;

    /**
     * @param worker_url URL of the isothread worker bundle. It is fetched as text, as a sandboxed iframe can't create a worker from a URL on the os's origin.
     */
    constructor(worker_url: string) {
        super();
        this.#worker_url = worker_url;
        this.#ready = this.#create_host(false);
    }

    #create_host(loopback: boolean): Promise<HostReady> {
        return Promise.all([fetch_entry_source(this.#worker_url), this.#create_host_frame(loopback)])
            .then(([worker_source, frame]) => ({frame, worker_source}));
    }

    #host(loopback: boolean): Promise<HostReady> {
        if (!loopback) {
            return this.#ready;
        }

        this.#loopback_ready ??= this.#create_host(true);
        return this.#loopback_ready;
    }

    #create_host_frame(loopback: boolean): Promise<HTMLIFrameElement> {
        return new Promise((resolve) => {
            const frame = document.createElement("iframe");

            // allow-scripts without allow-same-origin gives the frame (and its workers) an opaque origin
            frame.sandbox.add("allow-scripts");

            // the opaque origin can't be named, so it is delegated to whatever the frame holds, which is only ever our host
            if (loopback) {
                frame.allow = "loopback-network *";
            }

            frame.srcdoc = HOST_SRCDOC;
            frame.style.display = "none";

            frame.addEventListener("load", () => resolve(frame), {once: true});
            document.body.appendChild(frame);
        });
    }

    dispose(): void {
        super.dispose();

        // removing a host frame ends every worker it started
        for (const host of [this.#ready, this.#loopback_ready]) {
            host?.then(({frame}) => frame.remove()).catch(() => undefined);
        }

        this.#loopback_ready = null;
    }

    // every post goes through one .then on the same promise, so a terminate can never overtake its spawn
    #post_to_host(loopback: boolean, build_message: (worker_source: string) => object, transfer: Transferable[] = []): Promise<void> {
        return this.#host(loopback).then(({frame, worker_source}) => {
            // the frame's origin is opaque so it can't be named, but we post to the window we created rather than one we looked up
            frame.contentWindow?.postMessage(build_message(worker_source), "*", transfer);
        });
    }

    _start(source: string, found: FoundProgram, entry: ThreadEntry, process: ProcessContext | null, loopback = false): {endpoint: KernelEndpoint, terminate(): void} {
        const id = this.#next_id++;
        const channel = new MessageChannel();
        const source_url = found.code_path ?? found.metadata.name;

        this.#post_to_host(loopback, (worker_source) => ({type: "spawn", id, worker_source, source, source_url, entry}), [channel.port2])
            .catch((error) => {
                // the host never came up, so answer as the program would have, or the session would wait forever
                const exit_message: RPCProgramToKernelMessage = {type: "exit", exit_code: 1, error: serialise_error(error)};
                channel.port2.postMessage(exit_message);
            });

        return {
            // messages queue on the port until the worker picks up the other end
            endpoint: endpoint_from_message_port<RPCKernelToProgramMessage, RPCProgramToKernelMessage>(channel.port1),
            terminate: () => {
                this.#post_to_host(loopback, () => ({type: "terminate", id})).catch(() => {});
                channel.port1.close();
            },
        };
    }
}
