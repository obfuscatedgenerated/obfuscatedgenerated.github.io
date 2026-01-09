import { ProgramRegistry } from "./prog_registry";
import type { AbstractFileSystem } from "./filesystem";
import { SoundRegistry } from "./sfx_registry";
import { AbstractWindowManager } from "./windowing";
import { IPCManager, ProcessContext, ProcessManager } from "./processes";
import type { AbstractShell } from "./abstract_shell";
import type { LineParseResultCommand } from "./programs/core/ash/parser";
import { type WrappedTerminal } from "./term_ctl";
export interface SpawnResult {
    process: ProcessContext;
    completion: Promise<number>;
}
export declare class Kernel {
    _term: WrappedTerminal;
    _process_manager: ProcessManager;
    _prog_registry: ProgramRegistry;
    _sfx_registry: SoundRegistry;
    _fs: AbstractFileSystem;
    _wm: AbstractWindowManager | null;
    _panicked: boolean;
    _env_info: {
        version: string;
        env: string;
    };
    get panicked(): boolean;
    get_program_registry(): ProgramRegistry;
    get_sound_registry(): SoundRegistry;
    get_fs(): AbstractFileSystem;
    get_window_manager(): AbstractWindowManager | null;
    has_window_manager(): boolean;
    get_process_manager(): ProcessManager;
    get_ipc(): IPCManager;
    get_env_info(): {
        version: string;
        env: string;
    };
    set_env_info(version: string, env: string): void;
    spawn: (command: string, args?: string[], shell?: AbstractShell, original_line_parse?: LineParseResultCommand) => SpawnResult;
    panic(message: string, debug_info?: string): void;
    boot(): Promise<boolean>;
    constructor(term: WrappedTerminal, fs: AbstractFileSystem, prog_registry?: ProgramRegistry, sound_registry?: SoundRegistry, wm?: AbstractWindowManager);
}
