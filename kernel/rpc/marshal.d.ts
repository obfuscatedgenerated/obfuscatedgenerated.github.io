import type { CallbackMarker, HandleMarker, SerialisedError, WireValue } from "./protocol";
export interface MarshalHooks {
    /** Turns a function into a marker, or throws if functions can't be sent in this direction. */
    on_function(fn: (...args: unknown[]) => unknown): WireValue;
    /** Returns a marker if the object is a proxy or stub, or undefined to copy it as plain data. */
    on_object(obj: object): WireValue | undefined;
}
export interface UnmarshalHooks {
    on_callback(marker: CallbackMarker): unknown;
    on_handle(marker: HandleMarker): unknown;
}
/**
 * An object with a method under this symbol is sent over RPC as what the method returns, so a class can choose how it crosses (e.g. a shell becomes callbacks into itself).
 */
export declare const to_rpc_value: unique symbol;
export declare const marshal: (value: unknown, hooks: MarshalHooks) => WireValue;
export declare const unmarshal: (value: WireValue, hooks: UnmarshalHooks) => unknown;
export type ErrorConstructorMap = Record<string, abstract new (...args: never[]) => Error>;
/**
 * Converts an error to plain data. Known error classes are named by their key in the map, since class names don't survive minification.
 */
export declare const serialise_error: (error: unknown, known_errors?: ErrorConstructorMap) => SerialisedError;
/**
 * Rebuilds an error, using a known class for its name when one is given so instanceof checks keep working.
 * The constructor isn't called, since known errors build their own message from different arguments.
 */
export declare const deserialise_error: (serialised: SerialisedError, known_errors?: ErrorConstructorMap) => Error;
