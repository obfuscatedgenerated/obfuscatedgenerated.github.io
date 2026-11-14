import {type ProgramEndpoint, type ProgramMain, RPCShim} from "../../kernel/rpc/shim";
import {serialise_error} from "../../kernel/rpc";
import type {ThreadEntry} from "../../kernel/isothreads";
import type {CompletionData} from "../../types";
import {import_module_source} from "../../lib/module_source";
import {collect_completions} from "../../lib/completions";

interface CompletionHost {
    register(complete: (data: CompletionData) => Promise<string[] | null>): Promise<void>;
}

/**
 * Runs a program's module source against an endpoint: builds the shim, imports the module, runs the entry, and reports load failures as an exit.
 *
 * The "completion" entry doesn't exit after one call: it registers the program's completion generator with the kernel, which then calls it for every tab press while the thread is warm.
 */
export const run_program = async (endpoint: ProgramEndpoint, source: string, source_url: string, entry: ThreadEntry): Promise<void> => {
    // listening straight away so the init message is never missed, even though the module loads asynchronously
    const shim = new RPCShim(endpoint);

    try {
        const exports = await import_module_source(source, source_url);
        const default_export = exports.default as {main?: unknown, completion?: unknown} | undefined;

        if (entry === "completion") {
            const completion = exports.completion ?? default_export?.completion;

            // a program without completion still registers, answering null, so the warm thread stops further tab presses spawning new ones
            const serve_completions = async (data: {completion_host: CompletionHost}) => {
                await data.completion_host.register(async (completion_data) =>
                    typeof completion === "function" ? collect_completions(await completion(completion_data)) : null
                );
                return 0;
            };

            await shim.run(serve_completions as unknown as ProgramMain);
            return;
        }

        if (entry !== "main") {
            throw new Error(`Unknown thread entry: ${String(entry)}`);
        }

        const main = exports.main ?? default_export?.main;
        if (typeof main !== "function") {
            throw new Error(`Program ${source_url} does not export a main function`);
        }

        await shim.run(main as ProgramMain);
    } catch (error) {
        // the shim never got to run, so report the failure ourselves or the session would wait forever
        endpoint.send({type: "exit", exit_code: 1, error: serialise_error(error)});
    }
};
