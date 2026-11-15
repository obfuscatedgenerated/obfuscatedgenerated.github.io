import {AbstractIsoThreadManager, type ThreadEntry} from "../kernel/isothreads";
import type {FoundProgram} from "../kernel";
import {
    type KernelEndpoint,
    type RPCKernelToProgramMessage,
    type RPCProgramToKernelMessage,
} from "../kernel/rpc";
import {type ProgramEndpoint} from "../kernel/rpc/shim";
import {endpoint_from_message_port} from "./util/message_port_endpoint";
import {run_program} from "./util/run_program";

/**
 * Runs programs in-realm, but still through the RPC session and shim. Not isolated at all: useful for debugging the RPC layer and as a fallback where workers aren't available.
 */
export class LoopbackIsoThreadManager extends AbstractIsoThreadManager {
    get_unique_type_name(): string {
        return "loopback";
    }

    _start(source: string, found: FoundProgram, entry: ThreadEntry): {endpoint: KernelEndpoint, terminate(): void} {
        console.warn("Security warning: Loopback isothread manager runs in kernelspace, and is only for testing purposes.")

        const channel = new MessageChannel();

        const kernel_endpoint: KernelEndpoint = endpoint_from_message_port<RPCKernelToProgramMessage, RPCProgramToKernelMessage>(channel.port1);
        const program_endpoint: ProgramEndpoint = endpoint_from_message_port<RPCProgramToKernelMessage, RPCKernelToProgramMessage>(channel.port2);

        run_program(program_endpoint, source, found.code_path ?? found.metadata.name, entry);

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
