export type SocketDataListener = (data: Uint8Array) => void | Promise<void>;
export type SocketCloseListener = () => void | Promise<void>;

export type UserspaceSocketConnectionListener = (client: UserspaceClientSocket) => void | Promise<void>;
export type SocketConnectionListener = (client: AbstractClientSocket) => void | Promise<void>;

export type ClientSocketEvent = "data" | "close";
export type ServerSocketEvent = "connection" | "close";

export type ClientSocketEventListener = SocketDataListener | SocketCloseListener;
export type ServerSocketEventListener = UserspaceSocketConnectionListener | SocketCloseListener;
export type SocketEventListener = ClientSocketEventListener | ServerSocketEventListener;

export type UserspaceClientSocketEventListener = SocketDataListener | SocketCloseListener;
export type UserspaceServerSocketEventListener = UserspaceSocketConnectionListener | SocketCloseListener;
export type UserspaceSocketEventListener = UserspaceClientSocketEventListener | UserspaceServerSocketEventListener;

// TODO: doc this
// in short impls need to care about data flow and ensuring that errors in listeners dont crash anything

export enum SocketReadyState {
    CONNECTING,
    OPEN,
    CLOSING,
    CLOSED,
}

export class PortInUseError extends Error {
    constructor(port: number) {
        super(`Port ${port} is already in use`);
        this.name = "PortInUseError";
    }
}

export interface UserspaceClientSocket {
    readonly id: string;
    readonly ready_state: SocketReadyState;

    add_event_listener(event: "data", callback: SocketDataListener): void;
    add_event_listener(event: "close", callback: SocketCloseListener): void;

    remove_event_listener(event: "data", callback: SocketDataListener): void;
    remove_event_listener(event: "close", callback: SocketCloseListener): void;

    send(data: Uint8Array | string): Promise<void>;
    close(): Promise<void>;
}

export abstract class AbstractClientSocket {
    readonly id: string;
    ready_state: SocketReadyState = SocketReadyState.CONNECTING;

    // the implementation needs to invoke these when data is received
    protected readonly _data_listeners: Set<SocketDataListener> = new Set();

    // the implementation doesnt need to bother with close listeners, it's handled here
    readonly #close_listeners: Set<SocketCloseListener> = new Set();

    protected constructor(id: string) {
        this.id = id;
    }

    add_event_listener(event: ClientSocketEvent, callback: ClientSocketEventListener): void {
        switch (event) {
            case "data":
                this._data_listeners.add(callback as SocketDataListener);
                break;
            case "close":
                this.#close_listeners.add(callback as SocketCloseListener);
                break;
        }
    }

    remove_event_listener(event: ClientSocketEvent, callback: ClientSocketEventListener): void {
        switch (event) {
            case "data":
                this._data_listeners.delete(callback as SocketDataListener);
                break;
            case "close":
                this.#close_listeners.delete(callback as SocketCloseListener);
                break;
        }
    }

    protected abstract _handle_send_internal(data: Uint8Array): Promise<void>;

    async send(data: Uint8Array | string): Promise<void> {
        if (this.ready_state !== SocketReadyState.OPEN) {
            throw new Error("Cannot send data on a socket that is not open");
        }

        const uint8_data = typeof data === "string" ? new TextEncoder().encode(data) : data;
        await this._handle_send_internal(uint8_data);
    }

    protected abstract _handle_close_internal(): Promise<void>;

    async close(): Promise<void> {
        if (this.ready_state === SocketReadyState.CLOSING || this.ready_state === SocketReadyState.CLOSED) {
            return;
        }

        this.ready_state = SocketReadyState.CLOSING;
        await this._handle_close_internal();

        // invoke close listeners
        for (const listener of this.#close_listeners) {
            try {
                listener();
            } catch (err) {
                console.error(`Error in socket close listener: ${err}`);
            }
        }

        this.ready_state = SocketReadyState.CLOSED;
    }

    create_userspace_proxy(): UserspaceClientSocket {
        const proxy = {} as UserspaceClientSocket;

        Object.defineProperty(proxy, "id", { get: () => this.id });
        Object.defineProperty(proxy, "ready_state", { get: () => this.ready_state });

        proxy.add_event_listener = (event: ClientSocketEvent, callback: UserspaceClientSocketEventListener) => {
            this.add_event_listener(event, callback);
        };

        proxy.remove_event_listener = (event: ClientSocketEvent, callback: UserspaceClientSocketEventListener) => {
            this.remove_event_listener(event, callback);
        };

        proxy.send = async (data: Uint8Array | string) => {
            return this.send(data);
        };

        proxy.close = async () => {
            return this.close();
        }

        return Object.freeze(proxy);
    }
}

export interface UserspaceServerSocket {
    readonly port: number;

    add_event_listener(event: "connection", callback: UserspaceSocketConnectionListener): void;
    add_event_listener(event: "close", callback: SocketCloseListener): void;

    remove_event_listener(event: "connection", callback: UserspaceSocketConnectionListener): void;
    remove_event_listener(event: "close", callback: SocketCloseListener): void;

    close(): Promise<void>;
}

export abstract class AbstractServerSocket {
    readonly port: number;

    // the implementation needs to invoke these when a new client connects
    protected readonly _connection_listeners: Set<SocketConnectionListener> = new Set();

    // the implementation doesnt need to bother with close listeners, it's handled here
    readonly #close_listeners: Set<SocketCloseListener> = new Set();

    protected constructor(port: number) {
        this.port = port;
    }

    add_event_listener(event: ServerSocketEvent, callback: ServerSocketEventListener): void {
        switch (event) {
            case "connection":
                this._connection_listeners.add(callback as SocketConnectionListener);
                break;
            case "close":
                this.#close_listeners.add(callback as SocketCloseListener);
                break;
        }
    }

    remove_event_listener(event: ServerSocketEvent, callback: ServerSocketEventListener): void {
        switch (event) {
            case "connection":
                this._connection_listeners.delete(callback as SocketConnectionListener);
                break;
            case "close":
                this.#close_listeners.delete(callback as SocketCloseListener);
                break;
        }
    }

    protected abstract _handle_close_internal(): Promise<void>;

    async close(): Promise<void> {
        await this._handle_close_internal();

        // invoke close listeners
        for (const listener of this.#close_listeners) {
            try {
                listener();
            } catch (err) {
                console.error(`Error in server socket close listener: ${err}`);
            }
        }
    }

    create_userspace_proxy(): UserspaceServerSocket {
        const proxy = {} as UserspaceServerSocket;

        Object.defineProperty(proxy, "port", { get: () => this.port });

        const wrapped_listeners = new Map<UserspaceSocketConnectionListener, SocketConnectionListener>();

        proxy.add_event_listener = (event: ServerSocketEvent, callback: UserspaceServerSocketEventListener) => {
            switch (event) {
                case "connection": {
                    const listener: SocketConnectionListener = (client) => {
                        // create a userspace proxy for the client socket before invoking the callback, otherwise the kernel version will be leaked
                        const client_proxy = client.create_userspace_proxy();
                        (callback as UserspaceSocketConnectionListener)(client_proxy);
                    };

                    // store the mapping from the original callback to the wrapped listener so that we can remove it later
                    wrapped_listeners.set(callback, listener);

                    this.add_event_listener("connection", listener);
                    break;
                }
                case "close": {
                    this.add_event_listener("close", callback as SocketCloseListener);
                    break;
                }
            }
        };

        proxy.remove_event_listener = (event: ServerSocketEvent, callback: UserspaceServerSocketEventListener) => {
            switch (event) {
                case "connection": {
                    const listener = wrapped_listeners.get(callback);
                    if (listener) {
                        this.remove_event_listener("connection", listener);
                        wrapped_listeners.delete(callback);
                    }
                    break;
                }
                case "close": {
                    this.remove_event_listener("close", callback as SocketCloseListener);
                    break;
                }
            }
        }

        proxy.close = () => {
            return this.close();
        };

        return Object.freeze(proxy);
    }
}

export interface UserspaceNetworkManager {
    get bound_ports(): number[];
    get_unique_manager_type_name(): string;

    // listen and connect must be done via the pcb in userspace to track ownership
}

export abstract class AbstractNetworkManager {
    readonly #port_map: Map<number, AbstractServerSocket> = new Map();

    get bound_ports(): number[] {
        return Array.from(this.#port_map.keys());
    }

    abstract get_unique_manager_type_name(): string;

    protected abstract _handle_listen_internal(port: number): Promise<AbstractServerSocket>;

    // listen covers both binding and listening
    async listen(port: number): Promise<AbstractServerSocket> {
        if (this.#port_map.has(port)) {
            throw new PortInUseError(port);
        }

        // invoke implementation class to create the server socket, then store it in the port map
        const server_socket = await this._handle_listen_internal(port);
        this.#port_map.set(port, server_socket);

        // remove once the server socket is closed
        server_socket.add_event_listener("close", () => {
            this.#port_map.delete(port);
        });

        return server_socket;
    }

    abstract connect(host: string, port: number): Promise<AbstractClientSocket>;

    create_userspace_proxy(): UserspaceNetworkManager {
        const proxy = {} as UserspaceNetworkManager;

        Object.defineProperty(proxy, "bound_ports", { get: () => this.bound_ports });
        Object.defineProperty(proxy, "get_unique_manager_type_name", { value: () => this.get_unique_manager_type_name(), enumerable: true });

        return Object.freeze(proxy);
    }
}

// TODO: create test program
