import { AbstractIsoThreadManager, type ThreadEntry } from "../kernel/isothreads";
import type { FoundProgram } from "../kernel";
import { type KernelEndpoint } from "../kernel/rpc";
/**
 * Runs programs in-realm, but still through the RPC session and shim. Not isolated at all: useful for debugging the RPC layer and as a fallback where workers aren't available.
 */
export declare class LoopbackIsoThreadManager extends AbstractIsoThreadManager {
    get_unique_type_name(): string;
    create_sibling(): AbstractIsoThreadManager;
    _start(source: string, found: FoundProgram, entry: ThreadEntry): {
        endpoint: KernelEndpoint;
        terminate(): void;
    };
}
