/**
 * Completion generators may return a list, null, or an async generator. Callers across the rpc boundary need a plain list, so generators are drained here.
 */
export declare const collect_completions: (result: unknown) => Promise<string[] | null>;
