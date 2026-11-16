import {AbstractIsoThreadManager, type ThreadEntry} from "../../kernel/isothreads";
import type {FoundProgram} from "../../kernel";
import type {ProcessContext} from "../../kernel/processes";
import type {KernelEndpoint, RPCKernelToProgramMessage, RPCProgramToKernelMessage} from "../../kernel/rpc";
import {endpoint_from_message_port} from "../util/message_port_endpoint";
import {fetch_entry_source} from "../util/entry_source";
import {FRAME_SRCDOC} from "./host";

// when the window closes, the program gets this long to exit with its own code before the process is killed for it
const CLOSE_GRACE_MS = 250;

/**
 * Runs a program in a sandboxed frame that is the content of a window, for programs that need a DOM.
 * The frame has an opaque origin like a worker, so it is just as isolated from the OS's storage, but it shares the page's thread: a busy program stalls the OS, and can't be interrupted mid-loop.
 */
export class WebFrameIsoThreadManager extends AbstractIsoThreadManager {
    get_unique_type_name(): string {
        return "web_frame";
    }

    readonly #entry_url: string;

    /**
     * @param entry_url URL of the isothread entry bundle, the same one workers run.
     */
    constructor(entry_url: string) {
        super();
        this.#entry_url = entry_url;
    }

    _start(source: string, found: FoundProgram, entry: ThreadEntry, process: ProcessContext | null, loopback = false): {endpoint: KernelEndpoint, terminate(): void} {
        if (!process) {
            throw new Error("A frame isothread needs a process to own its window");
        }

        // moving a frame in the document reloads it, so it is created inside its window from the start, and the program's first create_window returns this window
        const wind = process.create_window();
        process.set_primary_window(wind);

        const frame = document.createElement("iframe");

        // allow-scripts without allow-same-origin gives the frame an opaque origin
        frame.sandbox.add("allow-scripts");

        // alert, confirm and prompt, which some libraries need (e.g. pyodide's default stdin). they can't reach the os, only block the page
        frame.sandbox.add("allow-modals");

        // games need to capture the mouse. it only ever locks to the frame, and escape always releases it
        frame.sandbox.add("allow-pointer-lock");

        // the browser fixes a frame's permissions when it loads, so a program allowed to reach this device's services gets it from the start
        if (loopback) {
            frame.allow = "loopback-network *";
        }
        frame.srcdoc = FRAME_SRCDOC;
        frame.style.display = "block";
        frame.style.width = "100%";
        frame.style.height = "100%";
        frame.style.border = "none";

        const channel = new MessageChannel();
        const source_url = found.code_path ?? found.metadata.name;

        frame.addEventListener("load", async () => {
            const entry_source = await fetch_entry_source(this.#entry_url);

            // the frame's origin is opaque so it can't be named, but we post to the window we created rather than one we looked up
            frame.contentWindow?.postMessage({entry_source, source, source_url, entry}, "*", [channel.port2]);
        }, {once: true});

        wind.dom.appendChild(frame);

        // the frame is the window's content, so focusing the window gives the program the keyboard
        wind.add_event_listener("focus", () => frame.focus());

        // the frame is the program, so once its window is gone the process can't go on
        wind.add_event_listener("close", () => {
            setTimeout(() => process.kill(0), CLOSE_GRACE_MS);
        });

        return {
            // messages queue on the port until the frame picks up the other end
            endpoint: endpoint_from_message_port<RPCKernelToProgramMessage, RPCProgramToKernelMessage>(channel.port1),
            terminate: () => {
                frame.remove();
                channel.port1.close();
            },
        };
    }
}
