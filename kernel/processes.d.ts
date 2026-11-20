import type { AbstractWindow, AbstractWindowManager, UserspaceWindow } from "./windowing";
import type { AbstractShell } from "../abstract_shell";
import type { ParsedCommandLine } from "./index";
import { AbstractClientSocket, AbstractNetworkManager, AbstractServerSocket, NetworkManagerEvent, NetworkManagerEventListener, UserspaceClientSocket, UserspaceServerSocket } from "./network";
import { AbstractTerminal, UserspaceTerminal } from "./term_ctl";
import { mirror_source, MirrorSource, type remote_as_declared, type sync_members } from "./rpc";
import type { RunThread, ThreadFuncs } from "../types";
type ThreadRunner = (process: ProcessContext, name: string, input: unknown) => Promise<unknown>;
export interface IPCMessage {
    from: number;
    to: number;
    data: unknown;
}
export type IPCChannelListener = (msg: IPCMessage) => Promise<void>;
export type IPCServiceOnConnectionCallback = (channel_id: number, from_pid: number) => Promise<void>;
export declare const KERNEL_FAKE_PID = 0;
/**
 * The userspace proxy of the IPC manager. Programs running in an isothread receive it as {@link Remote}<UserspaceIPCManager>.
 *
 * @group Userspace
 * @category Processes
 */
export interface UserspaceIPCManager {
    /** @hidden */
    readonly [sync_members]?: (member: never) => void;
    service_register(name: string, on_connection: IPCServiceOnConnectionCallback): void;
    service_unregister(name: string): void;
    service_lookup(name: string): number | undefined;
    create_channel(service_name: string): number | null;
    destroy_channel(channel_id: number): void;
    channel_listen(channel_id: number, listener: IPCChannelListener, drain_queue?: boolean): boolean;
    channel_unlisten(channel_id: number, listener: IPCChannelListener): boolean;
    channel_send(channel_id: number, data: unknown): boolean;
}
export declare class IPCManager {
    #private;
    constructor(process_manager: ProcessManager);
    dispose_all(): void;
    /**
     * Stops the periodic cleanup and drops everything. The manager must not be used after this.
     */
    dispose(): void;
    service_register(name: string, pid: number, on_connection: IPCServiceOnConnectionCallback): void;
    service_unregister(name: string): void;
    service_lookup(name: string): number | undefined;
    create_direct_channel(initiator_pid: number, peer_pid: number): number;
    create_channel(initiator_pid: number, service_name: string): number | null;
    reserve_kernel_channel(): number;
    assign_kernel_channel(channel_id: number, peer_pid: number): boolean;
    destroy_channel(channel_id: number): void;
    channel_listen(channel_id: number, listening_pid: number, listener: IPCChannelListener, drain_queue?: boolean): boolean;
    channel_unlisten(channel_id: number, listening_pid: number, listener: IPCChannelListener): boolean;
    channel_send(channel_id: number, from_pid: number, data: unknown): boolean;
    create_userspace_proxy(process_pid: number): UserspaceIPCManager;
}
export declare enum ProcessAttachment {
    FOREGROUND = 0,
    BACKGROUND = 1,
    DETACHED = 2
}
/**
 * How the RPC layer accesses the userspace proxy of another process: these members read synchronously, everything else goes to the kernel.
 * @hidden
 */
export declare const USERSPACE_OTHER_PROCESS_ANNOTATIONS: {
    readonly pid: "constant";
    readonly created_at: "constant";
    readonly source_command: "constant";
    readonly program_path: "constant";
    readonly is_detached: "mirrored";
    readonly is_background: "mirrored";
    readonly is_foreground: "mirrored";
    readonly attachment: "mirrored";
};
export interface UserspaceOtherProcessContext {
    /** @hidden */
    readonly [sync_members]?: (member: keyof typeof USERSPACE_OTHER_PROCESS_ANNOTATIONS) => void;
    readonly pid: number;
    readonly created_at: Date;
    readonly is_detached: boolean;
    readonly is_background: boolean;
    readonly is_foreground: boolean;
    readonly attachment: ProcessAttachment;
    readonly source_command: ParsedCommandLine;
    /**
     * The absolute path of the code the process is running, as the kernel found it (e.g. /usr/bin/vm), however it was run. Unlike {@link source_command}, this doesn't depend on what was typed or where from.
     * Programs can use it to find files that ship beside them, wherever they are run from. A builtin without a code file (on platforms that don't provide one) still reports its place in /bin.
     */
    readonly program_path: string;
}
/**
 * How the RPC layer accesses the userspace proxy of a spawned process: these members read synchronously, everything else goes to the kernel.
 * @hidden
 */
export declare const USERSPACE_SPAWNED_PROCESS_ANNOTATIONS: {
    readonly detaches_silently: "mirrored";
    readonly pid: "constant";
    readonly created_at: "constant";
    readonly source_command: "constant";
    readonly program_path: "constant";
    readonly is_detached: "mirrored";
    readonly is_background: "mirrored";
    readonly is_foreground: "mirrored";
    readonly attachment: "mirrored";
};
/**
 * The userspace proxy of a process the program spawned. The spawner is responsible for it, so unlike {@link UserspaceOtherProcessContext}, it can kill it and listen for its exit.
 *
 * @group Userspace
 * @category Processes
 */
export interface UserspaceSpawnedProcessContext extends UserspaceOtherProcessContext {
    /** @hidden */
    readonly [sync_members]?: (member: keyof typeof USERSPACE_SPAWNED_PROCESS_ANNOTATIONS) => void;
    readonly detaches_silently: boolean;
    kill(exit_code?: number): void;
    add_exit_listener(listener: (exit_code: number) => Promise<void> | void): void;
}
/**
 * How the RPC layer accesses the userspace proxy of a program's own process: these members read synchronously, everything else goes to the kernel.
 * @hidden
 */
export declare const USERSPACE_PROCESS_ANNOTATIONS: {
    readonly pid: "constant";
    readonly created_at: "constant";
    readonly source_command: "constant";
    readonly program_path: "constant";
    readonly terminal: "eager_handle";
    readonly cwd: "mirrored";
    readonly is_detached: "mirrored";
    readonly is_background: "mirrored";
    readonly is_foreground: "mirrored";
    readonly attachment: "mirrored";
    readonly bound_ports: "mirrored";
    readonly create_timeout: (this: object, callback: () => void, delay: number, on_cancel?: () => void) => number;
    readonly cancel_timeout: (this: object, id: number) => void;
    readonly wait_for_timeout: (this: object, id: number) => Promise<boolean>;
    readonly has_timeout: (this: object, id: number) => boolean;
    readonly create_interval: (this: object, callback: () => void, interval: number) => number;
    readonly clear_interval: (this: object, id: number) => void;
};
export interface UserspaceProcessContext<T extends ThreadFuncs = ThreadFuncs> extends UserspaceOtherProcessContext {
    /** @hidden */
    readonly [sync_members]?: (member: keyof typeof USERSPACE_PROCESS_ANNOTATIONS) => void;
    /** @hidden */
    readonly [remote_as_declared]?: (member: "run_thread") => void;
    /**
     * Runs one of the program's own thread functions (its threads export) in a new isothread, resolving to its result. Rejects with a "ThreadNotFoundError" if there is no such function.
     */
    run_thread: RunThread<T>;
    cwd: string;
    readonly terminal: UserspaceTerminal;
    detach(silently?: boolean): void;
    kill(exit_code?: number): void;
    add_exit_listener(listener: (exit_code: number) => Promise<void> | void): void;
    create_timeout(callback: () => void, delay: number): number;
    cancel_timeout(id: number): void;
    wait_for_timeout(id: number): Promise<boolean>;
    has_timeout(id: number): boolean;
    create_interval(callback: () => void, interval: number): number;
    clear_interval(id: number): void;
    create_window(): UserspaceWindow;
    network_listen(port: number): Promise<UserspaceServerSocket>;
    network_connect(host: string, port: number): Promise<UserspaceClientSocket>;
    network_add_manager_listener(event: NetworkManagerEvent, listener: NetworkManagerEventListener): void;
    network_remove_manager_listener(event: NetworkManagerEvent, listener: NetworkManagerEventListener): void;
    get bound_ports(): number[];
}
export declare class ProcessContext<T extends ThreadFuncs = ThreadFuncs> implements MirrorSource {
    #private;
    readonly [mirror_source]: true;
    /**
     * Resolves once the process has been killed and its teardowns have run (e.g. its isothread terminated).
     * The killed flag is set immediately, the terminated flag is set once the process is fully cleaned up.
     */
    get terminated(): Promise<void>;
    constructor(pid: number, terminal: AbstractTerminal, source_command: ParsedCommandLine, registry: ProcessManager, program_path: string, shell?: AbstractShell, initial_cwd?: string);
    get pid(): number;
    get cwd(): string;
    set cwd(path: string);
    get terminal(): AbstractTerminal;
    get source_command(): ParsedCommandLine;
    get program_path(): string | null;
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
    /**
     * Kernel only. Runs once the process's own exit listeners have finished (or timed out), e.g. to terminate its isothread without cutting off its cleanup.
     */
    add_teardown(teardown: () => void): void;
    add_exit_listener(listener: (exit_code: number) => Promise<void> | void): void;
    create_timeout(callback: () => void, delay: number, on_cancel?: () => void): number;
    cancel_timeout(id: number): void;
    has_timeout(id: number): boolean;
    create_interval(callback: () => void, interval: number): number;
    has_interval(id: number): boolean;
    clear_interval(id: number): void;
    wait_for_timeout(id: number): Promise<boolean>;
    /**
     * Runs one of the program's own thread functions (its threads export) in a new isothread, resolving to its result. Rejects with a "ThreadNotFoundError" if there is no such function.
     */
    run_thread: RunThread<T>;
    /**
     * Kernel only. Sets a window made ahead of time for the process, which its first create_window call from userspace returns instead of making a new one.
     * Used when the program runs inside its window (a frame isothread).
     */
    set_primary_window(wind: AbstractWindow): void;
    create_window(): AbstractWindow;
    network_listen(port: number): Promise<AbstractServerSocket>;
    network_connect(host: string, port: number): Promise<AbstractClientSocket>;
    network_add_manager_listener(event: NetworkManagerEvent, listener: NetworkManagerEventListener): void;
    network_remove_manager_listener(event: NetworkManagerEvent, listener: NetworkManagerEventListener): void;
    get bound_ports(): number[];
    create_userspace_proxy_as_other_process(): UserspaceOtherProcessContext;
    create_userspace_proxy_as_spawned_process(): UserspaceSpawnedProcessContext;
    create_userspace_proxy(): UserspaceProcessContext;
}
/**
 * How the RPC layer accesses the process manager's userspace proxy: these members read synchronously, everything else goes to the kernel.
 * @hidden
 */
export declare const USERSPACE_PROCESS_MANAGER_ANNOTATIONS: {
    readonly ipc_manager: "eager_handle";
    readonly list_pids: "mirrored";
};
export interface UserspaceProcessManager {
    /** @hidden */
    readonly [sync_members]?: (member: keyof typeof USERSPACE_PROCESS_MANAGER_ANNOTATIONS) => void;
    readonly ipc_manager: UserspaceIPCManager;
    list_pids(): number[];
    get_process(pid: number): UserspaceOtherProcessContext | undefined;
    kill(pid: number, exit_code?: number): boolean;
}
export declare class ProcessManager implements MirrorSource {
    #private;
    readonly [mirror_source]: true;
    constructor(wm?: AbstractWindowManager | null, net_manager?: AbstractNetworkManager | null);
    /**
     * Kernel only. Sets how processes run their thread functions, as that needs the kernel (program code and the isothread manager).
     */
    set_thread_runner(runner: ThreadRunner): void;
    _run_thread(process: ProcessContext, name: string, input: unknown): Promise<unknown>;
    get window_manager(): AbstractWindowManager | null;
    get ipc_manager(): IPCManager;
    get network_manager(): AbstractNetworkManager | null;
    dispose_all(): void;
    /**
     * Drops every process and stops anything still running in the background (e.g. the IPC cleanup). The manager must not be used after this.
     */
    dispose(): void;
    create_process(terminal: AbstractTerminal, source_command: ParsedCommandLine, program_path: string, shell?: AbstractShell, initial_cwd?: string): ProcessContext;
    get_process(pid: number): ProcessContext | undefined;
    list_pids(): number[];
    mark_terminated(pid: number, terminated?: Promise<void>): void;
    wait_for_terminations(): Promise<void>;
    kill(pid: number, exit_code?: number): boolean;
    create_userspace_proxy(process_pid: number): UserspaceProcessManager;
}
export {};
