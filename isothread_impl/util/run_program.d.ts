import { type ProgramEndpoint } from "../../kernel/rpc/shim";
import type { ThreadEntry } from "../../kernel/isothreads";
/**
 * Runs a program's module source against an endpoint: builds the shim, imports the module, runs the entry, and reports load failures as an exit.
 *
 * The "completion" entry doesn't exit after one call: it registers the program's completion generator with the kernel, which then calls it for every tab press while the thread is warm.
 * The "thread" entry runs one of the program's thread functions once and hands its result to the kernel.
 */
export declare const run_program: (endpoint: ProgramEndpoint, source: string, source_url: string, entry: ThreadEntry) => Promise<void>;
