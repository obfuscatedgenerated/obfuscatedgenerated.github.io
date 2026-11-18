import type {AbstractWindow, AbstractWindowManager, UserspaceWindow} from "./windowing";
import type {AbstractShell} from "../abstract_shell";
import type {ParsedCommandLine} from "./index";
import {
    AbstractClientSocket,
    AbstractNetworkManager,
    AbstractServerSocket, NetworkManagerEvent, NetworkManagerEventListener,
    UserspaceClientSocket,
    UserspaceServerSocket
} from "./network";
import {AbstractTerminal, UserspaceTerminal} from "./term_ctl";
import {finalise_userspace_proxy, mirror_source, MirrorSource, notify_mirror_change, type remote_as_declared, type sync_members} from "./rpc";
import * as timers from "../lib/timers";
import type {RunThread, ThreadFuncs} from "../types";

type ThreadRunner = (process: ProcessContext, name: string, input: unknown) => Promise<unknown>;

export interface IPCMessage {
    from: number;
    to: number;

    data: unknown;
}

export type IPCChannelListener = (msg: IPCMessage) => Promise<void>;

interface IPCChannel {
    initiator: number;
    peer: number;

    initiator_to_peer_queue: IPCMessage[];
    peer_to_initiator_queue: IPCMessage[];

    // pid -> set of listeners
    listeners: Map<number, Set<IPCChannelListener>>;
}

export type IPCServiceOnConnectionCallback = (channel_id: number, from_pid: number) => Promise<void>;

interface IPCService {
    pid: number;
    on_connection: IPCServiceOnConnectionCallback;
}

export const KERNEL_FAKE_PID = 0;
const UNASSIGNED_FAKE_PID = -1;

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

export class IPCManager {
    readonly #process_manager: ProcessManager;

    // service name -> IPCService
    readonly #services: Map<string, IPCService> = new Map();

    // channel id -> IPCChannel
    readonly #channels: Map<number, IPCChannel> = new Map();
    #next_channel_id = 1;

    constructor(process_manager: ProcessManager) {
        this.#process_manager = process_manager;

        // clean up dead services and channels periodically
        // TODO: add a global exit listener to process manager to be immediately notified of process exits
        setInterval(() => {
            // clean up services
            for (const [name, service] of this.#services) {
                const process = this.#process_manager.get_process(service.pid);
                if (!process) {
                    this.#services.delete(name);
                }
            }

            // clean up channels
            // the kernel isn't a process, and a reserved channel has no peer yet, so neither end counts as dead (otherwise privilege requests lose their channel mid-prompt)
            const is_alive = (pid: number) => pid === KERNEL_FAKE_PID || pid === UNASSIGNED_FAKE_PID || this.#process_manager.get_process(pid) !== undefined;

            for (const [channel_id, channel] of this.#channels) {
                if (!is_alive(channel.initiator) || !is_alive(channel.peer)) {
                    this.#channels.delete(channel_id);
                }
            }
        }, 10000);
    }

    dispose_all(): void {
        this.#services.clear();
        this.#channels.clear();
    }

    service_register(name: string, pid: number, on_connection: IPCServiceOnConnectionCallback): void {
        this.#services.set(name, { pid, on_connection });
    }

    // TODO: disconnect callback? or change the on_connection to on_event with different event types

    service_unregister(name: string): void {
        this.#services.delete(name);
    }

    service_lookup(name: string): number | undefined {
        const service = this.#services.get(name);

        if (!service) {
            return undefined;
        }

        // check if process is still running
        const process = this.#process_manager.get_process(service.pid);
        if (!process) {
            this.#services.delete(name);
            return undefined;
        }

        return service.pid;
    }

    create_direct_channel(initiator_pid: number, peer_pid: number): number {
        const channel_id = this.#next_channel_id++;

        this.#channels.set(channel_id, {
            initiator: initiator_pid,
            peer: peer_pid,

            initiator_to_peer_queue: [],
            peer_to_initiator_queue: [],

            listeners: new Map(),
        });

        return channel_id;
    }

    create_channel(initiator_pid: number, service_name: string): number | null {
        const peer_pid = this.service_lookup(service_name);

        if (!peer_pid) {
            return null;
        }

        const channel_id = this.create_direct_channel(initiator_pid, peer_pid);

        // notify service of new connection without blocking
        const service = this.#services.get(service_name)!;
        service.on_connection(channel_id, initiator_pid).catch((err) => {
            console.error("IPC service on_connection error:", err);
        });

        return channel_id;
    }

    reserve_kernel_channel(): number {
        return this.create_direct_channel(KERNEL_FAKE_PID, UNASSIGNED_FAKE_PID);
    }

    assign_kernel_channel(channel_id: number, peer_pid: number): boolean {
        const channel = this.#channels.get(channel_id);
        if (!channel) {
            return false;
        }

        if (channel.initiator !== KERNEL_FAKE_PID || channel.peer !== UNASSIGNED_FAKE_PID) {
            return false;
        }

        channel.peer = peer_pid;
        return true;
    }

    destroy_channel(channel_id: number): void {
        this.#channels.delete(channel_id);
    }

    channel_listen(channel_id: number, listening_pid: number, listener: IPCChannelListener, drain_queue = true): boolean {
        const channel = this.#channels.get(channel_id);
        if (!channel) {
            return false;
        }

        if (channel.initiator !== listening_pid && channel.peer !== listening_pid) {
            return false;
        }

        if (!channel.listeners.has(listening_pid)) {
            channel.listeners.set(listening_pid, new Set());
        }

        channel.listeners.get(listening_pid)!.add(listener);

        if (drain_queue) {
            // drain any queued messages for this listener
            let queue: IPCMessage[];
            if (channel.initiator === listening_pid) {
                queue = channel.peer_to_initiator_queue;
            } else {
                queue = channel.initiator_to_peer_queue;
            }

            // dispatch asynchronously to avoid blocking
            while (queue.length > 0) {
                const msg = queue.shift()!;
                queueMicrotask(() => {
                    listener(msg).catch((err) => {
                        console.error("IPC channel listener error:", err);
                    });
                });
            }
        }

        return true;
    }

    channel_unlisten(channel_id: number, listening_pid: number, listener: IPCChannelListener): boolean {
        const channel = this.#channels.get(channel_id);
        if (!channel) {
            return false;
        }

        if (channel.initiator !== listening_pid && channel.peer !== listening_pid) {
            return false;
        }

        const listeners = channel.listeners.get(listening_pid);
        if (!listeners) {
            return false;
        }

        listeners.delete(listener);
        return true;
    }

    channel_send(channel_id: number, from_pid: number, data: unknown): boolean {
        const channel = this.#channels.get(channel_id);
        if (!channel) {
            return false;
        }

        let msg: IPCMessage;
        if (channel.initiator === from_pid) {
            msg = {
                from: from_pid,
                to: channel.peer,
                data,
            };

            channel.initiator_to_peer_queue.push(msg);
        } else if (channel.peer === from_pid) {
            msg = {
                from: from_pid,
                to: channel.initiator,
                data,
            };

            channel.peer_to_initiator_queue.push(msg);
        } else {
            console.warn(`Process ${from_pid} attempted to send IPC message on channel ${channel_id} but is not a participant`);
            return false;
        }
        //console.log(`IPC message sent on channel ${channel_id} from PID ${from_pid} to PID ${msg.to}:`, data);

        // notify listeners on the receiving end without blocking
        const to_pid = msg.to;
        const listeners = channel.listeners.get(to_pid);
        if (listeners) {
            for (const listener of listeners) {
                queueMicrotask(() => {
                    listener(msg).catch((err) => {
                        console.error("IPC channel listener error:", err);
                    });
                });
            }
        }

        return true;
    }

    create_userspace_proxy(process_pid: number): UserspaceIPCManager {
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const self = this;
        const proxy = Object.create(null);

        Object.defineProperties(proxy, {
            service_register: { value: (name: string, on_connection: IPCServiceOnConnectionCallback) => {
                self.service_register(name, process_pid, on_connection);
            }, enumerable: true },
            service_unregister: { value: (name: string) => {
                self.service_unregister(name);
            }, enumerable: true },
            service_lookup: { value: (name: string) => {
                return self.service_lookup(name);
            }, enumerable: true },
            create_channel: { value: (service_name: string) => {
                return self.create_channel(process_pid, service_name);
            }, enumerable: true },
            destroy_channel: { value: (channel_id: number) => {
                self.destroy_channel(channel_id);
            }, enumerable: true },
            channel_listen: { value: (channel_id: number, listener: IPCChannelListener, drain_queue = true) => {
                return self.channel_listen(channel_id, process_pid, listener, drain_queue);
            }, enumerable: true },
            channel_unlisten: { value: (channel_id: number, listener: IPCChannelListener) => {
                return self.channel_unlisten(channel_id, process_pid, listener);
            }, enumerable: true },
            channel_send: { value: (channel_id: number, data: unknown) => {
                return self.channel_send(channel_id, process_pid, data);
            }, enumerable: true },
        });

        return finalise_userspace_proxy(proxy);
    }
}

// TODO: could migrate the stuff where programs grab "scary" stuff like WindowManager and ProcessManager to be services

export enum ProcessAttachment {
    FOREGROUND,
    BACKGROUND,
    DETACHED,
}

/**
 * How the RPC layer accesses the userspace proxy of another process: these members read synchronously, everything else goes to the kernel.
 * @hidden
 */
export const USERSPACE_OTHER_PROCESS_ANNOTATIONS = {
    pid: "constant",
    created_at: "constant",
    source_command: "constant",
    is_detached: "mirrored",
    is_background: "mirrored",
    is_foreground: "mirrored",
    attachment: "mirrored",
} as const;

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
}

/**
 * How the RPC layer accesses the userspace proxy of a spawned process: these members read synchronously, everything else goes to the kernel.
 * @hidden
 */
export const USERSPACE_SPAWNED_PROCESS_ANNOTATIONS = {
    ...USERSPACE_OTHER_PROCESS_ANNOTATIONS,
    detaches_silently: "mirrored",
} as const;

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
export const USERSPACE_PROCESS_ANNOTATIONS = {
    pid: "constant",
    created_at: "constant",
    source_command: "constant",
    terminal: "eager_handle",
    cwd: "mirrored",
    is_detached: "mirrored",
    is_background: "mirrored",
    is_foreground: "mirrored",
    attachment: "mirrored",
    bound_ports: "mirrored",
    create_timeout: timers.create_timeout,
    cancel_timeout: timers.cancel_timeout,
    wait_for_timeout: timers.wait_for_timeout,
    has_timeout: timers.has_timeout,
    create_interval: timers.create_interval,
    clear_interval: timers.clear_interval,
} as const;

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

export class ProcessContext<T extends ThreadFuncs = ThreadFuncs> implements MirrorSource {
    readonly [mirror_source] = true as const;

    readonly #pid: number;
    readonly #manager: ProcessManager;

    readonly #terminal: AbstractTerminal;
    readonly #source_command: ParsedCommandLine;
    readonly #created_at: Date = new Date();
    readonly #shell: AbstractShell | undefined;

    readonly #exit_listeners: Set<(exit_code: number) => Promise<void> | void> = new Set();
    readonly #teardowns: Set<() => void> = new Set();
    #killed = false;

    #resolve_terminated: () => void = () => {};
    readonly #terminated = new Promise<void>((resolve) => {
        this.#resolve_terminated = resolve;
    });

    /**
     * Resolves once the process has been killed and its teardowns have run (e.g. its isothread terminated).
     * The killed flag is set immediately, the terminated flag is set once the process is fully cleaned up.
     */
    get terminated(): Promise<void> {
        return this.#terminated;
    }

    #attachment: ProcessAttachment = ProcessAttachment.FOREGROUND;
    #detach_silently = false;

    readonly #windows: Set<AbstractWindow> = new Set();

    readonly #port_map: Map<number, AbstractServerSocket> = new Map();
    readonly #network_clients: Set<AbstractClientSocket> = new Set();
    readonly #network_manager_listeners: Map<NetworkManagerEvent, Set<NetworkManagerEventListener>> = new Map();

    #cwd = "/";

    constructor(pid: number, terminal: AbstractTerminal, source_command: ParsedCommandLine, registry: ProcessManager, shell?: AbstractShell, initial_cwd = "/") {
        this.#pid = pid;
        this.#terminal = terminal;
        this.#source_command = source_command;
        this.#manager = registry;
        this.#cwd = initial_cwd;

        if (shell) {
            this.#shell = shell;
        }

        if (source_command.run_in_bg) {
            this.#attachment = ProcessAttachment.BACKGROUND;
        }
    }

    get pid(): number {
        return this.#pid;
    }

    get cwd(): string {
        return this.#cwd;
    }

    set cwd(path: string) {
        // if path ends with /, remove it
        if (path.endsWith("/")) {
            path = path.slice(0, -1);
        }

        // if path is empty, set to root
        if (path === "") {
            path = "/";
        }

        this.#cwd = path;

        notify_mirror_change(this);
    }

    get terminal(): AbstractTerminal {
        return this.#terminal;
    }

    get source_command(): ParsedCommandLine {
        return this.#source_command;
    }

    get created_at(): Date {
        return this.#created_at;
    }

    get shell(): AbstractShell | undefined {
        return this.#shell;
    }

    get is_detached(): boolean {
        return this.#attachment === ProcessAttachment.DETACHED;
    }

    get is_background(): boolean {
        return this.#attachment === ProcessAttachment.BACKGROUND;
    }

    get is_foreground(): boolean {
        return this.#attachment === ProcessAttachment.FOREGROUND;
    }

    get attachment(): ProcessAttachment {
        return this.#attachment;
    }

    get detaches_silently(): boolean {
        return this.#detach_silently;
    }

    detach(silently = false): void {
        this.#attachment = ProcessAttachment.DETACHED;
        this.#detach_silently = silently;

        notify_mirror_change(this);
    }

    dispose_resources(): void {
        timers.dispose_timers(this);

        this.#windows.forEach((win) => {
            win.dispose();
        });

        const net_manager = this.#manager.network_manager;
        if (net_manager) {
            this.#port_map.forEach((socket) => {
                socket.close();
            });

            this.#network_clients.forEach((socket) => {
                socket.close();
            });

            this.#network_manager_listeners.forEach((listeners, event) => {
                listeners.forEach((listener) => {
                    net_manager.remove_event_listener(event, listener);
                });
            });

            this.#port_map.clear();
            this.#network_clients.clear();
            this.#network_manager_listeners.clear();
        }
    }

    kill(exit_code = 0): void {
        // e.g. the shell killing a process that was already killed by ctrl+c
        if (this.#killed) {
            return;
        }
        this.#killed = true;

        this.dispose_resources();

        this.#manager.mark_terminated(this.#pid, this.#terminated);

        const pending_listeners: Promise<unknown>[] = [];
        for (const listener of this.#exit_listeners) {
            try {
                pending_listeners.push(Promise.resolve(listener(exit_code)));
            } catch (err) {
                console.error("Process exit listener error:", err);
            }
        }

        // a hung listener can't keep the process's resources alive forever
        const listener_timeout = new Promise((resolve) => setTimeout(resolve, 2000));
        Promise.race([Promise.allSettled(pending_listeners), listener_timeout]).then(() => {
            for (const teardown of this.#teardowns) {
                try {
                    teardown();
                } catch (err) {
                    console.error("Process teardown error:", err);
                }
            }

            this.#resolve_terminated();
        });
    }

    /**
     * Kernel only. Runs once the process's own exit listeners have finished (or timed out), e.g. to terminate its isothread without cutting off its cleanup.
     */
    add_teardown(teardown: () => void): void {
        this.#teardowns.add(teardown);
    }

    add_exit_listener(listener: (exit_code: number) => Promise<void> | void): void {
        this.#exit_listeners.add(listener);
    }

    create_timeout(callback: () => void, delay: number, on_cancel?: () => void): number {
        return timers.create_timeout.call(this, callback, delay, on_cancel);
    }

    cancel_timeout(id: number): void {
        timers.cancel_timeout.call(this, id);
    }

    has_timeout(id: number): boolean {
        return timers.has_timeout.call(this, id);
    }

    create_interval(callback: () => void, interval: number): number {
        return timers.create_interval.call(this, callback, interval);
    }

    has_interval(id: number): boolean {
        return timers.has_interval.call(this, id);
    }

    clear_interval(id: number): void {
        timers.clear_interval.call(this, id);
    }

    wait_for_timeout(id: number): Promise<boolean> {
        return timers.wait_for_timeout.call(this, id);
    }

    /**
     * Runs one of the program's own thread functions (its threads export) in a new isothread, resolving to its result. Rejects with a "ThreadNotFoundError" if there is no such function.
     */
    run_thread: RunThread<T> = ((name: string, input?: unknown) => this.#manager._run_thread(this, name, input)) as RunThread<T>;

    #primary_window: AbstractWindow | null = null;
    #primary_window_claimed = false;

    /**
     * Kernel only. Sets a window made ahead of time for the process, which its first create_window call from userspace returns instead of making a new one.
     * Used when the program runs inside its window (a frame isothread).
     */
    set_primary_window(wind: AbstractWindow): void {
        this.#primary_window = wind;
    }

    #create_window_for_userspace(): AbstractWindow {
        if (!this.#primary_window) {
            return this.create_window();
        }

        if (this.#primary_window_claimed) {
            throw new Error("Programs with needs_dom can only have one window for now, as the window is the frame the program runs in");
        }

        this.#primary_window_claimed = true;
        return this.#primary_window;
    }

    create_window(): AbstractWindow {
        const wm = this.#manager.window_manager;
        if (!wm) {
            throw new Error("No window manager available");
        }

        const win = new wm.Window(this.#pid);
        this.#windows.add(win);

        // clean up on close
        win.add_event_listener("close", () => {
            this.#windows.delete(win);
        });

        return win;
    }

    async network_listen(port: number): Promise<AbstractServerSocket> {
        const net_manager = this.#manager.network_manager;
        if (!net_manager) {
            throw new Error("No network manager available");
        }

        const socket = await net_manager.listen(port);
        this.#port_map.set(port, socket);

        // clean up on close
        socket.add_event_listener("close", () => {
            this.#port_map.delete(port);
            notify_mirror_change(this);
        });

        notify_mirror_change(this);
        return socket;
    }

    async network_connect(host: string, port: number): Promise<AbstractClientSocket> {
        const net_manager = this.#manager.network_manager;
        if (!net_manager) {
            throw new Error("No network manager available");
        }

        const socket = await net_manager.connect(host, port);
        this.#network_clients.add(socket);

        // clean up on close
        socket.add_event_listener("close", () => {
            this.#network_clients.delete(socket);
        });

        return socket;
    }

    network_add_manager_listener(event: NetworkManagerEvent, listener: NetworkManagerEventListener) {
        const net_manager = this.#manager.network_manager;
        if (!net_manager) {
            throw new Error("No network manager available");
        }

        if (!this.#network_manager_listeners.has(event)) {
            this.#network_manager_listeners.set(event, new Set());
        }

        this.#network_manager_listeners.get(event)!.add(listener);

        net_manager.add_event_listener(event, listener);
    }

    network_remove_manager_listener(event: NetworkManagerEvent, listener: NetworkManagerEventListener) {
        const net_manager = this.#manager.network_manager;
        if (!net_manager) {
            throw new Error("No network manager available");
        }

        if (this.#network_manager_listeners.has(event)) {
            this.#network_manager_listeners.get(event)!.delete(listener);
        }

        net_manager.remove_event_listener(event, listener);
    }

    get bound_ports(): number[] {
        return Array.from(this.#port_map.keys());
    }

    // what any program may read about this process
    #other_process_properties(): PropertyDescriptorMap {
        return {
            pid: { get: () => this.pid, enumerable: true },
            created_at: { get: () => this.created_at, enumerable: true },
            is_detached: { get: () => this.is_detached, enumerable: true },
            is_background: { get: () => this.is_background, enumerable: true },
            is_foreground: { get: () => this.is_foreground, enumerable: true },
            attachment: { get: () => this.attachment, enumerable: true },
            source_command: { get: () => this.source_command, enumerable: true },
        };
    }

    create_userspace_proxy_as_other_process(): UserspaceOtherProcessContext {
        const proxy = Object.create(null);
        Object.defineProperties(proxy, this.#other_process_properties());

        return finalise_userspace_proxy(proxy, USERSPACE_OTHER_PROCESS_ANNOTATIONS, [this]);
    }

    create_userspace_proxy_as_spawned_process(): UserspaceSpawnedProcessContext {
        const proxy = Object.create(null);
        Object.defineProperties(proxy, {
            ...this.#other_process_properties(),
            detaches_silently: { get: () => this.detaches_silently, enumerable: true },
            kill: { value: (exit_code?: number) => { this.kill(exit_code); }, enumerable: true },
            add_exit_listener: { value: (listener: (exit_code: number) => Promise<void> | void) => { this.add_exit_listener(listener); }, enumerable: true },
        });

        return finalise_userspace_proxy(proxy, USERSPACE_SPAWNED_PROCESS_ANNOTATIONS, [this]);
    }

    create_userspace_proxy(): UserspaceProcessContext {
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const self = this;
        const proxy = Object.create(null);

        // the terminal never changes for a process, so the same proxy is always returned
        const terminal_proxy = self.terminal.create_userspace_proxy();

        Object.defineProperties(proxy, {
            pid: { get: () => self.pid, enumerable: true },
            cwd: { get: () => self.cwd, set: (new_cwd: string) => { self.cwd = new_cwd; }, enumerable: true },
            terminal: { get: () => terminal_proxy, enumerable: true },
            created_at: { get: () => self.created_at, enumerable: true },
            is_detached: { get: () => self.is_detached, enumerable: true },
            is_background: { get: () => self.is_background, enumerable: true },
            is_foreground: { get: () => self.is_foreground, enumerable: true },
            attachment: { get: () => self.attachment, enumerable: true },
            source_command: { get: () => self.source_command, enumerable: true },
            detach: { value: (silently = false) => { self.detach(silently); }, enumerable: true },
            kill: { value: (exit_code = 0) => { self.kill(exit_code); }, enumerable: true },
            add_exit_listener: { value: (listener: (exit_code: number) => Promise<void> | void) => { self.add_exit_listener(listener); }, enumerable: true },
            create_timeout: { value: (callback: () => void, delay: number) => self.create_timeout(callback, delay), enumerable: true },
            cancel_timeout: { value: (id: number) => { self.cancel_timeout(id); }, enumerable: true },
            wait_for_timeout: { value: (id: number) => self.wait_for_timeout(id), enumerable: true },
            has_timeout: { value: (id: number) => self.has_timeout(id), enumerable: true },
            create_interval: { value: (callback: () => void, interval: number) => self.create_interval(callback, interval), enumerable: true },
            clear_interval: { value: (id: number) => { self.clear_interval(id); }, enumerable: true },
            create_window: { value: () => self.#create_window_for_userspace().create_userspace_proxy_as_full_window(), enumerable: true },
            run_thread: { value: (name: string, input?: unknown) => self.#manager._run_thread(self, name, input), enumerable: true },
            network_listen: { value: async (port: number) => {
                const socket = await self.network_listen(port);
                return socket.create_userspace_proxy();
            }, enumerable: true },
            network_connect: { value: async (host: string, port: number) => {
                const socket = await self.network_connect(host, port);
                return socket.create_userspace_proxy();
            }, enumerable: true },
            network_add_manager_listener: { value: (event: NetworkManagerEvent, listener: NetworkManagerEventListener) => {
                self.network_add_manager_listener(event, listener);
            }, enumerable: true },
            network_remove_manager_listener: { value: (event: NetworkManagerEvent, listener: NetworkManagerEventListener) => {
                self.network_remove_manager_listener(event, listener);
            }, enumerable: true },
            bound_ports: { get: () => self.bound_ports, enumerable: true },
        });

        return finalise_userspace_proxy(proxy, USERSPACE_PROCESS_ANNOTATIONS, [
            self
        ]);
    }
}

/**
 * How the RPC layer accesses the process manager's userspace proxy: these members read synchronously, everything else goes to the kernel.
 * @hidden
 */
export const USERSPACE_PROCESS_MANAGER_ANNOTATIONS = {
    ipc_manager: "eager_handle",
    list_pids: "mirrored",
} as const;

export interface UserspaceProcessManager {
    /** @hidden */
    readonly [sync_members]?: (member: keyof typeof USERSPACE_PROCESS_MANAGER_ANNOTATIONS) => void;
    readonly ipc_manager: UserspaceIPCManager;
    list_pids(): number[];
    get_process(pid: number): UserspaceOtherProcessContext | undefined;
    kill(pid: number, exit_code?: number): boolean;
}

export class ProcessManager implements MirrorSource {
    readonly [mirror_source] = true as const;

    readonly #processes: Map<number, ProcessContext> = new Map();
    #next_pid = 1;

    readonly #wm: AbstractWindowManager | null;
    readonly #ipc_manager: IPCManager = new IPCManager(this);
    readonly #net_manager: AbstractNetworkManager | null = null;

    // processes that have been killed but are still tearing down (e.g. their isothread not yet terminated)
    readonly #terminating: Set<Promise<void>> = new Set();

    constructor(wm: AbstractWindowManager | null = null, net_manager: AbstractNetworkManager | null = null) {
        this.#wm = wm;
        this.#net_manager = net_manager;
    }

    #thread_runner: ThreadRunner | null = null;

    /**
     * Kernel only. Sets how processes run their thread functions, as that needs the kernel (program code and the isothread manager).
     */
    set_thread_runner(runner: ThreadRunner): void {
        this.#thread_runner = runner;
    }

    _run_thread(process: ProcessContext, name: string, input: unknown): Promise<unknown> {
        if (!this.#thread_runner) {
            return Promise.reject(new Error("Threads are not available"));
        }

        return this.#thread_runner(process, name, input);
    }

    get window_manager(): AbstractWindowManager | null {
        return this.#wm;
    }

    get ipc_manager(): IPCManager {
        return this.#ipc_manager;
    }

    get network_manager(): AbstractNetworkManager | null {
        return this.#net_manager;
    }

    dispose_all(): void {
        this.#ipc_manager.dispose_all();

        for (const process of this.#processes.values()) {
            process.dispose_resources();
        }

        this.#processes.clear();
    }

    create_process(terminal: AbstractTerminal, source_command: ParsedCommandLine, shell?: AbstractShell, initial_cwd = "/"): ProcessContext {
        const pid = this.#next_pid++;
        const context = new ProcessContext(pid, terminal, source_command, this, shell, initial_cwd);
        this.#processes.set(pid, context);
        notify_mirror_change(this);
        return context;
    }

    get_process(pid: number): ProcessContext | undefined {
        return this.#processes.get(pid);
    }

    list_pids(): number[] {
        return Array.from(this.#processes.keys());
    }

    mark_terminated(pid: number, terminated?: Promise<void>): void {
        this.#processes.delete(pid);

        if (terminated) {
            this.#terminating.add(terminated);
            terminated.then(() => this.#terminating.delete(terminated));
        }

        notify_mirror_change(this);
    }

    async wait_for_terminations(): Promise<void> {
        // a teardown can kill more processes, so keep going until none are left
        while (this.#terminating.size > 0) {
            await Promise.all([...this.#terminating]);
        }
    }

    kill(pid: number, exit_code = 0): boolean {
        const process = this.#processes.get(pid);
        if (!process) {
            return false;
        }

        process.kill(exit_code);
        return true;
    }

    create_userspace_proxy(process_pid: number): UserspaceProcessManager {
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const self = this;
        const proxy = Object.create(null);

        const ipc_mgr_proxy = self.#ipc_manager.create_userspace_proxy(process_pid);

        Object.defineProperties(proxy, {
            ipc_manager: { get: () => ipc_mgr_proxy, enumerable: true },
            list_pids: { value: () => self.list_pids(), enumerable: true },
            get_process: { value: (pid: number) => {
                const process = self.get_process(pid);
                return process ? process.create_userspace_proxy_as_other_process() : undefined;
            }, enumerable: true },
            kill: { value: (pid: number, exit_code?: number) => self.kill(pid, exit_code), enumerable: true },
        });

        return finalise_userspace_proxy(proxy, USERSPACE_PROCESS_MANAGER_ANNOTATIONS, [
            self
        ]);
    }
}

// TODO: store kernel privilege state on processcontext
// TODO: dead flag
// TODO: allow windows to gracefully close on kill
