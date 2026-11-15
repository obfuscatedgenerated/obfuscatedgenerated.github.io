import {AbstractIsoThreadManager, type ThreadEntry} from "../../kernel/isothreads";
import type {FoundProgram} from "../../kernel";
import type {ProcessContext} from "../../kernel/processes";
import type {KernelEndpoint} from "../../kernel/rpc";
import {WebWorkerIsoThreadManager} from "../web_worker";
import {WebFrameIsoThreadManager} from "../web_frame";

/**
 * Isothreads for the web: programs run in a worker unless they declare needs_dom, in which case they run in a frame.
 */
export class WebIsoThreadManager extends AbstractIsoThreadManager {
    get_unique_type_name(): string {
        return "web";
    }

    readonly #workers: WebWorkerIsoThreadManager;
    readonly #frames: WebFrameIsoThreadManager;

    /**
     * @param entry_url URL of the isothread entry bundle, which both workers and frames run.
     */
    constructor(entry_url: string) {
        super();
        this.#workers = new WebWorkerIsoThreadManager(entry_url);
        this.#frames = new WebFrameIsoThreadManager(entry_url);
    }

    _start(source: string, found: FoundProgram, entry: ThreadEntry, process: ProcessContext | null): {endpoint: KernelEndpoint, terminate(): void} {
        const {metadata} = found;

        // only main needs the dom: completions always get a worker, which keeps them off the page's thread
        const wants_frame = entry === "main" && metadata.space !== "kernel" && metadata.needs_dom === true;

        return wants_frame
            ? this.#frames._start(source, found, entry, process)
            : this.#workers._start(source, found, entry);
    }
}
