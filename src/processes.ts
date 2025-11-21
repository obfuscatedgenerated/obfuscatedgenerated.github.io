import type {LineParseResultCommand} from "./term_ctl";
import type {AbstractWindow, AbstractWindowManager} from "./windowing";

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
    private readonly _timeouts: Set<number> = new Set();
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

    detach(): void {
        this._attachment = ProcessAttachment.DETACHED;
    }

    kill(exit_code = 0): void {
        this._intervals.forEach((id) => {
            clearInterval(id);
        });

        this._timeouts.forEach((id) => {
            clearTimeout(id);
        });

        this._windows.forEach((win) => {
            win.dispose();
        });

        this._manager.mark_terminated(this._pid);

        for (const listener of this._exit_listeners) {
            listener(exit_code);
        }
    }

    add_exit_listener(listener: (exit_code: number) => Promise<void> | void): void {
        this._exit_listeners.add(listener);
    }

    create_timeout(callback: () => void, delay: number): number {
        const id = window.setTimeout(() => {
            this._timeouts.delete(id);
            callback();
        }, delay);

        this._timeouts.add(id);
        return id;
    }

    create_interval(callback: () => void, interval: number): number {
        const id = window.setInterval(callback, interval);
        this._intervals.add(id);
        return id;
    }

    create_window(): AbstractWindow | null {
        const wm = this._manager.window_manager;
        if (!wm) {
            return null;
        }

        const win = new wm.Window(this._pid);
        this._windows.add(win);
        return win;
    }
}

export class ProcessManager {
    private readonly _processes: Map<number, ProcessContext> = new Map();
    private _next_pid = 1;

    private readonly _wm: AbstractWindowManager | null;

    constructor(wm: AbstractWindowManager | null = null) {
        this._wm = wm;
    }

    get window_manager(): AbstractWindowManager | null {
        return this._wm;
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
