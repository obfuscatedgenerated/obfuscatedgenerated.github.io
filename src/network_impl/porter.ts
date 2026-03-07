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

export class PorterBridgeNetworkManager extends AbstractNetworkManager {
    // sock_id -> client
    readonly #client_map = new Map<string, PorterBridgeClientSocket>();

    constructor() {
        super();
        this.#connect_to_ws();
    }

    #ws: WebSocket;
    #reconnect_attempts = 0;

    get ws(): WebSocket {
        return this.#ws;
    }

    async is_up(try_waiting = false): Promise<boolean> {
        if (this.#ws.readyState === WebSocket.OPEN) {
            return true;
        }

        if (try_waiting) {
            try {
                await this.wait_for_ws_ready();
                return true;
            } catch {
                return false;
            }
        }
    }

    wait_for_ws_ready = async (): Promise<void> => {
        if (this.#ws.readyState === WebSocket.OPEN) {
            return;
        }

        if (this.#ws.readyState === WebSocket.CLOSED || this.#ws.readyState === WebSocket.CLOSING) {
            throw new Error("WebSocket is closed");
        }

        await new Promise<void>((resolve, reject) => {
            let timeout_id: NodeJS.Timeout | null = null;

            const on_open = () => {
                if (timeout_id) {
                    clearTimeout(timeout_id);
                }

                this.#ws.removeEventListener("open", on_open);
                // eslint-disable-next-line @typescript-eslint/no-use-before-define
                this.#ws.removeEventListener("error", on_error);
                resolve();
            };
            const on_error = (err: Event) => {
                if (timeout_id) {
                    clearTimeout(timeout_id);
                }

                this.#ws.removeEventListener("open", on_open);
                this.#ws.removeEventListener("error", on_error);
                reject(new Error(`WebSocket error: ${err}`));
            };

            this.#ws.addEventListener("open", on_open);
            this.#ws.addEventListener("error", on_error);

            // timeout after 5 seconds
            timeout_id = setTimeout(() => {
                this.#ws.removeEventListener("open", on_open);
                this.#ws.removeEventListener("error", on_error);
                reject(new Error("WebSocket connection timed out"));
            }, 5000);
        });
    }

    #connect_to_ws() {
        // open websocket connection on port 9000, handling all routing (rather than making a separate listener/connection for each socket)
        this.#ws = new WebSocket("ws://127.0.0.1:9000");

        this.#ws.addEventListener("message", (event) => {
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

        this.#ws.addEventListener("open", () => {
            console.log("WebSocket connection established");
            this.#reconnect_attempts = 0;

            // disabled as may be unexpected given we inform programs of network state change
            // // try to rebind all ports on reconnect
            // for (const port of this.#port_map.keys()) {
            //     const msg: BindMessage = {
            //         type: "bind_req",
            //         port,
            //     };
            //     this.#ws.send(JSON.stringify(msg));
            // }

            // inform event listeners of state change
            this._state_change_listeners.forEach(listener => {
                try {
                    listener(true);
                } catch (err) {
                    console.error("Error in state change listener:", err);
                }
            });
        });

        this.#ws.addEventListener("close", async () => {
            console.warn("WebSocket connection closed, attempting to reconnect...");

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

            // attempt to reconnect with exponential backoff
            setTimeout(() => {
                this.#connect_to_ws();
            }, Math.min(50 * 2 ** this.#reconnect_attempts, 3000));
            this.#reconnect_attempts++;
        });

        this.#ws.addEventListener("error", (err) => {
            console.error("WebSocket error:", err);
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
