import type { AbstractWindow, AbstractWindowManager } from "./windowing";
import type { AbstractShell } from "../abstract_shell";
import type { ParsedCommandLine } from "./index";
export interface IPCMessage {
    from: number;
    to: number;
    data: unknown;
}
export type IPCChannelListener = (msg: IPCMessage) => Promise<void>;
export type IPCServiceOnConnectionCallback = (channel_id: number, from_pid: number) => Promise<void>;
export declare const KERNEL_FAKE_PID = 0;
export interface UserspaceIPCManager {
    service_register(name: string, on_connection: IPCServiceOnConnectionCallback): void;
    service_unregister(name: string): void;
    service_lookup(name: string): number | undefined;
    create_channel(service_name: string): number | null;
    destroy_channel(channel_id: number): void;
    channel_listen(channel_id: number, listener: IPCChannelListener): boolean;
    channel_unlisten(channel_id: number, listener: IPCChannelListener): boolean;
    channel_send(channel_id: number, data: unknown): boolean;
}
export declare class IPCManager {
    #private;
    constructor(process_manager: ProcessManager);
    dispose_all(): void;
    service_register(name: string, pid: number, on_connection: IPCServiceOnConnectionCallback): void;
    service_unregister(name: string): void;
    service_lookup(name: string): number | undefined;
    create_direct_channel(initiator_pid: number, peer_pid: number): number;
    create_channel(initiator_pid: number, service_name: string): number | null;
    reserve_kernel_channel(): number;
    assign_kernel_channel(channel_id: number, peer_pid: number): boolean;
    destroy_channel(channel_id: number): void;
    channel_listen(channel_id: number, listening_pid: number, listener: IPCChannelListener): boolean;
    channel_unlisten(channel_id: number, listening_pid: number, listener: IPCChannelListener): boolean;
    channel_send(channel_id: number, from_pid: number, data: unknown): boolean;
    create_userspace_proxy(process_pid: number): UserspaceIPCManager;
}
export declare enum ProcessAttachment {
    FOREGROUND = 0,
    BACKGROUND = 1,
    DETACHED = 2
}
export interface UserspaceOtherProcessContext {
    readonly pid: number;
    readonly created_at: Date;
    readonly is_detached: boolean;
    readonly is_background: boolean;
    readonly is_foreground: boolean;
    readonly attachment: ProcessAttachment;
    readonly source_command: ParsedCommandLine;
}
export interface UserspaceProcessContext extends UserspaceOtherProcessContext {
    detach(silently?: boolean): void;
    kill(exit_code?: number): void;
    create_timeout(callback: () => void, delay: number): number;
    cancel_timeout(id: number): void;
    create_interval(callback: () => void, interval: number): number;
    clear_interval(id: number): void;
    create_window(): AbstractWindow | null;
}
export declare class ProcessContext {
    #private;
    constructor(pid: number, source_command: ParsedCommandLine, registry: ProcessManager, shell?: AbstractShell);
    get pid(): number;
    get source_command(): ParsedCommandLine;
    get created_at(): Date;
    get shell(): AbstractShell | undefined;
    get is_detached(): boolean;
    get is_background(): boolean;
    get is_foreground(): boolean;
    get attachment(): ProcessAttachment;
    get detaches_silently(): boolean;
    detach(silently?: boolean): void;
    dispose_resources(): void;
    kill(exit_code?: number): void;
    add_exit_listener(listener: (exit_code: number) => Promise<void> | void): void;
    create_timeout(callback: () => void, delay: number, on_cancel?: () => void): number;
    cancel_timeout(id: number): void;
    has_timeout(id: number): boolean;
    create_interval(callback: () => void, interval: number): number;
    has_interval(id: number): boolean;
    clear_interval(id: number): void;
    wait_for_timeout(id: number): Promise<boolean>;
    create_window(): AbstractWindow | null;
    create_userspace_proxy_as_other_process(): UserspaceOtherProcessContext;
    create_userspace_proxy(): UserspaceProcessContext;
}
export interface UserspaceProcessManager {
    readonly ipc_manager: UserspaceIPCManager;
    list_pids(): number[];
    get_process(pid: number): UserspaceOtherProcessContext | undefined;
    kill(pid: number, exit_code?: number): boolean;
}
export declare class ProcessManager {
    #private;
    constructor(wm?: AbstractWindowManager | null);
    get window_manager(): AbstractWindowManager | null;
    get ipc_manager(): IPCManager;
    dispose_all(): void;
    create_process(source_command: ParsedCommandLine, shell?: AbstractShell): ProcessContext;
    get_process(pid: number): ProcessContext | undefined;
    list_pids(): number[];
    mark_terminated(pid: number): void;
    kill(pid: number, exit_code?: number): boolean;
    create_userspace_proxy(process_pid: number): UserspaceProcessManager;
}
