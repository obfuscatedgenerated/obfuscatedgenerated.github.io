import type { LineParseResultCommand } from "./term_ctl";
import type { AbstractWindow, AbstractWindowManager } from "./windowing";
export interface IPCMessage {
    from: number;
    to: number;
    data: unknown;
}
export type IPCChannelListener = (msg: IPCMessage) => Promise<void>;
export type IPCServiceOnConnectionCallback = (channel_id: number, from_pid: number) => Promise<void>;
export declare class IPCManager {
    private readonly _process_manager;
    private readonly _services;
    private readonly _channels;
    private _next_channel_id;
    constructor(process_manager: ProcessManager);
    dispose_all(): void;
    service_register(name: string, pid: number, on_connection: IPCServiceOnConnectionCallback): void;
    service_unregister(name: string): void;
    service_lookup(name: string): number | undefined;
    create_channel(initiator_pid: number, service_name: string): number | null;
    destroy_channel(channel_id: number): void;
    channel_listen(channel_id: number, listening_pid: number, listener: IPCChannelListener): boolean;
    channel_unlisten(channel_id: number, listening_pid: number, listener: IPCChannelListener): boolean;
    channel_send(channel_id: number, from_pid: number, data: unknown): boolean;
}
declare enum ProcessAttachment {
    FOREGROUND = 0,
    BACKGROUND = 1,
    DETACHED = 2
}
export declare class ProcessContext {
    private readonly _pid;
    private readonly _manager;
    private readonly _source_command;
    private readonly _created_at;
    private readonly _exit_listeners;
    private _attachment;
    private _detach_silently;
    private readonly _timeouts;
    private readonly _timeout_promises;
    private readonly _timeout_cancel_callbacks;
    private readonly _intervals;
    private readonly _windows;
    constructor(pid: number, source_command: LineParseResultCommand, registry: ProcessManager);
    get pid(): number;
    get source_command(): LineParseResultCommand;
    get created_at(): Date;
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
}
export declare class ProcessManager {
    private readonly _processes;
    private _next_pid;
    private readonly _wm;
    private readonly _ipc_manager;
    constructor(wm?: AbstractWindowManager | null);
    get window_manager(): AbstractWindowManager | null;
    get ipc_manager(): IPCManager;
    dispose_all(): void;
    create_process(source_command: LineParseResultCommand): ProcessContext;
    get_process(pid: number): ProcessContext | undefined;
    list_pids(): number[];
    mark_terminated(pid: number): void;
}
export {};
