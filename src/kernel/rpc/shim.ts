import {
    RPC_PROTOCOL_VERSION,
    type CallbackID,
    type CallID,
    type HandleDescriptor,
    type HandleID,
    type RPCCallbackMessage,
    type RPCInitMessage,
    type RPCKernelToProgramMessage,
    type RPCMirrorMessage,
    type RPCProgramToKernelMessage,
    type WireValue,
} from "./protocol";
import type {RPCEndpoint} from "./transport";
import {
    deserialise_error,
    marshal,
    serialise_error,
    unmarshal,
    type ErrorConstructorMap,
    type MarshalHooks,
    type UnmarshalHooks,
} from "./marshal";
import {dispose_local_owner, get_local} from "../../lib/locals";
import type {ProgramMainData} from "../../types";

export type ProgramEndpoint = RPCEndpoint<RPCProgramToKernelMessage, RPCKernelToProgramMessage>;

export type ProgramMain = (data: ProgramMainData) => Promise<number> | number;

export interface RPCShimOptions {
    known_errors?: ErrorConstructorMap;
}

type Stub = Readonly<Record<string, unknown>>;
type Callable = (...args: unknown[]) => unknown;

interface PendingCall {
    resolve(value: unknown): void;
    reject(error: Error): void;
}

/**
 * The program side of an RPC connection. Builds stubs from the kernel's descriptors and runs the program against them.
 */
export class RPCShim {
    readonly #endpoint: ProgramEndpoint;
    readonly #options: RPCShimOptions;
    readonly #stop_listening: () => void;

    readonly #init: Promise<RPCInitMessage>;
    #resolve_init: ((message: RPCInitMessage) => void) | null = null;
    #reject_init: ((error: Error) => void) | null = null;

    readonly #descriptors = new Map<HandleID, HandleDescriptor>();
    readonly #mirrors = new Map<HandleID, Map<string, unknown>>();
    readonly #revoked = new Set<HandleID>();

    readonly #stubs = new Map<HandleID, Stub>();
    readonly #stub_ids = new WeakMap<Stub, HandleID>();

    readonly #pending_calls = new Map<CallID, PendingCall>();
    #next_call_id = 1;

    readonly #callback_ids = new WeakMap<Callable, CallbackID>();
    readonly #callbacks = new Map<CallbackID, Callable>();
    #next_callback_id = 1;


    #finished = false;

    constructor(endpoint: ProgramEndpoint, options: RPCShimOptions = {}) {
        this.#endpoint = endpoint;
        this.#options = options;

        this.#init = new Promise((resolve, reject) => {
            this.#resolve_init = resolve;
            this.#reject_init = reject;
        });

        this.#stop_listening = endpoint.listen((message) => this.#handle_message(message));
    }

    wait_for_init(): Promise<RPCInitMessage> {
        return this.#init;
    }

    /**
     * Waits for init, runs the program's main against the stubs, then reports the exit code to the kernel.
     */
    async run(main: ProgramMain): Promise<void> {
        const init = await this.wait_for_init();
        const data = unmarshal(init.data, this.#incoming_hooks) as ProgramMainData;

        try {
            const exit_code = await main(data);
            this.#exit(typeof exit_code === "number" ? exit_code : 0);
        } catch (error) {
            this.#exit(1, error);
        }
    }

    #exit(exit_code: number, error?: unknown): void {
        if (this.#finished) {
            return;
        }

        this.#finished = true;

        this.#send({
            type: "exit",
            exit_code,
            ...(error === undefined ? {} : { error: serialise_error(error, this.#options.known_errors) }),
        });

        this.#stop_listening();

        // e.g. stops timers the program started through its process stub
        for (const stub of this.#stubs.values()) {
            dispose_local_owner(stub);
        }

        for (const pending of this.#pending_calls.values()) {
            pending.reject(new Error("Program has exited"));
        }

        this.#pending_calls.clear();
    }

    #send(message: RPCProgramToKernelMessage): void {
        this.#endpoint.send(message);
    }

    // marshalling hooks

    readonly #outgoing_hooks: MarshalHooks = {
        on_function: (fn) => {
            let callback_id = this.#callback_ids.get(fn);

            if (callback_id === undefined) {
                callback_id = this.#next_callback_id++;
                this.#callback_ids.set(fn, callback_id);
                this.#callbacks.set(callback_id, fn);
            }

            return { $rpc: "callback", id: callback_id };
        },
        on_object: (obj) => {
            const handle_id = this.#stub_ids.get(obj as Stub);
            return handle_id === undefined ? undefined : { $rpc: "handle", id: handle_id };
        },
    };

    readonly #incoming_hooks: UnmarshalHooks = {
        on_callback: () => {
            throw new TypeError("The kernel cannot send functions to programs");
        },
        on_handle: (marker) => this.#stub_for(marker.id),
    };

    // descriptors and mirrors

    #add_descriptors(handles: HandleDescriptor[] | undefined): void {
        for (const descriptor of handles ?? []) {
            this.#descriptors.set(descriptor.id, descriptor);

            const mirrored_values = new Map<string, unknown>();
            for (const [member, annotation] of Object.entries(descriptor.annotations)) {
                if (annotation === "mirrored") {
                    mirrored_values.set(member, descriptor.values[member]);
                }
            }

            if (mirrored_values.size > 0) {
                this.#mirrors.set(descriptor.id, mirrored_values);
            }
        }
    }

    #apply_mirror(message: RPCMirrorMessage): void {
        const mirrored_values = this.#mirrors.get(message.handle_id);
        if (!mirrored_values) {
            return;
        }

        for (const [member, value] of Object.entries(message.values)) {
            mirrored_values.set(member, value);
        }
    }

    #set_mirrored(handle_id: HandleID, member: string, value: unknown): void {
        // update locally first so the program reads its own write straight away; the kernel's mirror message confirms or corrects it
        this.#mirrors.get(handle_id)?.set(member, value);
        this.#set(handle_id, member, value);
    }

    // stubs

    #stub_for(handle_id: HandleID): Stub {
        const existing = this.#stubs.get(handle_id);
        if (existing) {
            return existing;
        }

        const descriptor = this.#descriptors.get(handle_id);
        if (!descriptor) {
            throw new ReferenceError(`No descriptor for handle ${handle_id}`);
        }

        const stub = this.#build_stub(descriptor);
        this.#stubs.set(handle_id, stub);
        this.#stub_ids.set(stub, handle_id);

        return stub;
    }

    #build_stub(descriptor: HandleDescriptor): Stub {
        const handle_id = descriptor.id;
        const stub = Object.create(null);
        const properties: PropertyDescriptorMap = {};

        for (const [member, member_schema] of Object.entries(descriptor.schema)) {
            const is_method = member_schema.kind === "method";
            const is_writable = member_schema.kind === "property" && member_schema.writable;
            const annotation = descriptor.annotations[member];

            if (typeof annotation === "object") {
                const implementation = get_local(annotation.local);
                if (!implementation) {
                    throw new Error(`No local function defined as "${annotation.local}"`);
                }

                // called with the stub as this, so it can read other members (e.g. absolute reads get_cwd)
                properties[member] = is_method
                    ? { value: (...args: unknown[]) => implementation.apply(stub, args), enumerable: true }
                    : { get: () => implementation.call(stub), enumerable: true };
                continue;
            }

            switch (annotation) {
                case "constant": {
                    const value = unmarshal(descriptor.values[member], this.#incoming_hooks);

                    properties[member] = is_method
                        ? { value: () => value, enumerable: true }
                        : { get: () => value, enumerable: true };
                    break;
                }
                case "mirrored": {
                    const read = () => this.#mirrors.get(handle_id)?.get(member);

                    properties[member] = is_method
                        ? { value: read, enumerable: true }
                        : {
                            get: read,
                            ...(is_writable ? { set: (value: unknown) => this.#set_mirrored(handle_id, member, value) } : {}),
                            enumerable: true,
                        };
                    break;
                }
                case "eager_handle": {
                    const target_id = descriptor.eager[member];
                    const read = () => target_id === null ? null : this.#stub_for(target_id);

                    properties[member] = is_method
                        ? { value: read, enumerable: true }
                        : { get: read, enumerable: true };
                    break;
                }
                default:
                    properties[member] = is_method
                        ? { value: (...args: unknown[]) => this.#call(handle_id, member, args), enumerable: true }
                        : {
                            get: () => this.#get(handle_id, member),
                            ...(is_writable ? { set: (value: unknown) => this.#set(handle_id, member, value) } : {}),
                            enumerable: true,
                        };
                    break;
            }
        }

        Object.defineProperties(stub, properties);
        return Object.freeze(stub);
    }

    // calls

    #request(handle_id: HandleID, build: (call_id: CallID) => RPCProgramToKernelMessage): Promise<unknown> {
        if (this.#finished) {
            return Promise.reject(new Error("Program has exited"));
        }

        if (this.#revoked.has(handle_id)) {
            return Promise.reject(new Error(`Handle ${handle_id} has been revoked by the kernel`));
        }

        const call_id = this.#next_call_id++;

        return new Promise((resolve, reject) => {
            this.#pending_calls.set(call_id, { resolve, reject });
            this.#send(build(call_id));
        });
    }

    #call(handle_id: HandleID, member: string, args: unknown[]): Promise<unknown> {
        const wire_args = args.map((arg) => marshal(arg, this.#outgoing_hooks));
        return this.#request(handle_id, (call_id) => ({ type: "call", call_id, handle_id, member, args: wire_args }));
    }

    #get(handle_id: HandleID, member: string): Promise<unknown> {
        return this.#request(handle_id, (call_id) => ({ type: "get", call_id, handle_id, member }));
    }

    // setters can't return a promise to the program, so failures are only logged
    #set(handle_id: HandleID, member: string, value: unknown): void {
        const wire_value = marshal(value, this.#outgoing_hooks);

        this.#request(handle_id, (call_id) => ({ type: "set", call_id, handle_id, member, value: wire_value }))
            .catch((error) => console.error(`Failed to set "${member}":`, error));
    }

    #settle_call(call_id: CallID, settle: (pending: PendingCall) => void): void {
        const pending = this.#pending_calls.get(call_id);
        if (!pending) {
            return;
        }

        this.#pending_calls.delete(call_id);
        settle(pending);
    }

    // callbacks

    async #invoke_callback(message: RPCCallbackMessage): Promise<void> {
        this.#add_descriptors(message.handles);

        const { callback_id, invocation_id } = message;
        const callback = this.#callbacks.get(callback_id);

        try {
            if (!callback) {
                throw new ReferenceError(`Unknown callback ${callback_id}`);
            }

            const args = message.args.map((arg) => unmarshal(arg, this.#incoming_hooks));
            const result = await callback(...args);

            if (invocation_id !== undefined) {
                this.#send({ type: "callback_result", invocation_id, value: marshal(result, this.#outgoing_hooks) });
            }
        } catch (error) {
            if (invocation_id !== undefined) {
                this.#send({ type: "callback_error", invocation_id, error: serialise_error(error, this.#options.known_errors) });
            } else {
                console.error("Callback failed:", error);
            }
        }
    }

    // incoming messages

    #handle_message(message: RPCKernelToProgramMessage): void {
        if (message.type === "init") {
            this.#receive_init(message);
            return;
        }

        if (this.#resolve_init) {
            console.warn("RPC shim received a message before init:", message);
            return;
        }

        switch (message.type) {
            case "result": {
                this.#add_descriptors(message.handles);

                // unmarshalling can fail (e.g. a missing descriptor), which should reject the call rather than throw here
                let value: unknown;
                try {
                    value = unmarshal(message.value as WireValue, this.#incoming_hooks);
                } catch (error) {
                    this.#settle_call(message.call_id, (pending) => pending.reject(error as Error));
                    break;
                }

                this.#settle_call(message.call_id, (pending) => pending.resolve(value));
                break;
            }
            case "error":
                this.#settle_call(message.call_id, (pending) => pending.reject(deserialise_error(message.error, this.#options.known_errors)));
                break;
            case "callback":
                this.#invoke_callback(message).catch((error) => console.error("Failed to run callback:", error));
                break;
            case "mirror":
                this.#apply_mirror(message);
                break;
            case "handle_revoked":
                this.#revoked.add(message.handle_id);
                break;
        }
    }

    #receive_init(message: RPCInitMessage): void {
        const resolve = this.#resolve_init;
        const reject = this.#reject_init;

        if (!resolve || !reject) {
            console.warn("RPC shim received a second init message");
            return;
        }

        this.#resolve_init = null;
        this.#reject_init = null;

        if (message.protocol_version !== RPC_PROTOCOL_VERSION) {
            const error = new Error(`Kernel speaks RPC protocol ${message.protocol_version}, this program expects ${RPC_PROTOCOL_VERSION}`);

            this.#send({type: "exit", exit_code: 1, error: {name: error.name, message: error.message}});
            this.#stop_listening();
            reject(error);
            return;
        }

        this.#add_descriptors(message.handles);
        resolve(message);
    }
}
