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
/**
 * The ready state of a socket, which can be used to determine whether the socket is open and can send/receive data.
 *
 * @group Userspace
 * @category Networking
 */
export declare enum SocketReadyState {
    CONNECTING = 0,
    OPEN = 1,
    CLOSING = 2,
    CLOSED = 3
}
/**
 * Error thrown when trying to listen on a port that is already in use.
 *
 * @group Userspace
 * @category Networking
 */
export declare class PortInUseError extends Error {
    constructor(port: number);
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
export declare abstract class AbstractClientSocket {
    #private;
    readonly id: string;
    ready_state: SocketReadyState;
    protected readonly _data_listeners: Set<SocketDataListener>;
    protected constructor(id: string);
    add_event_listener(event: ClientSocketEvent, callback: ClientSocketEventListener): void;
    remove_event_listener(event: ClientSocketEvent, callback: ClientSocketEventListener): void;
    protected abstract _handle_send_internal(data: Uint8Array): Promise<void>;
    send(data: Uint8Array | string): Promise<void>;
    protected abstract _handle_close_internal(passive: boolean): Promise<void>;
    close(passive?: boolean): Promise<void>;
    create_userspace_proxy(): UserspaceClientSocket;
}
export interface UserspaceServerSocket {
    readonly port: number;
    add_event_listener(event: "connection", callback: UserspaceSocketConnectionListener): void;
    add_event_listener(event: "close", callback: SocketCloseListener): void;
    remove_event_listener(event: "connection", callback: UserspaceSocketConnectionListener): void;
    remove_event_listener(event: "close", callback: SocketCloseListener): void;
    close(): Promise<void>;
}
export declare abstract class AbstractServerSocket {
    #private;
    readonly port: number;
    protected readonly _connection_listeners: Set<SocketConnectionListener>;
    protected constructor(port: number);
    add_event_listener(event: ServerSocketEvent, callback: ServerSocketEventListener): void;
    remove_event_listener(event: ServerSocketEvent, callback: ServerSocketEventListener): void;
    protected abstract _handle_close_internal(): Promise<void>;
    close(): Promise<void>;
    create_userspace_proxy(): UserspaceServerSocket;
}
export interface UserspaceNetworkManager {
    get bound_ports(): number[];
    get_unique_manager_type_name(): string;
    is_up(try_waiting?: boolean): Promise<boolean>;
}
export declare abstract class AbstractNetworkManager {
    #private;
    get bound_ports(): number[];
    abstract get_unique_manager_type_name(): string;
    abstract is_up(try_waiting?: boolean): Promise<boolean>;
    protected abstract _handle_listen_internal(port: number): Promise<AbstractServerSocket>;
    listen(port: number): Promise<AbstractServerSocket>;
    abstract connect(host: string, port: number): Promise<AbstractClientSocket>;
    create_userspace_proxy(): UserspaceNetworkManager;
}
