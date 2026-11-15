import { type ErrorConstructorMap } from "./marshal";
import { type RPCKernelToProgramMessage, type RPCProgramToKernelMessage, type SerialisedError } from "./protocol";
import type { RPCEndpoint } from "./transport";
export type KernelEndpoint = RPCEndpoint<RPCKernelToProgramMessage, RPCProgramToKernelMessage>;
export interface RPCSessionOptions {
    on_exit(exit_code: number, error?: SerialisedError): void;
    known_errors?: ErrorConstructorMap;
}
/**
 * The kernel side of one process's RPC connection. Owns the handles and callbacks the process can use, and keeps its mirrored values up to date.
 */
export declare class RPCSession {
    #private;
    constructor(endpoint: KernelEndpoint, options: RPCSessionOptions);
    get disposed(): boolean;
    /**
     * Sends the init message. The data should already contain only what the program may have: proxies, plain data, and a shell rpc proxy if any.
     */
    start(program_name: string, data: object): void;
    /**
     * Tells the program a handle is gone (e.g. its socket closed) and stops tracking it.
     */
    revoke(proxy: object): void;
    dispose(): void;
}
