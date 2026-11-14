import {FoundProgram} from "./index";
import {ProcessContext} from "./processes";
import {ProgramMainData} from "../types";
import {KernelEndpoint, RPCSession} from "./rpc";

// exit code a thread reports when it was killed rather than exiting itself (same as SIGKILL)
const TERMINATED_EXIT_CODE = 137;

export interface IsoThread {
    pid: number;
    completion: Promise<number>;
    terminate(): void;
}

export abstract class AbstractIsoThreadManager {
    #threads = new Map<number, IsoThread>();

    get threads(): Map<number, IsoThread> {
        return this.#threads;
    }

    run(found: FoundProgram, source: string, process: ProcessContext, main_data: ProgramMainData): IsoThread {
        const started = this._start(source, found);

        let resolve_completion!: (exit_code: number) => void;
        const completion = new Promise<number>((resolve) => {
            resolve_completion = resolve;
        });

        const session = new RPCSession(started.endpoint, {
            on_exit: (exit_code) => {
                started.terminate();
                resolve_completion(exit_code);
            },
        });

        const thread: IsoThread = {
            pid: process.pid,
            completion,
            terminate: () => {
                session.dispose();
                started.terminate();
                resolve_completion(TERMINATED_EXIT_CODE);
            },
        };

        this.#threads.set(thread.pid, thread);
        completion.then(() => this.#threads.delete(thread.pid));

        session.start(found.metadata.name, main_data);

        return thread;
    }

    terminate(pid: number) {
        const thread = this.#threads.get(pid);
        if (thread) {
            thread.terminate();
            this.#threads.delete(pid);
        }
    }

    terminate_all() {
        for (const thread of this.#threads.values()) {
            thread.terminate();
        }
        this.#threads.clear();
    }

    abstract _start(source: string, found: FoundProgram): {endpoint: KernelEndpoint, terminate(): void};
}
