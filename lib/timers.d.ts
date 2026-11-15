/**
 * Process timers, shared by the kernel's process contexts and the RPC shim. State is kept per owner (`this`), so each process has its own timers.
 *
 * @module
 */
/**
 * Stops every timer of the owner. Waiters are dropped without being resolved.
 */
export declare const dispose_timers: (owner: object) => void;
export declare const create_timeout: (this: object, callback: () => void, delay: number, on_cancel?: () => void) => number;
export declare const cancel_timeout: (this: object, id: number) => void;
export declare const has_timeout: (this: object, id: number) => boolean;
export declare const wait_for_timeout: (this: object, id: number) => Promise<boolean>;
export declare const create_interval: (this: object, callback: () => void, interval: number) => number;
export declare const has_interval: (this: object, id: number) => boolean;
export declare const clear_interval: (this: object, id: number) => void;
