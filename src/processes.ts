import type {LineParseResultCommand} from "./term_ctl";
import type {AbstractWindow, AbstractWindowManager} from "./windowing";

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

export class IPCManager {
    private readonly _process_manager: ProcessManager;

    // service name -> IPCService
    private readonly _services: Map<string, IPCService> = new Map();

    // channel id -> IPCChannel
    private readonly _channels: Map<number, IPCChannel> = new Map();
    private _next_channel_id = 1;

    constructor(process_manager: ProcessManager) {
        this._process_manager = process_manager;

        // clean up dead services and channels periodically
        // TODO: add a global exit listener to process manager to be immediately notified of process exits
        setInterval(() => {
            // clean up services
            for (const [name, service] of this._services) {
                const process = this._process_manager.get_process(service.pid);
                if (!process) {
                    this._services.delete(name);
                }
            }

            // clean up channels
            for (const [channel_id, channel] of this._channels) {
                const initiator_process = this._process_manager.get_process(channel.initiator);
                const peer_process = this._process_manager.get_process(channel.peer);

                if (!initiator_process || !peer_process) {
                    this._channels.delete(channel_id);
                }
            }
        }, 10000);
    }

    dispose_all(): void {
        this._services.clear();
        this._channels.clear();
    }

    service_register(name: string, pid: number, on_connection: IPCServiceOnConnectionCallback): void {
        this._services.set(name, { pid, on_connection });
    }

    // TODO: disconnect callback? or change the on_connection to on_event with different event types

    service_unregister(name: string): void {
        this._services.delete(name);
    }

    service_lookup(name: string): number | undefined {
        const service = this._services.get(name);

        if (!service) {
            return undefined;
        }

        // check if process is still running
        const process = this._process_manager.get_process(service.pid);
        if (!process) {
            this._services.delete(name);
            return undefined;
        }

        return service.pid;
    }

    create_channel(initiator_pid: number, service_name: string): number | null {
        const channel_id = this._next_channel_id++;
        const peer_pid = this.service_lookup(service_name);

        if (!peer_pid) {
            return null;
        }

        this._channels.set(channel_id, {
            initiator: initiator_pid,
            peer: peer_pid,

            initiator_to_peer_queue: [],
            peer_to_initiator_queue: [],

            listeners: new Map(),
        });

        // notify service of new connection without blocking
        const service = this._services.get(service_name)!;
        service.on_connection(channel_id, initiator_pid).catch((err) => {
            console.error("IPC service on_connection error:", err);
        });

        return channel_id;
    }

    destroy_channel(channel_id: number): void {
        this._channels.delete(channel_id);
    }

    channel_listen(channel_id: number, listening_pid: number, listener: IPCChannelListener): boolean {
        const channel = this._channels.get(channel_id);
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
        const channel = this._channels.get(channel_id);
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
        const channel = this._channels.get(channel_id);
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
}

// TODO: could migrate the stuff where programs grab "scary" stuff like WindowManager and ProcessManager to be services

enum ProcessAttachment {
    FOREGROUND,
    BACKGROUND,
    DETACHED,
}

export class ProcessContext {
    private readonly _pid: number;
    private readonly _manager: ProcessManager;

    private readonly _source_command: LineParseResultCommand;
    private readonly _created_at: Date = new Date();

    private readonly _exit_listeners: Set<(exit_code: number) => Promise<void> | void> = new Set();

    private _attachment: ProcessAttachment = ProcessAttachment.FOREGROUND;
    private _detach_silently = false;

    private readonly _timeouts: Set<number> = new Set();
    private readonly _timeout_promises: Map<number, Set<{resolve: (finished: boolean) => void}>> = new Map(); // timeout id -> promise resolvers (for waiting on timeouts but listening to cancellation)
    private readonly _timeout_cancel_callbacks: Map<number, () => void> = new Map(); // timeout id -> cancel callback

    private readonly _intervals: Set<number> = new Set();

    private readonly _windows: Set<AbstractWindow> = new Set();

    constructor(pid: number, source_command: LineParseResultCommand, registry: ProcessManager) {
        this._pid = pid;
        this._source_command = source_command;
        this._manager = registry;

        if (source_command.run_in_bg) {
            this._attachment = ProcessAttachment.BACKGROUND;
        }
    }

    get pid(): number {
        return this._pid;
    }

    get source_command(): LineParseResultCommand {
        return this._source_command;
    }

    get created_at(): Date {
        return this._created_at;
    }

    get is_detached(): boolean {
        return this._attachment === ProcessAttachment.DETACHED;
    }

    get is_background(): boolean {
        return this._attachment === ProcessAttachment.BACKGROUND;
    }

    get is_foreground(): boolean {
        return this._attachment === ProcessAttachment.FOREGROUND;
    }

    get attachment(): ProcessAttachment {
        return this._attachment;
    }

    get detaches_silently(): boolean {
        return this._detach_silently;
    }

    detach(silently = false): void {
        this._attachment = ProcessAttachment.DETACHED;
        this._detach_silently = silently;
    }

    dispose_resources(): void {
        this._intervals.forEach((id) => {
            clearInterval(id);
        });

        this._timeouts.forEach((id) => {
            clearTimeout(id);
        });

        this._timeout_promises.clear();
        this._timeout_cancel_callbacks.clear();

        this._windows.forEach((win) => {
            win.dispose();
        });
    }

    kill(exit_code = 0): void {
        this.dispose_resources();

        this._manager.mark_terminated(this._pid);

        for (const listener of this._exit_listeners) {
            listener(exit_code);
        }
    }

    add_exit_listener(listener: (exit_code: number) => Promise<void> | void): void {
        this._exit_listeners.add(listener);
    }

    create_timeout(callback: () => void, delay: number, on_cancel? : () => void): number {
        const id = window.setTimeout(() => {
            this._timeouts.delete(id);

            // resolve any waiters
            if (this._timeout_promises.has(id)) {
                const resolvers = this._timeout_promises.get(id)!;
                for (const { resolve } of resolvers) {
                    resolve(true);
                }
                this._timeout_promises.delete(id);
            }

            callback();

            if (on_cancel) {
                this._timeout_cancel_callbacks.delete(id);
            }
        }, delay);

        this._timeouts.add(id);

        if (on_cancel) {
            this._timeout_cancel_callbacks.set(id, on_cancel);
        }

        return id;
    }

    cancel_timeout(id: number): void {
        if (this._timeouts.has(id)) {
            clearTimeout(id);
            this._timeouts.delete(id);

            // resolve any waiters as cancelled
            if (this._timeout_promises.has(id)) {
                const resolvers = this._timeout_promises.get(id)!;
                for (const {resolve} of resolvers) {
                    resolve(false);
                }
                this._timeout_promises.delete(id);
            }

            // call cancel callback if exists
            if (this._timeout_cancel_callbacks.has(id)) {
                const cancel_callback = this._timeout_cancel_callbacks.get(id)!;
                cancel_callback();
                this._timeout_cancel_callbacks.delete(id);
            }
        }
    }

    has_timeout(id: number): boolean {
        return this._timeouts.has(id);
    }

    create_interval(callback: () => void, interval: number): number {
        const id = window.setInterval(callback, interval);
        this._intervals.add(id);
        return id;
    }

    has_interval(id: number): boolean {
        return this._intervals.has(id);
    }

    clear_interval(id: number): void {
        if (this._intervals.has(id)) {
            clearInterval(id);
            this._intervals.delete(id);
        }
    }

    async wait_for_timeout(id: number): Promise<boolean> {
        if (!this._timeouts.has(id)) {
            throw new Error(`Timeout ID ${id} does not exist.`);
        }

        return new Promise<boolean>((resolve) => {
            if (!this._timeout_promises.has(id)) {
                this._timeout_promises.set(id, new Set());
            }

            this._timeout_promises.get(id)!.add({ resolve });
        });
    }

    create_window(): AbstractWindow | null {
        const wm = this._manager.window_manager;
        if (!wm) {
            return null;
        }

        const win = new wm.Window(this._pid);
        this._windows.add(win);

        // clean up on close
        win.add_event_listener("close", () => {
            this._windows.delete(win);
        });

        return win;
    }
}

export class ProcessManager {
    private readonly _processes: Map<number, ProcessContext> = new Map();
    private _next_pid = 1;

    private readonly _wm: AbstractWindowManager | null;
    private readonly _ipc_manager: IPCManager = new IPCManager(this);

    constructor(wm: AbstractWindowManager | null = null) {
        this._wm = wm;
    }

    get window_manager(): AbstractWindowManager | null {
        return this._wm;
    }

    get ipc_manager(): IPCManager {
        return this._ipc_manager;
    }

    dispose_all(): void {
        this._ipc_manager.dispose_all();

        for (const process of this._processes.values()) {
            process.dispose_resources();
        }

        this._processes.clear();
    }

    create_process(source_command: LineParseResultCommand): ProcessContext {
        const pid = this._next_pid++;
        const context = new ProcessContext(pid, source_command, this);
        this._processes.set(pid, context);
        return context;
    }

    get_process(pid: number): ProcessContext | undefined {
        return this._processes.get(pid);
    }

    list_pids(): number[] {
        return Array.from(this._processes.keys());
    }

    mark_terminated(pid: number): void {
        this._processes.delete(pid);
    }
}
