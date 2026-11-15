/**
 * Functions that can run on either side of the RPC boundary. Each is defined once, with a stable id, so the kernel can refer to it by id and the program side can find the same code.
 *
 * A local function is called with the object it belongs to as `this` (a kernel proxy, or a program-side stub).
 *
 * @module
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type LocalFunction = (this: any, ...args: any[]) => unknown;

const locals_by_id = new Map<string, LocalFunction>();
const ids_by_local = new WeakMap<LocalFunction, string>();
const owner_disposers: ((owner: object) => void)[] = [];

export const define_local = <T extends LocalFunction>(id: string, fn: T): T => {
    const existing = locals_by_id.get(id);
    if (existing && existing !== fn) {
        throw new Error(`A different local function is already defined as "${id}"`);
    }

    locals_by_id.set(id, fn);
    ids_by_local.set(fn, id);
    return fn;
};

export const get_local_id = (fn: LocalFunction): string | undefined => ids_by_local.get(fn);

export const get_local = (id: string): LocalFunction | undefined => locals_by_id.get(id);

/**
 * Registers cleanup for state a local keeps per owner (e.g. timers), run when the owner goes away.
 */
export const on_local_owner_dispose = (disposer: (owner: object) => void): void => {
    owner_disposers.push(disposer);
};

export const dispose_local_owner = (owner: object): void => {
    for (const disposer of owner_disposers) {
        disposer(owner);
    }
};
