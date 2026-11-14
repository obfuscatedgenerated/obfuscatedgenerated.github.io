import {AbstractIsoThreadManager} from "../kernel/isothreads";
import type {FoundProgram} from "../kernel";
import {
    type KernelEndpoint,
    type RPCKernelToProgramMessage,
    type RPCProgramToKernelMessage,
    serialise_error,
} from "../kernel/rpc";
import {type ProgramEndpoint, ProgramMain, RPCShim} from "../kernel/rpc/shim";
import {endpoint_from_message_port} from "./util/message_port_endpoint";
import {import_module_source} from "../lib/module_source";

/**
 * Runs programs in-realm, but still through the RPC session and shim. Not isolated at all: useful for debugging the RPC layer and as a fallback where workers aren't available.
 */
export class LoopbackIsoThreadManager extends AbstractIsoThreadManager {
    _start(source: string, found: FoundProgram): {endpoint: KernelEndpoint, terminate(): void} {
        console.warn("Security warning: Loopback isothread manager runs in kernelspace, and is only for testing purposes.")

        const channel = new MessageChannel();

        const kernel_endpoint: KernelEndpoint = endpoint_from_message_port<RPCKernelToProgramMessage, RPCProgramToKernelMessage>(channel.port1);
        const program_endpoint: ProgramEndpoint = endpoint_from_message_port<RPCProgramToKernelMessage, RPCKernelToProgramMessage>(channel.port2);

        // listening straight away so the init message is never missed, even though the module loads asynchronously
        const shim = new RPCShim(program_endpoint);

        const load_and_run = async () => {
            try {
                const exports = await import_module_source(source, found.code_path ?? found.metadata.name);

                const default_export = exports.default as {main?: unknown, completion?: unknown} | undefined;
                const main = exports.main ?? default_export?.main;

                if (typeof main !== "function") {
                    throw new Error(`Program ${found.metadata.name} does not export a main function`);
                }

                await shim.run(main as ProgramMain);
            } catch (error) {
                // the shim never got to run, so report the failure ourselves or the session would wait forever
                program_endpoint.send({type: "exit", exit_code: 1, error: serialise_error(error)});
            }
        };

        load_and_run();

        return {
            endpoint: kernel_endpoint,
            terminate: () => {
                // in-realm code can't actually be stopped, this just cuts it off from the kernel
                channel.port1.close();
                channel.port2.close();
            },
        };
    }
}
