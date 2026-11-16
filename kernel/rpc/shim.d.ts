import { type RPCInitMessage, type RPCKernelToProgramMessage, type RPCProgramToKernelMessage } from "./protocol";
import type { RPCEndpoint } from "./transport";
import { type ErrorConstructorMap } from "./marshal";
import type { ProgramMainData } from "../../types";
export type ProgramEndpoint = RPCEndpoint<RPCProgramToKernelMessage, RPCKernelToProgramMessage>;
export type ProgramMain = (data: ProgramMainData) => Promise<number> | number;
export interface RPCShimOptions {
    known_errors?: ErrorConstructorMap;
}
/**
 * The program side of an RPC connection. Builds stubs from the kernel's descriptors and runs the program against them.
 */
export declare class RPCShim {
    #private;
    constructor(endpoint: ProgramEndpoint, options?: RPCShimOptions);
    wait_for_init(): Promise<RPCInitMessage>;
    /**
     * Waits for init, runs the program's main against the stubs, then reports the exit code to the kernel.
     */
    run(main: ProgramMain): Promise<void>;
}
