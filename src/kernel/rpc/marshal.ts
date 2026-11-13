import type {CallbackMarker, HandleMarker, SerialisedError, WireValue} from "./protocol";

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

const is_plain_object = (value: object): boolean => {
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
};

const is_marker = (value: object): value is CallbackMarker | HandleMarker => {
    const tag = (value as { $rpc?: unknown }).$rpc;
    return tag === "callback" || tag === "handle";
};

export const marshal = (value: unknown, hooks: MarshalHooks): WireValue => {
    // tracks objects already copied, so shared references and cycles survive like they would with structured clone
    const copies = new Map<object, WireValue>();

    const walk = (current: unknown): WireValue => {
        switch (typeof current) {
            case "string":
            case "number":
            case "boolean":
            case "bigint":
            case "undefined":
                return current;
            case "symbol":
                throw new TypeError("Symbols cannot be sent over RPC");
            case "function":
                return hooks.on_function(current as (...args: unknown[]) => unknown);
        }

        if (current === null) {
            return null;
        }

        const obj = current as object;

        const existing = copies.get(obj);
        if (existing !== undefined) {
            return existing;
        }

        const marker = hooks.on_object(obj);
        if (marker !== undefined) {
            copies.set(obj, marker);
            return marker;
        }

        // cloneable natively and can't contain functions or proxies
        if (obj instanceof Date || obj instanceof RegExp || obj instanceof ArrayBuffer || ArrayBuffer.isView(obj) || obj instanceof Error) {
            return obj as WireValue;
        }

        if (Array.isArray(obj)) {
            const array_copy: WireValue[] = [];
            copies.set(obj, array_copy);

            for (const item of obj) {
                array_copy.push(walk(item));
            }

            return array_copy;
        }

        if (obj instanceof Map) {
            const map_copy = new Map<WireValue, WireValue>();
            copies.set(obj, map_copy as unknown as WireValue);

            for (const [key, item] of obj) {
                map_copy.set(walk(key), walk(item));
            }

            return map_copy as unknown as WireValue;
        }

        if (obj instanceof Set) {
            const set_copy = new Set<WireValue>();
            copies.set(obj, set_copy as unknown as WireValue);

            for (const item of obj) {
                set_copy.add(walk(item));
            }

            return set_copy as unknown as WireValue;
        }

        if (!is_plain_object(obj)) {
            throw new TypeError(`Cannot send an instance of ${obj.constructor?.name ?? "an unknown class"} over RPC`);
        }

        if (is_marker(obj)) {
            throw new TypeError("Objects with a $rpc field cannot be sent over RPC");
        }

        const object_copy: { [key: string]: WireValue } = {};
        copies.set(obj, object_copy);

        for (const [key, item] of Object.entries(obj)) {
            object_copy[key] = walk(item);
        }

        return object_copy;
    };

    return walk(value);
};

export const unmarshal = (value: WireValue, hooks: UnmarshalHooks): unknown => {
    const originals = new Map<object, unknown>();

    const walk = (current: WireValue): unknown => {
        if (current === null || typeof current !== "object") {
            return current;
        }

        const existing = originals.get(current);
        if (existing !== undefined) {
            return existing;
        }

        if (current instanceof Date || current instanceof RegExp || current instanceof ArrayBuffer || ArrayBuffer.isView(current) || current instanceof Error) {
            return current;
        }

        if (Array.isArray(current)) {
            const array_result: unknown[] = [];
            originals.set(current, array_result);

            for (const item of current) {
                array_result.push(walk(item));
            }

            return array_result;
        }

        if (current instanceof Map) {
            const map_result = new Map<unknown, unknown>();
            originals.set(current, map_result);

            for (const [key, item] of current as Map<WireValue, WireValue>) {
                map_result.set(walk(key), walk(item));
            }

            return map_result;
        }

        if (current instanceof Set) {
            const set_result = new Set<unknown>();
            originals.set(current, set_result);

            for (const item of current as Set<WireValue>) {
                set_result.add(walk(item));
            }

            return set_result;
        }

        if (is_marker(current)) {
            const resolved = current.$rpc === "callback"
                ? hooks.on_callback(current as CallbackMarker)
                : hooks.on_handle(current as HandleMarker);

            originals.set(current, resolved);
            return resolved;
        }

        const object_result: { [key: string]: unknown } = {};
        originals.set(current, object_result);

        for (const [key, item] of Object.entries(current)) {
            object_result[key] = walk(item);
        }

        return object_result;
    };

    return walk(value);
};

export type ErrorConstructorMap = Record<string, abstract new (...args: never[]) => Error>;

/**
 * Converts an error to plain data. Known error classes are named by their key in the map, since class names don't survive minification.
 */
export const serialise_error = (error: unknown, known_errors: ErrorConstructorMap = {}): SerialisedError => {
    if (!(error instanceof Error)) {
        return {
            name: "Error",
            message: String(error),
        };
    }

    const known_name = Object.keys(known_errors).find((name) => error instanceof known_errors[name]);

    return {
        name: known_name ?? error.name,
        message: error.message,
        stack: error.stack,
    };
};

/**
 * Rebuilds an error, using a known class for its name when one is given so instanceof checks keep working.
 * The constructor isn't called, since known errors build their own message from different arguments.
 */
export const deserialise_error = (serialised: SerialisedError, known_errors: ErrorConstructorMap = {}): Error => {
    const ErrorClass = Object.hasOwn(known_errors, serialised.name) ? known_errors[serialised.name] : Error;
    const error = Object.create(ErrorClass.prototype) as Error;

    error.name = serialised.name;
    error.message = serialised.message;
    if (serialised.stack) {
        error.stack = serialised.stack;
    }

    return error;
};
