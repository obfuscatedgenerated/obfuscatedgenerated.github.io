import type {APISchema} from "./schema";
import type {ProxyAnnotations} from "./registry";

export const RPC_PROTOCOL_VERSION = 1;

// the kernel allocates handle and invocation ids, the program allocates call and callback ids
export type HandleID = number;
export type CallID = number;
export type CallbackID = number;
export type InvocationID = number;

export interface SerialisedError {
    name: string;
    message: string;
    stack?: string;
}

/**
 * Stands in for a function inside a value. The receiving side replaces it with a wrapper that posts callback messages.
 */
export interface CallbackMarker {
    $rpc: "callback";
    id: CallbackID;
}

/**
 * Stands in for a userspace proxy inside a value. Its descriptor travels in the same message's handles list, or was sent earlier.
 */
export interface HandleMarker {
    $rpc: "handle";
    id: HandleID;
}

/**
 * Everything needed to build a stub for a proxy without a round trip. Sent once per handle.
 */
export interface HandleDescriptor {
    id: HandleID;
    schema: APISchema;
    annotations: ProxyAnnotations;

    values: Record<string, WireValue>;
    eager: Record<string, HandleID | null>;
}

type WirePrimitive = string | number | boolean | bigint | null | undefined;

/**
 * Anything that may cross the boundary, i.e. structured-cloneable data, with markers in place of functions and proxies.
 * Markers may appear at any depth (e.g. read_line's object of key handlers).
 */
export type WireValue =
    | WirePrimitive
    | Date
    | RegExp
    | ArrayBuffer
    | ArrayBufferView
    | Map<WireValue, WireValue>
    | Set<WireValue>
    | CallbackMarker
    | HandleMarker
    | WireValue[]
    | { [key: string]: WireValue };

export interface RPCCallMessage {
    type: "call";
    call_id: CallID;
    handle_id: HandleID;
    member: string;
    args: WireValue[];
}

export interface RPCGetMessage {
    type: "get";
    call_id: CallID;
    handle_id: HandleID;
    member: string;
}

export interface RPCSetMessage {
    type: "set";
    call_id: CallID;
    handle_id: HandleID;
    member: string;
    value: WireValue;
}

export interface RPCReleaseMessage {
    type: "release";
    target: "handle" | "callback";
    id: HandleID | CallbackID;
}

export interface RPCCallbackResultMessage {
    type: "callback_result";
    invocation_id: InvocationID;
    value: WireValue;
}

export interface RPCCallbackErrorMessage {
    type: "callback_error";
    invocation_id: InvocationID;
    error: SerialisedError;
}

export interface RPCExitMessage {
    type: "exit";
    exit_code: number;
    error?: SerialisedError;
}

export type RPCProgramToKernelMessage =
    | RPCCallMessage
    | RPCGetMessage
    | RPCSetMessage
    | RPCReleaseMessage
    | RPCCallbackResultMessage
    | RPCCallbackErrorMessage
    | RPCExitMessage;


export interface RPCInitMessage {
    type: "init";
    protocol_version: typeof RPC_PROTOCOL_VERSION;
    program_name: string;
    data: WireValue;
    handles: HandleDescriptor[];
}

export interface RPCResultMessage {
    type: "result";
    call_id: CallID;
    value: WireValue;

    /** Descriptors for any new handles referenced by value. */
    handles?: HandleDescriptor[];
}

export interface RPCErrorMessage {
    type: "error";
    call_id: CallID;
    error: SerialisedError;
}

export interface RPCCallbackMessage {
    type: "callback";
    callback_id: CallbackID;
    args: WireValue[];

    /** Descriptors for any new handles referenced by args (e.g. a client socket passed to a connection listener). */
    handles?: HandleDescriptor[];

    /** Present when the kernel awaits the callback's return value (e.g. read_line handlers). */
    invocation_id?: InvocationID;
}

export interface RPCMirrorMessage {
    type: "mirror";
    handle_id: HandleID;

    /** Only the members that changed. */
    values: Record<string, WireValue>;
}

export interface RPCHandleRevokedMessage {
    type: "handle_revoked";
    handle_id: HandleID;
}

export type RPCKernelToProgramMessage =
    | RPCInitMessage
    | RPCResultMessage
    | RPCErrorMessage
    | RPCCallbackMessage
    | RPCMirrorMessage
    | RPCHandleRevokedMessage;

export type RPCMessage = RPCKernelToProgramMessage | RPCProgramToKernelMessage;
