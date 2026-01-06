import type { LineParseResultCommand } from "./term_ctl";
import type { AbstractWindow, AbstractWindowManager } from "./windowing";
export interface IPCMessage {
    from: number;
    to: number;
    data: unknown;
}
export declare class IPCManager {
    private readonly _process_manager;
    private readonly _services;
    private readonly _channels;
    private _next_channel_id;
    constructor(process_manager: ProcessManager);
    service_register(name: string, pid: number, on_connection: (channel_id: number, from_pid: number) => void): void;
    service_unregister(name: string): void;
    service_lookup(name: string): number | undefined;
    create_channel(initiator_pid: number, service_name: string): number | null;
    destroy_channel(channel_id: number): void;
    channel_listen(channel_id: number, listening_pid: number, listener: (msg: IPCMessage) => void): boolean;
    channel_unlisten(channel_id: number, listening_pid: number, listener: (msg: IPCMessage) => void): boolean;
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
    private readonly _timeouts;
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
    detach(): void;
    kill(exit_code?: number): void;
    add_exit_listener(listener: (exit_code: number) => Promise<void> | void): void;
    create_timeout(callback: () => void, delay: number): number;
    create_interval(callback: () => void, interval: number): number;
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
    create_process(source_command: LineParseResultCommand): ProcessContext;
    get_process(pid: number): ProcessContext | undefined;
    list_pids(): number[];
    mark_terminated(pid: number): void;
}
export {};
