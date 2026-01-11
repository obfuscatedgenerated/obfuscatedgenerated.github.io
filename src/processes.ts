import type {AbstractWindow, AbstractWindowManager} from "./windowing";
import type {AbstractShell} from "./abstract_shell";
import type {ParsedCommandLine} from "./kernel";

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
            for (const [channel_id, channel] of this.#channels) {
                const initiator_process = this.#process_manager.get_process(channel.initiator);
                const peer_process = this.#process_manager.get_process(channel.peer);

                if (!initiator_process || !peer_process) {
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

    channel_listen(channel_id: number, listening_pid: number, listener: IPCChannelListener): boolean {
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
            return false;
        }

        // notify listeners on the receiving end without blocking
        const to_pid = msg.to;
        const listeners = channel.listeners.get(to_pid);
        if (listeners) {
            for (const listener of listeners) {
                listener(msg).catch((err) => {
                    console.error("IPC channel listener error:", err);
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
            channel_listen: { value: (channel_id: number, listener: IPCChannelListener) => {
                return self.channel_listen(channel_id, process_pid, listener);
            }, enumerable: true },
            channel_unlisten: { value: (channel_id: number, listener: IPCChannelListener) => {
                return self.channel_unlisten(channel_id, process_pid, listener);
            }, enumerable: true },
            channel_send: { value: (channel_id: number, data: unknown) => {
                return self.channel_send(channel_id, process_pid, data);
            }, enumerable: true },
        });

        return Object.freeze(proxy);
    }
}

// TODO: could migrate the stuff where programs grab "scary" stuff like WindowManager and ProcessManager to be services

enum ProcessAttachment {
    FOREGROUND,
    BACKGROUND,
    DETACHED,
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

export class ProcessContext {
    readonly #pid: number;
    readonly #manager: ProcessManager;

    readonly #source_command: ParsedCommandLine;
    readonly #created_at: Date = new Date();
    readonly #shell: AbstractShell | undefined;

    readonly #exit_listeners: Set<(exit_code: number) => Promise<void> | void> = new Set();

    #attachment: ProcessAttachment = ProcessAttachment.FOREGROUND;
    #detach_silently = false;

    readonly #timeouts: Set<number> = new Set();
    readonly #timeout_promises: Map<number, Set<{resolve: (finished: boolean) => void}>> = new Map(); // timeout id -> promise resolvers (for waiting on timeouts but listening to cancellation)
    readonly #timeout_cancel_callbacks: Map<number, () => void> = new Map(); // timeout id -> cancel callback

    readonly #intervals: Set<number> = new Set();

    readonly #windows: Set<AbstractWindow> = new Set();

    constructor(pid: number, source_command: ParsedCommandLine, registry: ProcessManager, shell?: AbstractShell) {
        this.#pid = pid;
        this.#source_command = source_command;
        this.#manager = registry;

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
    }

    dispose_resources(): void {
        this.#intervals.forEach((id) => {
            clearInterval(id);
        });

        this.#timeouts.forEach((id) => {
            clearTimeout(id);
        });

        this.#timeout_promises.clear();
        this.#timeout_cancel_callbacks.clear();

        this.#windows.forEach((win) => {
            win.dispose();
        });
    }

    kill(exit_code = 0): void {
        this.dispose_resources();

        this.#manager.mark_terminated(this.#pid);

        for (const listener of this.#exit_listeners) {
            listener(exit_code);
        }
    }

    add_exit_listener(listener: (exit_code: number) => Promise<void> | void): void {
        this.#exit_listeners.add(listener);
    }

    create_timeout(callback: () => void, delay: number, on_cancel? : () => void): number {
        const id = window.setTimeout(() => {
            this.#timeouts.delete(id);

            // resolve any waiters
            if (this.#timeout_promises.has(id)) {
                const resolvers = this.#timeout_promises.get(id)!;
                for (const { resolve } of resolvers) {
                    resolve(true);
                }
                this.#timeout_promises.delete(id);
            }

            callback();

            if (on_cancel) {
                this.#timeout_cancel_callbacks.delete(id);
            }
        }, delay);

        this.#timeouts.add(id);

        if (on_cancel) {
            this.#timeout_cancel_callbacks.set(id, on_cancel);
        }

        return id;
    }

    cancel_timeout(id: number): void {
        if (this.#timeouts.has(id)) {
            clearTimeout(id);
            this.#timeouts.delete(id);

            // resolve any waiters as cancelled
            if (this.#timeout_promises.has(id)) {
                const resolvers = this.#timeout_promises.get(id)!;
                for (const {resolve} of resolvers) {
                    resolve(false);
                }
                this.#timeout_promises.delete(id);
            }

            // call cancel callback if exists
            if (this.#timeout_cancel_callbacks.has(id)) {
                const cancel_callback = this.#timeout_cancel_callbacks.get(id)!;
                cancel_callback();
                this.#timeout_cancel_callbacks.delete(id);
            }
        }
    }

    has_timeout(id: number): boolean {
        return this.#timeouts.has(id);
    }

    create_interval(callback: () => void, interval: number): number {
        const id = window.setInterval(callback, interval);
        this.#intervals.add(id);
        return id;
    }

    has_interval(id: number): boolean {
        return this.#intervals.has(id);
    }

    clear_interval(id: number): void {
        if (this.#intervals.has(id)) {
            clearInterval(id);
            this.#intervals.delete(id);
        }
    }

    async wait_for_timeout(id: number): Promise<boolean> {
        if (!this.#timeouts.has(id)) {
            throw new Error(`Timeout ID ${id} does not exist.`);
        }

        return new Promise<boolean>((resolve) => {
            if (!this.#timeout_promises.has(id)) {
                this.#timeout_promises.set(id, new Set());
            }

            this.#timeout_promises.get(id)!.add({ resolve });
        });
    }

    create_window(): AbstractWindow | null {
        const wm = this.#manager.window_manager;
        if (!wm) {
            return null;
        }

        const win = new wm.Window(this.#pid);
        this.#windows.add(win);

        // clean up on close
        win.add_event_listener("close", () => {
            this.#windows.delete(win);
        });

        return win;
    }


    create_userspace_proxy_as_other_process(): UserspaceOtherProcessContext {
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const self = this;
        const proxy = Object.create(null);

        Object.defineProperties(proxy, {
            pid: { get: () => self.pid, enumerable: true },
            created_at: { get: () => self.created_at, enumerable: true },
            is_detached: { get: () => self.is_detached, enumerable: true },
            is_background: { get: () => self.is_background, enumerable: true },
            is_foreground: { get: () => self.is_foreground, enumerable: true },
            attachment: { get: () => self.attachment, enumerable: true },
            source_command: { get: () => self.source_command, enumerable: true },
        });

        return Object.freeze(proxy);
    }

    create_userspace_proxy(): UserspaceProcessContext {
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const self = this;
        const proxy = Object.create(null);

        Object.defineProperties(proxy, {
            pid: { get: () => self.pid, enumerable: true },
            created_at: { get: () => self.created_at, enumerable: true },
            is_detached: { get: () => self.is_detached, enumerable: true },
            is_background: { get: () => self.is_background, enumerable: true },
            is_foreground: { get: () => self.is_foreground, enumerable: true },
            attachment: { get: () => self.attachment, enumerable: true },
            source_command: { get: () => self.source_command, enumerable: true },

            detach: { value: (silently = false) => { self.detach(silently); }, enumerable: true },
            kill: { value: (exit_code = 0) => { self.kill(exit_code); }, enumerable: true },
            create_timeout: { value: (callback: () => void, delay: number) => self.create_timeout(callback, delay), enumerable: true },
            cancel_timeout: { value: (id: number) => { self.cancel_timeout(id); }, enumerable: true },
            create_interval: { value: (callback: () => void, interval: number) => self.create_interval(callback, interval), enumerable: true },
            clear_interval: { value: (id: number) => { self.clear_interval(id); }, enumerable: true },
            create_window: { value: () => self.create_window(),  enumerable: true },
        });

        return Object.freeze(proxy);
    }
}

export interface UserspaceProcessManager {
    readonly ipc_manager: UserspaceIPCManager;
    list_pids(): number[];
    get_process(pid: number): UserspaceOtherProcessContext | undefined;
    kill(pid: number, exit_code?: number): boolean;
}

export class ProcessManager {
    readonly #processes: Map<number, ProcessContext> = new Map();
    #next_pid = 1;

    readonly #wm: AbstractWindowManager | null;
    readonly #ipc_manager: IPCManager = new IPCManager(this);

    constructor(wm: AbstractWindowManager | null = null) {
        this.#wm = wm;
    }

    get window_manager(): AbstractWindowManager | null {
        return this.#wm;
    }

    get ipc_manager(): IPCManager {
        return this.#ipc_manager;
    }

    dispose_all(): void {
        this.#ipc_manager.dispose_all();

        for (const process of this.#processes.values()) {
            process.dispose_resources();
        }

        this.#processes.clear();
    }

    create_process(source_command: ParsedCommandLine, shell?: AbstractShell): ProcessContext {
        const pid = this.#next_pid++;
        const context = new ProcessContext(pid, source_command, this, shell);
        this.#processes.set(pid, context);
        return context;
    }

    get_process(pid: number): ProcessContext | undefined {
        return this.#processes.get(pid);
    }

    list_pids(): number[] {
        return Array.from(this.#processes.keys());
    }

    mark_terminated(pid: number): void {
        this.#processes.delete(pid);
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

        return Object.freeze(proxy);
    }
}
