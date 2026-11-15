/**
 * Functions that can run on either side of the RPC boundary. Each is defined once, with a stable id, so the kernel can refer to it by id and the program side can find the same code.
 *
 * A local function is called with the object it belongs to as `this` (a kernel proxy, or a program-side stub).
 *
 * @module
 */
export type LocalFunction = (this: any, ...args: any[]) => unknown;
export declare const define_local: <T extends LocalFunction>(id: string, fn: T) => T;
export declare const get_local_id: (fn: LocalFunction) => string | undefined;
export declare const get_local: (id: string) => LocalFunction | undefined;
/**
 * Registers cleanup for state a local keeps per owner (e.g. timers), run when the owner goes away.
 */
export declare const on_local_owner_dispose: (disposer: (owner: object) => void) => void;
export declare const dispose_local_owner: (owner: object) => void;
