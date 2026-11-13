import {extract_schema, type APISchema} from "./schema";
import {get_registered_proxy, is_userspace_proxy, type ProxyAnnotations} from "./registry";
import {on_mirror_change} from "./mirroring";
import {marshal, unmarshal, serialise_error, deserialise_error, type ErrorConstructorMap, type MarshalHooks, type UnmarshalHooks} from "./marshal";
import {
    RPC_PROTOCOL_VERSION,
    type CallbackID,
    type HandleDescriptor,
    type HandleID,
    type InvocationID,
    type RPCKernelToProgramMessage,
    type RPCProgramToKernelMessage,
    type SerialisedError,
    type WireValue,
} from "./protocol";
import type {RPCEndpoint} from "./transport";

export type KernelEndpoint = RPCEndpoint<RPCKernelToProgramMessage, RPCProgramToKernelMessage>;

export interface RPCSessionOptions {
    on_exit(exit_code: number, error?: SerialisedError): void;
    known_errors?: ErrorConstructorMap;
}

interface HandleEntry {
    proxy: object;
    schema: APISchema;
    annotations: ProxyAnnotations;

    /** Last wire value sent for each mirrored member, to send only what changed. */
    last_mirrored: Map<string, WireValue>;
    unsubscribers: (() => void)[];
}

interface PendingInvocation {
    resolve(value: unknown): void;
    reject(error: Error): void;
}

type Callable = (...args: unknown[]) => unknown;

const wire_equal = (left: unknown, right: unknown): boolean => {
    if (Object.is(left, right)) {
        return true;
    }

    if (typeof left !== "object" || typeof right !== "object" || left === null || right === null) {
        return false;
    }

    if (Object.getPrototypeOf(left) !== Object.getPrototypeOf(right)) {
        return false;
    }

    if (left instanceof Date) {
        return left.getTime() === (right as Date).getTime();
    }

    if (left instanceof RegExp) {
        return left.source === (right as RegExp).source && left.flags === (right as RegExp).flags;
    }

    if (Array.isArray(left)) {
        const right_array = right as unknown[];
        return left.length === right_array.length && left.every((item, index) => wire_equal(item, right_array[index]));
    }

    if (left instanceof Map) {
        const right_map = right as Map<unknown, unknown>;
        if (left.size !== right_map.size) {
            return false;
        }

        for (const [key, value] of left) {
            if (!right_map.has(key) || !wire_equal(value, right_map.get(key))) {
                return false;
            }
        }

        return true;
    }

    if (left instanceof Set) {
        const right_set = right as Set<unknown>;
        return left.size === right_set.size && [...left].every((item) => right_set.has(item));
    }

    const left_keys = Object.keys(left);
    const right_keys = Object.keys(right);

    return left_keys.length === right_keys.length
        && left_keys.every((key) => Object.hasOwn(right, key) && wire_equal((left as Record<string, unknown>)[key], (right as Record<string, unknown>)[key]));
};

const is_id = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value);

// only the envelope is checked here. argument contents are checked by marshalling and by the proxies themselves
const is_valid_message = (message: unknown): message is RPCProgramToKernelMessage => {
    if (typeof message !== "object" || message === null) {
        return false;
    }

    const candidate = message as Record<string, unknown>;

    switch (candidate.type) {
        case "call":
            return is_id(candidate.call_id) && is_id(candidate.handle_id) && typeof candidate.member === "string" && Array.isArray(candidate.args);
        case "get":
            return is_id(candidate.call_id) && is_id(candidate.handle_id) && typeof candidate.member === "string";
        case "set":
            return is_id(candidate.call_id) && is_id(candidate.handle_id) && typeof candidate.member === "string" && "value" in candidate;
        case "release":
            return (candidate.target === "handle" || candidate.target === "callback") && is_id(candidate.id);
        case "callback_result":
            return is_id(candidate.invocation_id) && "value" in candidate;
        case "callback_error":
            return is_id(candidate.invocation_id) && typeof candidate.error === "object" && candidate.error !== null;
        case "exit":
            return typeof candidate.exit_code === "number";
        default:
            return false;
    }
};

/**
 * The kernel side of one process's RPC connection. Owns the handles and callbacks the process can use, and keeps its mirrored values up to date.
 */
export class RPCSession {
    readonly #endpoint: KernelEndpoint;
    readonly #options: RPCSessionOptions;
    readonly #stop_listening: () => void;

    readonly #handles = new Map<HandleID, HandleEntry>();
    readonly #handle_ids = new Map<object, HandleID>();
    #next_handle_id = 1;

    readonly #callbacks = new Map<CallbackID, Callable>();
    readonly #released_callbacks = new Set<CallbackID>();

    readonly #pending_invocations = new Map<InvocationID, PendingInvocation>();
    #next_invocation_id = 1;

    #disposed = false;

    constructor(endpoint: KernelEndpoint, options: RPCSessionOptions) {
        this.#endpoint = endpoint;
        this.#options = options;
        this.#stop_listening = endpoint.listen((message) => this.#handle_message(message));
    }

    get disposed(): boolean {
        return this.#disposed;
    }

    /**
     * Sends the init message. The data should already contain only what the program may have: proxies, plain data, and a shell rpc proxy if any.
     */
    start(program_name: string, data: Record<string, unknown>): void {
        const handles: HandleDescriptor[] = [];
        const wire_data = marshal(data, this.#outgoing_hooks(handles));

        this.#send({
            type: "init",
            protocol_version: RPC_PROTOCOL_VERSION,
            program_name,
            data: wire_data,
            handles,
        });
    }

    /**
     * Tells the program a handle is gone (e.g. its socket closed) and stops tracking it.
     */
    revoke(proxy: object): void {
        const handle_id = this.#handle_ids.get(proxy);
        if (handle_id === undefined) {
            return;
        }

        this.#release_handle(handle_id);
        this.#send({ type: "handle_revoked", handle_id });
    }

    dispose(): void {
        if (this.#disposed) {
            return;
        }

        this.#disposed = true;
        this.#stop_listening();

        for (const entry of this.#handles.values()) {
            for (const unsubscribe of entry.unsubscribers) {
                unsubscribe();
            }
        }

        this.#handles.clear();
        this.#handle_ids.clear();
        this.#callbacks.clear();

        // kernel code awaiting a callback from a dead program carries on as if it returned nothing
        for (const pending of this.#pending_invocations.values()) {
            pending.resolve(undefined);
        }

        this.#pending_invocations.clear();
    }

    #send(message: RPCKernelToProgramMessage): void {
        if (!this.#disposed) {
            this.#endpoint.send(message);
        }
    }

    // marshalling hooks per direction

    #outgoing_hooks(new_descriptors: HandleDescriptor[]): MarshalHooks {
        return {
            on_function: () => {
                throw new TypeError("Functions cannot be sent to programs over RPC yet");
            },
            on_object: (obj) => {
                if (!is_userspace_proxy(obj)) {
                    return undefined;
                }

                return { $rpc: "handle", id: this.#register(obj, new_descriptors) };
            },
        };
    }

    // mirrored values must be plain data, since mirror messages can't introduce new handles
    readonly #plain_hooks: MarshalHooks = {
        on_function: () => {
            throw new TypeError("Mirrored values cannot contain functions");
        },
        on_object: (obj) => {
            if (is_userspace_proxy(obj)) {
                throw new TypeError("Mirrored values cannot contain proxies");
            }

            return undefined;
        },
    };

    readonly #incoming_hooks: UnmarshalHooks = {
        on_callback: (marker) => this.#stand_in_for(marker.id),
        on_handle: (marker) => {
            const entry = this.#handles.get(marker.id);
            if (!entry) {
                throw new ReferenceError(`Unknown handle ${marker.id}`);
            }

            return entry.proxy;
        },
    };

    // handle mapping

    #register(proxy: object, new_descriptors: HandleDescriptor[]): HandleID {
        const existing = this.#handle_ids.get(proxy);
        if (existing !== undefined) {
            return existing;
        }

        const registered = get_registered_proxy(proxy);
        if (!registered) {
            throw new TypeError("Only registered userspace proxies can become handles");
        }

        const handle_id = this.#next_handle_id++;

        const entry: HandleEntry = {
            proxy,
            schema: extract_schema(proxy),
            annotations: registered.annotations,
            last_mirrored: new Map(),
            unsubscribers: [],
        };

        // stored before describing so eager handles that point back here don't recurse forever
        this.#handles.set(handle_id, entry);
        this.#handle_ids.set(proxy, handle_id);

        const values: Record<string, WireValue> = {};
        const eager: Record<string, HandleID | null> = {};

        for (const [member, annotation] of Object.entries(entry.annotations)) {
            switch (annotation) {
                case "constant": {
                    values[member] = marshal(this.#read_member(entry, member), this.#outgoing_hooks(new_descriptors));
                    break;
                }
                case "mirrored": {
                    const value = marshal(this.#read_member(entry, member), this.#plain_hooks);
                    values[member] = value;
                    entry.last_mirrored.set(member, value);
                    break;
                }
                case "eager_handle": {
                    const target = this.#read_member(entry, member);

                    if (target === null || target === undefined) {
                        eager[member] = null;
                    } else if (is_userspace_proxy(target)) {
                        eager[member] = this.#register(target, new_descriptors);
                    } else {
                        throw new TypeError(`Eager handle member "${member}" did not return a proxy`);
                    }

                    break;
                }
            }
        }

        new_descriptors.push({
            id: handle_id,
            schema: entry.schema,
            annotations: entry.annotations,
            values,
            eager,
        });

        if (entry.last_mirrored.size > 0) {
            for (const source of registered.sources) {
                entry.unsubscribers.push(on_mirror_change(source, () => this.#refresh(handle_id)));
            }
        }

        return handle_id;
    }

    // annotated members are either properties or methods with no arguments
    #read_member(entry: HandleEntry, member: string): unknown {
        const value = Reflect.get(entry.proxy, member);
        return entry.schema[member]?.kind === "method" ? (value as Callable)() : value;
    }

    #refresh(handle_id: HandleID): void {
        const entry = this.#handles.get(handle_id);
        if (!entry || entry.last_mirrored.size === 0) {
            return;
        }

        const changed: Record<string, WireValue> = {};
        let any_changed = false;

        for (const [member, last_value] of entry.last_mirrored) {
            const value = marshal(this.#read_member(entry, member), this.#plain_hooks);

            if (!wire_equal(value, last_value)) {
                changed[member] = value;
                entry.last_mirrored.set(member, value);
                any_changed = true;
            }
        }

        if (any_changed) {
            this.#send({ type: "mirror", handle_id, values: changed });
        }
    }

    #release_handle(handle_id: HandleID): void {
        const entry = this.#handles.get(handle_id);
        if (!entry) {
            return;
        }

        for (const unsubscribe of entry.unsubscribers) {
            unsubscribe();
        }

        this.#handles.delete(handle_id);
        this.#handle_ids.delete(entry.proxy);
    }

    // callback mapping

    #stand_in_for(callback_id: CallbackID): Callable {
        const existing = this.#callbacks.get(callback_id);
        if (existing) {
            return existing;
        }

        // the same stand-in is reused, so kernel code can remove a listener by identity
        const stand_in: Callable = (...args) => {
            if (this.#disposed || this.#released_callbacks.has(callback_id)) {
                return Promise.resolve(undefined);
            }

            const handles: HandleDescriptor[] = [];
            const wire_args = args.map((arg) => marshal(arg, this.#outgoing_hooks(handles)));
            const invocation_id = this.#next_invocation_id++;

            return new Promise((resolve, reject) => {
                this.#pending_invocations.set(invocation_id, { resolve, reject });

                this.#send({
                    type: "callback",
                    callback_id,
                    args: wire_args,
                    invocation_id,
                    ...(handles.length > 0 ? { handles } : {}),
                });
            });
        };

        this.#callbacks.set(callback_id, stand_in);
        return stand_in;
    }

    #settle_invocation(invocation_id: InvocationID, settle: (pending: PendingInvocation) => void): void {
        const pending = this.#pending_invocations.get(invocation_id);
        if (!pending) {
            return;
        }

        this.#pending_invocations.delete(invocation_id);
        settle(pending);
    }

    // incoming message handling

    #handle_message(message: unknown): void {
        if (this.#disposed) {
            return;
        }

        if (!is_valid_message(message)) {
            console.warn("RPC session received an invalid message:", message);
            return;
        }

        switch (message.type) {
            case "call":
            case "get":
            case "set":
                this.#dispatch(message).catch((error) => {
                    console.error("RPC session failed to reply:", error);
                });
                break;
            case "release":
                if (message.target === "handle") {
                    this.#release_handle(message.id);
                } else {
                    this.#released_callbacks.add(message.id);
                    this.#callbacks.delete(message.id);
                }
                break;
            case "callback_result": {
                const value = unmarshal(message.value, this.#incoming_hooks);
                this.#settle_invocation(message.invocation_id, (pending) => pending.resolve(value));
                break;
            }
            case "callback_error":
                this.#settle_invocation(message.invocation_id, (pending) => pending.reject(deserialise_error(message.error, this.#options.known_errors)));
                break;
            case "exit":
                this.#options.on_exit(message.exit_code, message.error);
                this.dispose();
                break;
        }
    }

    async #dispatch(message: Extract<RPCProgramToKernelMessage, { type: "call" | "get" | "set" }>): Promise<void> {
        const { call_id, handle_id, member } = message;

        try {
            const entry = this.#handles.get(handle_id);
            if (!entry) {
                throw new ReferenceError(`Unknown handle ${handle_id}`);
            }

            // the schema only contains the proxy's own members, so nothing inherited can be reached
            const member_schema = entry.schema[member];
            if (!member_schema) {
                throw new TypeError(`No member "${member}" on handle ${handle_id}`);
            }

            let result: unknown;

            switch (message.type) {
                case "call": {
                    if (member_schema.kind !== "method") {
                        throw new TypeError(`"${member}" is not a method`);
                    }

                    const args = message.args.map((arg) => unmarshal(arg, this.#incoming_hooks));
                    result = await (Reflect.get(entry.proxy, member) as Callable)(...args);
                    break;
                }
                case "get": {
                    if (member_schema.kind !== "property") {
                        throw new TypeError(`"${member}" is not a property`);
                    }

                    result = Reflect.get(entry.proxy, member);
                    break;
                }
                case "set": {
                    if (member_schema.kind !== "property" || !member_schema.writable) {
                        throw new TypeError(`"${member}" is not a writable property`);
                    }

                    Reflect.set(entry.proxy, member, unmarshal(message.value, this.#incoming_hooks));
                    result = undefined;
                    break;
                }
            }

            // send the called handle's own mirror changes before the result, so the program never reads a stale value after awaiting
            this.#refresh(handle_id);

            const handles: HandleDescriptor[] = [];
            const value = marshal(result, this.#outgoing_hooks(handles));

            this.#send({
                type: "result",
                call_id,
                value,
                ...(handles.length > 0 ? { handles } : {}),
            });
        } catch (error) {
            this.#send({ type: "error", call_id, error: serialise_error(error, this.#options.known_errors) });
        }
    }
}
