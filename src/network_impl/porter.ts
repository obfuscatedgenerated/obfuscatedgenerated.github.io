import {AbstractClientSocket, AbstractNetworkManager, AbstractServerSocket, SocketReadyState} from "../kernel/network";

interface BaseMessage {
    type: string;
}

interface BindMessage extends BaseMessage {
    type: "bind_req";
    port: number;
}

interface UnbindMessage extends BaseMessage {
    type: "unbind_req";
    port: number;
}

interface DataMessage extends BaseMessage {
    type: "data";
    sock_id: string;
    data: string; // base 64
}

interface CloseConnectionMessage extends BaseMessage {
    type: "close_connection";
    sock_id: string;
}

interface ConnectMessage extends BaseMessage {
    type: "connect_req";
    host: string;
    port: number;
    force_sock_id?: string;
}

type OutboundMessage = BindMessage | UnbindMessage | DataMessage | CloseConnectionMessage | ConnectMessage;

interface IncomingConnectionMessage extends BaseMessage {
    type: "incoming_connection";
    port: number;
    sock_id: string;
}

interface ConnectionClosingMessage extends BaseMessage {
    type: "connection_closing";
    port?: number;
    sock_id: string;
}

interface AckMessage extends BaseMessage {
    success: boolean;
    error?: string;
}

interface AckBindMessage extends AckMessage {
    type: "ack_bind";
    port: number;
}

interface AckUnbindMessage extends AckMessage {
    type: "ack_unbind";
    port: number;
}

interface AckCloseConnectionMessage extends AckMessage {
    type: "ack_close_connection";
    sock_id: string;
}

interface AckConnectMessage extends AckMessage {
    type: "ack_connect";
    sock_id: string;
}

type InboundMessage =
    IncomingConnectionMessage
    | ConnectionClosingMessage
    | AckBindMessage
    | AckUnbindMessage
    | DataMessage
    | AckCloseConnectionMessage
    | AckConnectMessage;

const uint8_to_base64 = (data: Uint8Array): string => {
    let binary = "";
    for (let i = 0; i < data.length; i++) {
        binary += String.fromCharCode(data[i]);
    }
    return btoa(binary);
}

export class PorterBridgeClientSocket extends AbstractClientSocket {
    #manager: PorterBridgeNetworkManager;

    constructor(id: string, manager: PorterBridgeNetworkManager) {
        super(id);
        this.#manager = manager;
        this.ready_state = SocketReadyState.OPEN;
    }

    protected async _handle_close_internal(passive: boolean): Promise<void> {
        if (passive) {
            // nothing to do
            return;
        }

        const msg: CloseConnectionMessage = {
            type: "close_connection",
            sock_id: this.id,
        };

        await this.#manager.wait_for_ws_ready();
        this.#manager.ws.send(JSON.stringify(msg));

        // wait for ack
        // TODO: move this to the manager's routing instead for more efficiency
        await new Promise<void>((resolve, reject) => {
            const handler = (event: MessageEvent) => {
                const data = JSON.parse(event.data) as InboundMessage;
                if (data.type === "ack_close_connection" && data.sock_id === this.id) {
                    this.#manager.ws.removeEventListener("message", handler);
                    if (data.success) {
                        resolve();
                    } else {
                        reject(new Error(data.error || "Unknown error closing connection"));
                    }
                }
            };

            this.#manager.ws.addEventListener("message", handler);
        });
    }

    protected async _handle_send_internal(data: Uint8Array): Promise<void> {
        const msg: DataMessage = {
            type: "data",
            sock_id: this.id,
            data: uint8_to_base64(data),
        };

        await this.#manager.wait_for_ws_ready();
        this.#manager.ws.send(JSON.stringify(msg));
    }

    async _handle_incoming_data(data: Uint8Array): Promise<void> {
        // invoke event listeners
        for (const listener of this._data_listeners) {
            try {
                await listener(data);
            } catch (err) {
                console.error("Error in data event listener:", err);
            }
        }
    }
}

export class PorterBridgeServerSocket extends AbstractServerSocket {
    readonly #manager: PorterBridgeNetworkManager;

    constructor(port: number, manager: PorterBridgeNetworkManager) {
        super(port);
        this.#manager = manager;
    }

    protected async _handle_close_internal(): Promise<void> {
        const msg: UnbindMessage = {
            type: "unbind_req",
            port: this.port,
        };

        await this.#manager.wait_for_ws_ready();
        this.#manager.ws.send(JSON.stringify(msg));

        // wait for ack
        // TODO: move this to the manager's routing instead for more efficiency
        await new Promise<void>((resolve, reject) => {
            const handler = (event: MessageEvent) => {
                const data = JSON.parse(event.data) as InboundMessage;
                if (data.type === "ack_unbind" && data.port === this.port) {
                    this.#manager.ws.removeEventListener("message", handler);
                    if (data.success) {
                        resolve();
                    } else {
                        reject(new Error(data.error || "Unknown error unbinding port"));
                    }
                }
            };

            this.#manager.ws.addEventListener("message", handler);
        });
    }

    async _handle_incoming_connection(client: PorterBridgeClientSocket): Promise<void> {
        // invoke event listeners
        for (const listener of this._connection_listeners) {
            try {
                await listener(client);
            } catch (err) {
                console.error("Error in connection event listener:", err);
            }
        }
    }
}

// chrome's local network access permission for 127.0.0.1 / localhost / [::1]
// (don't query the legacy "local-network-access" name, it can crash older chrome renderers)
const LOOPBACK_PERMISSION_NAME = "loopback-network" as PermissionName;

// set after the first successful connection, so browsers without the permission api still auto-connect once opted in
const AUTOCONNECT_STORAGE_KEY = "porter_autoconnect";

const PORTER_URL = "ws://127.0.0.1:9000";
const CONNECT_TIMEOUT_MS = 5000;
// leave time to answer the permission prompt before giving up
const PROMPT_CONNECT_TIMEOUT_MS = 60000;
const MAX_RECONNECT_DELAY_MS = 3000;

type LoopbackPermissionState = PermissionState | "unsupported";

const read_autoconnect_flag = (): boolean => {
    try {
        return localStorage.getItem(AUTOCONNECT_STORAGE_KEY) === "true";
    } catch {
        return false;
    }
}

const write_autoconnect_flag = (): void => {
    try {
        localStorage.setItem(AUTOCONNECT_STORAGE_KEY, "true");
    } catch {
        // storage unavailable, just won't auto-connect next load
    }
}

export class PorterBridgeNetworkManager extends AbstractNetworkManager {
    // sock_id -> client
    readonly #client_map = new Map<string, PorterBridgeClientSocket>();

    #ws: WebSocket | null = null;
    #reconnect_attempts = 0;
    #reconnect_timer: ReturnType<typeof setTimeout> | null = null;
    #permission_state: LoopbackPermissionState = "unsupported";
    #has_connected_this_session = false;

    constructor() {
        super();

        // no connection is made here: connecting to loopback without permission shows the browser's
        // local network prompt, which shouldn't appear just for loading the site
        this.#connect_if_already_allowed();
    }

    get ws(): WebSocket {
        return this.#ws;
    }

    async #connect_if_already_allowed(): Promise<void> {
        try {
            const permission_status = await navigator.permissions.query({ name: LOOPBACK_PERMISSION_NAME });
            this.#permission_state = permission_status.state;

            permission_status.addEventListener("change", () => {
                this.#permission_state = permission_status.state;

                if (permission_status.state === "granted") {
                    this.#ensure_connecting();
                } else if (permission_status.state === "denied") {
                    this.#cancel_reconnect();
                }
            });
        } catch {
            // no local network access permission in this browser (or it doesn't know the name)
            this.#permission_state = "unsupported";
        }

        // querying is silent, so this is the proof of life check that never prompts
        const already_granted = this.#permission_state === "granted";
        const opted_in_without_permission_api = this.#permission_state === "unsupported" && read_autoconnect_flag();

        if (already_granted || opted_in_without_permission_api) {
            this.#ensure_connecting();
        }
    }

    // retrying is only silent once access is granted, otherwise each attempt could re-prompt
    #should_auto_retry(): boolean {
        if (this.#permission_state === "denied") {
            return false;
        }

        return this.#permission_state === "granted" || this.#has_connected_this_session;
    }

    #cancel_reconnect(): void {
        if (this.#reconnect_timer) {
            clearTimeout(this.#reconnect_timer);
            this.#reconnect_timer = null;
        }
    }

    #ensure_connecting(): void {
        if (this.#ws && (this.#ws.readyState === WebSocket.OPEN || this.#ws.readyState === WebSocket.CONNECTING)) {
            return;
        }

        this.#cancel_reconnect();
        this.#connect_to_ws();
    }

    async is_up(try_waiting = false): Promise<boolean> {
        if (this.#ws && this.#ws.readyState === WebSocket.OPEN) {
            return true;
        }

        // waiting means a program explicitly wants the network, so this is allowed to connect (and prompt)
        if (try_waiting) {
            try {
                await this.wait_for_ws_ready();
                return true;
            } catch {
                return false;
            }
        }

        return false;
    }

    // connects on demand. called from explicit actions (listen, connect, is_up(true)), which is when the
    // permission prompt makes sense to the user
    wait_for_ws_ready = async (): Promise<void> => {
        if (this.#permission_state === "denied") {
            throw new Error("Local network access is blocked for this site. Allow it in the site settings to use porter.");
        }

        this.#ensure_connecting();
        const ws = this.#ws;

        if (ws.readyState === WebSocket.OPEN) {
            return;
        }

        const timeout_ms = this.#permission_state === "prompt" ? PROMPT_CONNECT_TIMEOUT_MS : CONNECT_TIMEOUT_MS;

        await new Promise<void>((resolve, reject) => {
            let timeout_id: ReturnType<typeof setTimeout> | null = null;

            const cleanup = () => {
                if (timeout_id) {
                    clearTimeout(timeout_id);
                }

                // eslint-disable-next-line @typescript-eslint/no-use-before-define
                ws.removeEventListener("open", on_open);
                // eslint-disable-next-line @typescript-eslint/no-use-before-define
                ws.removeEventListener("close", on_close);
            };

            const on_open = () => {
                cleanup();
                resolve();
            };

            const on_close = () => {
                cleanup();
                reject(new Error("Could not connect to porter. Is it running?"));
            };

            ws.addEventListener("open", on_open);
            ws.addEventListener("close", on_close);

            timeout_id = setTimeout(() => {
                cleanup();
                reject(new Error("Connection to porter timed out"));
            }, timeout_ms);
        });
    }

    #connect_to_ws() {
        // one websocket handles all routing (rather than making a separate listener/connection for each socket)
        const ws = new WebSocket(PORTER_URL);
        this.#ws = ws;
        let was_open = false;

        ws.addEventListener("message", (event) => {
            const data = JSON.parse(event.data) as InboundMessage;

            switch (data.type) {
                case "incoming_connection": {
                    const socket = this._port_map.get(data.port) as PorterBridgeServerSocket | undefined;
                    if (socket) {
                        // create the client
                        const client = new PorterBridgeClientSocket(data.sock_id, this);
                        this.#client_map.set(data.sock_id, client);

                        // on close, delete the client from the map
                        client.add_event_listener("close", () => {
                            this.#client_map.delete(data.sock_id);
                        });

                        socket._handle_incoming_connection(client);
                    } else {
                        console.warn(`Received incoming connection for unbound port ${data.port}`);
                    }
                    break;
                }
                case "connection_closing": {
                    const client = this.#client_map.get(data.sock_id);
                    if (client) {
                        // emit passive close event
                        client.close(true).catch(err => {
                            console.error(`Error closing client socket ${data.sock_id}:`, err);
                        });
                    } else {
                        console.warn(`Received connection closing for unknown socket ID ${data.sock_id}`);
                    }
                    break;
                }
                case "data": {
                    const client = this.#client_map.get(data.sock_id);
                    if (client) {
                        const decoded_data = Uint8Array.from(atob(data.data), c => c.charCodeAt(0));
                        client._handle_incoming_data(decoded_data);
                    } else {
                        console.warn(`Received data for unknown socket ID ${data.sock_id}`);
                    }
                    break;
                }
            }
        });

        ws.addEventListener("open", () => {
            console.log("Porter connection established");
            was_open = true;
            this.#reconnect_attempts = 0;
            this.#has_connected_this_session = true;
            write_autoconnect_flag();

            // inform event listeners of state change
            this._state_change_listeners.forEach(listener => {
                try {
                    listener(true);
                } catch (err) {
                    console.error("Error in state change listener:", err);
                }
            });
        });

        ws.addEventListener("close", async () => {
            // a stale socket closing after being replaced shouldn't tear down the new one's state
            if (this.#ws !== ws) {
                return;
            }

            if (was_open) {
                console.warn("Porter connection closed");

                // inform event listeners of state change
                this._state_change_listeners.forEach(listener => {
                    try {
                        listener(false);
                    } catch (err) {
                        console.error("Error in state change listener:", err);
                    }
                });

                // passively close all clients and clear maps
                const client_close_promises = Array.from(this.#client_map.values()).map(client => client.close(true));
                await Promise.allSettled(client_close_promises);
                this.#client_map.clear();

                // close all servers and clear map
                const server_close_promises = Array.from(this._port_map.values()).map(server => server.close());
                await Promise.allSettled(server_close_promises);
                this._port_map.clear();
            }

            if (!this.#should_auto_retry()) {
                // stay idle until something explicitly needs the network again
                return;
            }

            // attempt to reconnect with exponential backoff
            this.#reconnect_timer = setTimeout(() => {
                this.#reconnect_timer = null;
                this.#ensure_connecting();
            }, Math.min(50 * 2 ** this.#reconnect_attempts, MAX_RECONNECT_DELAY_MS));
            this.#reconnect_attempts++;
        });

        ws.addEventListener("error", (err) => {
            // a failed connect also fires close, which handles retrying
            if (was_open) {
                console.error("Porter websocket error:", err);
            }
        });
    }

    get_unique_manager_type_name(): string {
        return "porter";
    }

    protected async _handle_listen_internal(port: number): Promise<AbstractServerSocket> {
        const socket = new PorterBridgeServerSocket(port, this);

        const msg: BindMessage = {
            type: "bind_req",
            port,
        };

        await this.wait_for_ws_ready();
        this.#ws.send(JSON.stringify(msg));

        // wait for ack
        // TODO: move this to the routing instead for more efficiency
        await new Promise<void>((resolve, reject) => {
            const handler = (event: MessageEvent) => {
                const data = JSON.parse(event.data) as InboundMessage;
                if (data.type === "ack_bind" && data.port === port) {
                    this.#ws.removeEventListener("message", handler);
                    if (data.success) {
                        resolve();
                    } else {
                        reject(new Error(data.error || "Unknown error binding port"));
                    }
                }
            };

            this.#ws.addEventListener("message", handler);
        });

        return socket;
    }

    async connect(host: string, port: number): Promise<AbstractClientSocket> {
        // generate a sock id that we will provide to immediately reserve in the map without waiting for a reply
        const sock_id = crypto.randomUUID();

        const msg: ConnectMessage = {
            type: "connect_req",
            host,
            port,
            force_sock_id: sock_id,
        };

        await this.wait_for_ws_ready();
        this.#ws.send(JSON.stringify(msg));

        return new Promise<PorterBridgeClientSocket>((resolve, reject) => {
            const handler = (event: MessageEvent) => {
                const data = JSON.parse(event.data) as InboundMessage;

                // TODO: move this routing logic to the manager instead of having each connect call add its own listener for efficiency
                if (data.type === "ack_connect" && data.sock_id === sock_id) {
                    this.#ws.removeEventListener("message", handler);

                    if (data.success) {
                        // create the client and add to map
                        const client = new PorterBridgeClientSocket(sock_id, this);
                        this.#client_map.set(sock_id, client);

                        // cleanup on close
                        client.add_event_listener("close", () => {
                            this.#client_map.delete(sock_id);
                        });

                        resolve(client);
                    } else {
                        reject(new Error(data.error || `Failed to connect to ${host}:${port}`));
                    }
                }
            };

            this.#ws.addEventListener("message", handler);
        });
    }
}

// TODO: make the close/open recovery less up to the impl and more enforced by the abstract
// TODO: fall back to at least making local servers visible locally if websocket not available
