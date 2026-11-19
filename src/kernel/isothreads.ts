import {FoundProgram} from "./index";
import {ProcessContext} from "./processes";
import {CompletionData, ProgramMainData, ThreadData} from "../types";
import {deserialise_error, finalise_userspace_proxy, KernelEndpoint, RPCSession} from "./rpc";

// exit code a thread reports when it was killed rather than exiting itself (same as SIGKILL)
const TERMINATED_EXIT_CODE = 137;

/**
 * Which export of the program a thread runs: main for processes, completion for tab completion, thread for one of its thread functions.
 */
export type ThreadEntry = "main" | "completion" | "thread";

// a process can't flood the machine with threads
const MAX_FUNCTION_THREADS_PER_PROCESS = 8;

// completion threads are kept warm between tab presses, within these limits
const MAX_WARM_COMPLETION_THREADS = 4;
const COMPLETION_IDLE_TIMEOUT_MS = 30_000;

// a completion that hangs must never stall the shell
const COMPLETION_REQUEST_TIMEOUT_MS = 2_000;

type CompleteFunction = (data: CompletionData) => Promise<string[] | null>;

interface CompletionThread {
    source: string;
    registered: Promise<CompleteFunction>;
    idle_timer: ReturnType<typeof setTimeout> | null;
    terminate(): void;
}

const with_timeout = <T>(promise: Promise<T>, timeout_ms: number, description: string): Promise<T> =>
    new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`${description} timed out after ${timeout_ms}ms`)), timeout_ms);
        promise.then(
            (value) => {
                clearTimeout(timer);
                resolve(value);
            },
            (error) => {
                clearTimeout(timer);
                reject(error);
            },
        );
    });

export interface IsoThread {
    pid: number;
    completion: Promise<number>;
    terminate(): void;
}

export abstract class AbstractIsoThreadManager {
    abstract get_unique_type_name(): string;

    #threads = new Map<number, IsoThread>();

    // keyed by program name, in least to most recently used order
    readonly #completion_threads = new Map<string, CompletionThread>();

    // pid -> terminators of the thread functions that process has running
    readonly #function_threads = new Map<number, Set<() => void>>();

    get threads(): Map<number, IsoThread> {
        return this.#threads;
    }

    /**
     * @param loopback Whether the program was allowed to connect to services on this device.
     */
    run(found: FoundProgram, source: string, process: ProcessContext, main_data: ProgramMainData, loopback = false): IsoThread {
        const started = this._start(source, found, "main", process, loopback);

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

        console.debug("new isothread", thread);

        // removed in terminate rather than when main returns, as the thread outlives main until the process is killed
        this.#threads.set(thread.pid, thread);

        session.start(found.metadata.name, main_data);

        return thread;
    }

    terminate(pid: number) {
        const thread = this.#threads.get(pid);
        if (thread) {
            thread.terminate();
            console.debug("terminated isothread", thread);
            this.#threads.delete(pid);
        }

        this.#terminate_function_threads(pid);
    }

    #terminate_function_threads(pid: number) {
        // copied, as terminating removes from the set
        for (const terminate_thread of [...this.#function_threads.get(pid) ?? []]) {
            terminate_thread();
        }
    }

    /**
     * Runs one of a program's thread functions in a new isothread, which lives only until the function returns.
     * @param pid The process the thread belongs to: it is terminated along with that process.
     * @param loopback Whether the process was allowed to connect to services on this device, which its threads share.
     */
    run_thread(found: FoundProgram, source: string, pid: number, thread_name: string, input: unknown, data: ThreadData, loopback = false): Promise<unknown> {
        let running = this.#function_threads.get(pid);
        if (!running) {
            running = new Set();
            this.#function_threads.set(pid, running);
        }

        if (running.size >= MAX_FUNCTION_THREADS_PER_PROCESS) {
            return Promise.reject(new Error(`Process ${pid} already has ${MAX_FUNCTION_THREADS_PER_PROCESS} threads running`));
        }

        const running_threads = running;
        const started = this._start(source, found, "thread", null, loopback);

        return new Promise<unknown>((resolve, reject) => {
            let settled = false;
            let clean_up: () => void = () => undefined;

            const finish = (settle: () => void) => {
                if (settled) {
                    return;
                }
                settled = true;

                settle();
                clean_up();
            };

            const terminate_thread = () => finish(() => reject(new Error(`Thread ${thread_name} was terminated`)));

            const session = new RPCSession(started.endpoint, {
                // the thread entry only exits with an error if the function threw or doesn't exist, as otherwise it hands its result over first
                on_exit: (_exit_code, error) => {
                    if (error) {
                        finish(() => reject(deserialise_error(error)));
                    }
                },
            });

            clean_up = () => {
                running_threads.delete(terminate_thread);
                if (running_threads.size === 0) {
                    this.#function_threads.delete(pid);
                }

                // after the current message is dealt with, so the reply to the thread's last call isn't cut off mid-send
                setTimeout(() => {
                    session.dispose();
                    started.terminate();
                }, 0);
            };

            // the thread hands its result back through this
            const thread_host = Object.create(null);
            Object.defineProperties(thread_host, {
                resolve: {
                    value: (result: unknown) => finish(() => resolve(result)),
                    enumerable: true,
                },
            });

            running_threads.add(terminate_thread);

            session.start(found.metadata.name, {
                kernel: data.kernel,
                process: data.process,
                term: data.term,
                thread_host: finalise_userspace_proxy(thread_host),
                thread_name,
                input,
            });
        });
    }

    /**
     * Terminates every thread and releases anything the manager holds (e.g. a host frame). The manager must not be used after this.
     * A manager can instead be reused for another kernel once that kernel's run has ended, as all of its threads have been terminated by then.
     */
    dispose(): void {
        this.terminate_all();
    }

    terminate_all() {
        for (const thread of this.#threads.values()) {
            thread.terminate();
        }
        this.#threads.clear();

        for (const pid of [...this.#function_threads.keys()]) {
            this.#terminate_function_threads(pid);
        }

        for (const program_name of [...this.#completion_threads.keys()]) {
            this.#drop_completion_thread(program_name);
        }
    }

    /**
     * Runs a program's completion generator in a warm thread for that program. Never throws: a failing, hanging or crashed completion just gives no completions.
     */
    async complete(found: FoundProgram, source: string, data: CompletionData): Promise<string[] | null> {
        const program_name = found.metadata.name;
        const thread = this.#get_completion_thread(found, source);

        try {
            const complete = await with_timeout(thread.registered, COMPLETION_REQUEST_TIMEOUT_MS, `Starting completion for ${program_name}`);
            const result = await with_timeout(complete(data), COMPLETION_REQUEST_TIMEOUT_MS, `Completion for ${program_name}`);

            this.#touch_completion_thread(program_name, thread);
            return Array.isArray(result) ? result.filter((value) => typeof value === "string") : null;
        } catch (error) {
            console.warn(`Completion for ${program_name} failed:`, error);
            this.#drop_completion_thread(program_name, thread);
            return null;
        }
    }

    #get_completion_thread(found: FoundProgram, source: string): CompletionThread {
        const program_name = found.metadata.name;

        const existing = this.#completion_threads.get(program_name);
        if (existing && existing.source === source) {
            return existing;
        }

        // the program changed since the thread started (e.g. reinstalled), so start again with the new code
        if (existing) {
            this.#drop_completion_thread(program_name);
        }

        // evict the least recently used thread to stay within the limit
        if (this.#completion_threads.size >= MAX_WARM_COMPLETION_THREADS) {
            const least_recent = this.#completion_threads.keys().next().value;
            if (least_recent !== undefined) {
                this.#drop_completion_thread(least_recent);
            }
        }

        const started = this._start(source, found, "completion", null);

        let resolve_registered!: (complete: CompleteFunction) => void;
        let reject_registered!: (error: Error) => void;
        const registered = new Promise<CompleteFunction>((resolve, reject) => {
            resolve_registered = resolve;
            reject_registered = reject;
        });

        // stops an unhandled rejection if the thread dies before anyone awaits it
        registered.catch(() => undefined);

        const session = new RPCSession(started.endpoint, {
            // the completion entry only returns once it has registered, so an exit with an error means it never will
            on_exit: (_exit_code, error) => {
                if (error) {
                    reject_registered(deserialise_error(error));
                }
            },
        });

        // the thread hands its completion function back through this, then the kernel calls it for each tab press
        const completion_host = Object.create(null);
        Object.defineProperties(completion_host, {
            register: {
                value: (complete: CompleteFunction) => {
                    if (typeof complete === "function") {
                        resolve_registered(complete);
                    }
                },
                enumerable: true,
            },
        });

        const thread: CompletionThread = {
            source,
            registered,
            idle_timer: null,
            terminate: () => {
                session.dispose();
                started.terminate();
                reject_registered(new Error("Completion thread terminated"));
            },
        };
        console.debug("new completion thread for", program_name, thread);

        this.#completion_threads.set(program_name, thread);
        this.#touch_completion_thread(program_name, thread);

        session.start(program_name, {completion_host: finalise_userspace_proxy(completion_host)});

        return thread;
    }

    #touch_completion_thread(program_name: string, thread: CompletionThread) {
        // reinserting moves it to the most recently used end
        if (this.#completion_threads.get(program_name) === thread) {
            this.#completion_threads.delete(program_name);
            this.#completion_threads.set(program_name, thread);
        }

        if (thread.idle_timer !== null) {
            clearTimeout(thread.idle_timer);
        }

        thread.idle_timer = setTimeout(() => this.#drop_completion_thread(program_name, thread), COMPLETION_IDLE_TIMEOUT_MS);
    }

    // expected_thread stops a late failure from dropping a newer thread for the same program
    #drop_completion_thread(program_name: string, expected_thread?: CompletionThread) {
        const thread = this.#completion_threads.get(program_name);
        if (!thread || (expected_thread && thread !== expected_thread)) {
            return;
        }

        if (thread.idle_timer !== null) {
            clearTimeout(thread.idle_timer);
        }

        this.#completion_threads.delete(program_name);
        thread.terminate();
    }

    /**
     * @param process The process the thread runs for, or null when it isn't running a process (e.g. completions).
     * @param loopback Whether the thread may connect to services on this device. Never set for completions.
     */
    abstract _start(source: string, found: FoundProgram, entry: ThreadEntry, process: ProcessContext | null, loopback?: boolean): {endpoint: KernelEndpoint, terminate(): void};
}
