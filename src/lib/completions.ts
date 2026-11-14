/**
 * Completion generators may return a list, null, or an async generator. Callers across the rpc boundary need a plain list, so generators are drained here.
 */

// a runaway generator can't flood the shell
const MAX_COMPLETIONS = 1000;

export const collect_completions = async (result: unknown): Promise<string[] | null> => {
    if (result === null || result === undefined) {
        return null;
    }

    if (typeof result === "object" && typeof (result as AsyncIterable<unknown>)[Symbol.asyncIterator] === "function") {
        const collected: string[] = [];
        for await (const value of result as AsyncIterable<unknown>) {
            if (typeof value === "string") {
                collected.push(value);
            }

            if (collected.length >= MAX_COMPLETIONS) {
                break;
            }
        }

        return collected;
    }

    if (Array.isArray(result)) {
        return result.filter((value): value is string => typeof value === "string").slice(0, MAX_COMPLETIONS);
    }

    return null;
};
