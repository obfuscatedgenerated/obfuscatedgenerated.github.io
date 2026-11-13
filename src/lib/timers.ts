/**
 * Process timers, shared by the kernel's process contexts and the RPC shim. State is kept per owner (`this`), so each process has its own timers.
 *
 * @module
 */

import {define_local, on_local_owner_dispose} from "./locals";

interface TimerState {
    timeouts: Map<number, ReturnType<typeof setTimeout>>;
    // timeout id -> promise resolvers (for waiting on timeouts but listening to cancellation)
    timeout_waiters: Map<number, Set<(finished: boolean) => void>>;
    // timeout id -> cancel callback
    timeout_cancel_callbacks: Map<number, () => void>;
    intervals: Map<number, ReturnType<typeof setInterval>>;
    next_id: number;
}

const states = new WeakMap<object, TimerState>();

const state_of = (owner: object): TimerState => {
    let state = states.get(owner);

    if (!state) {
        state = {
            timeouts: new Map(),
            timeout_waiters: new Map(),
            timeout_cancel_callbacks: new Map(),
            intervals: new Map(),
            next_id: 1,
        };

        states.set(owner, state);
    }

    return state;
};

/**
 * Stops every timer of the owner. Waiters are dropped without being resolved.
 */
export const dispose_timers = (owner: object): void => {
    const state = states.get(owner);
    if (!state) {
        return;
    }

    for (const interval of state.intervals.values()) {
        clearInterval(interval);
    }

    for (const timeout of state.timeouts.values()) {
        clearTimeout(timeout);
    }

    states.delete(owner);
};

on_local_owner_dispose(dispose_timers);

export const create_timeout = define_local("timers.create_timeout", function (this: object, callback: () => void, delay: number, on_cancel?: () => void): number {
    const state = state_of(this);
    const id = state.next_id++;

    state.timeouts.set(id, setTimeout(() => {
        state.timeouts.delete(id);

        // resolve any waiters
        const waiters = state.timeout_waiters.get(id);
        if (waiters) {
            for (const resolve of waiters) {
                resolve(true);
            }

            state.timeout_waiters.delete(id);
        }

        callback();

        if (on_cancel) {
            state.timeout_cancel_callbacks.delete(id);
        }
    }, delay));

    if (on_cancel) {
        state.timeout_cancel_callbacks.set(id, on_cancel);
    }

    return id;
});

export const cancel_timeout = define_local("timers.cancel_timeout", function (this: object, id: number): void {
    const state = state_of(this);
    const timeout = state.timeouts.get(id);
    if (timeout === undefined) {
        return;
    }

    clearTimeout(timeout);
    state.timeouts.delete(id);

    // resolve any waiters as cancelled
    const waiters = state.timeout_waiters.get(id);
    if (waiters) {
        for (const resolve of waiters) {
            resolve(false);
        }

        state.timeout_waiters.delete(id);
    }

    // call cancel callback if exists
    const cancel_callback = state.timeout_cancel_callbacks.get(id);
    if (cancel_callback) {
        cancel_callback();
        state.timeout_cancel_callbacks.delete(id);
    }
});

export const has_timeout = define_local("timers.has_timeout", function (this: object, id: number): boolean {
    return state_of(this).timeouts.has(id);
});

export const wait_for_timeout = define_local("timers.wait_for_timeout", function (this: object, id: number): Promise<boolean> {
    const state = state_of(this);

    if (!state.timeouts.has(id)) {
        return Promise.reject(new Error(`Timeout ID ${id} does not exist.`));
    }

    return new Promise<boolean>((resolve) => {
        let waiters = state.timeout_waiters.get(id);
        if (!waiters) {
            waiters = new Set();
            state.timeout_waiters.set(id, waiters);
        }

        waiters.add(resolve);
    });
});

export const create_interval = define_local("timers.create_interval", function (this: object, callback: () => void, interval: number): number {
    const state = state_of(this);
    const id = state.next_id++;

    state.intervals.set(id, setInterval(callback, interval));
    return id;
});

export const has_interval = define_local("timers.has_interval", function (this: object, id: number): boolean {
    return state_of(this).intervals.has(id);
});

export const clear_interval = define_local("timers.clear_interval", function (this: object, id: number): void {
    const state = state_of(this);
    const interval = state.intervals.get(id);

    if (interval !== undefined) {
        clearInterval(interval);
        state.intervals.delete(id);
    }
});
