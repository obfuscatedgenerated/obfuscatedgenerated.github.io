import { FoundProgram } from "./index";
import { ProcessContext } from "./processes";
import { CompletionData, ProgramMainData, ThreadData } from "../types";
import { KernelEndpoint } from "./rpc";
/**
 * Which export of the program a thread runs: main for processes, completion for tab completion, thread for one of its thread functions.
 */
export type ThreadEntry = "main" | "completion" | "thread";
export interface IsoThread {
    pid: number;
    completion: Promise<number>;
    terminate(): void;
}
export declare abstract class AbstractIsoThreadManager {
    #private;
    abstract get_unique_type_name(): string;
    get threads(): Map<number, IsoThread>;
    run(found: FoundProgram, source: string, process: ProcessContext, main_data: ProgramMainData): IsoThread;
    terminate(pid: number): void;
    /**
     * Runs one of a program's thread functions in a new isothread, which lives only until the function returns.
     * @param pid The process the thread belongs to: it is terminated along with that process.
     */
    run_thread(found: FoundProgram, source: string, pid: number, thread_name: string, input: unknown, data: ThreadData): Promise<unknown>;
    terminate_all(): void;
    /**
     * Runs a program's completion generator in a warm thread for that program. Never throws: a failing, hanging or crashed completion just gives no completions.
     */
    complete(found: FoundProgram, source: string, data: CompletionData): Promise<string[] | null>;
    /**
     * @param process The process the thread runs for, or null when it isn't running a process (e.g. completions).
     */
    abstract _start(source: string, found: FoundProgram, entry: ThreadEntry, process: ProcessContext | null): {
        endpoint: KernelEndpoint;
        terminate(): void;
    };
}
