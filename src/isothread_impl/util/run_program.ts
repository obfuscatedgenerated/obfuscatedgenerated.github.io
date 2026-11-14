import {type ProgramEndpoint, type ProgramMain, RPCShim} from "../../kernel/rpc/shim";
import {serialise_error} from "../../kernel/rpc";
import {import_module_source} from "../../lib/module_source";

/**
 * Runs a program's module source against an endpoint: builds the shim, imports the module, runs main, and reports load failures as an exit.
 */
export const run_program = async (endpoint: ProgramEndpoint, source: string, source_url: string): Promise<void> => {
    // listening straight away so the init message is never missed, even though the module loads asynchronously
    const shim = new RPCShim(endpoint);

    try {
        const exports = await import_module_source(source, source_url);

        const default_export = exports.default as {main?: unknown} | undefined;
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
