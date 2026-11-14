import {FoundProgram} from "./index";
import {ProcessContext} from "./processes";
import {ProgramMainData} from "../types";
import {deserialise_error, KernelEndpoint, RPCSession} from "./rpc";

// exit code a thread reports when it was killed rather than exiting itself (same as SIGKILL)
const TERMINATED_EXIT_CODE = 137;

export interface IsoThread {
    pid: number;
    completion: Promise<number>;
    terminate(): void;
}

export abstract class AbstractIsoThreadManager {
    abstract get_unique_type_name(): string;

    #threads = new Map<number, IsoThread>();

    get threads(): Map<number, IsoThread> {
        return this.#threads;
    }

    run(found: FoundProgram, source: string, process: ProcessContext, main_data: ProgramMainData): IsoThread {
        const started = this._start(source, found);

        let resolve_completion!: (exit_code: number) => void;
        let reject_completion!: (error: Error) => void;
        const completion = new Promise<number>((resolve, reject) => {
            resolve_completion = resolve;
            reject_completion = reject;
        });

        const session = new RPCSession(started.endpoint, {
            // main returning doesn't end the thread: the process (e.g. a detached one) lives until it's killed, which calls terminate
            on_exit: (exit_code, error) => {
                // rethrow on the kernel side so callers see it the same way as an in-realm program throwing
                if (error) {
                    reject_completion(deserialise_error(error));
                } else {
                    resolve_completion(exit_code);
                }
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

        // removed in terminate rather than when main returns, as the thread outlives main until the process is killed
        this.#threads.set(thread.pid, thread);

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
