import { ProgramRegistry, UserspaceProgramRegistry } from "./prog_registry";
import { AbstractFileSystem, type UserspaceFileSystem } from "./filesystem";
import { SoundRegistry } from "./sfx_registry";
import { AbstractWindowManager, UserspaceWindowManager } from "./windowing";
import { IPCManager, ProcessContext, ProcessManager, UserspaceIPCManager, UserspaceProcessManager } from "./processes";
import type { AbstractShell } from "../abstract_shell";
import { type WrappedTerminal } from "./term_ctl";
export interface SpawnResult {
    process: ProcessContext;
    completion: Promise<number>;
}
export interface UserspaceKernel {
    readonly privileged: boolean;
    get_program_registry(): UserspaceProgramRegistry;
    get_sound_registry(): SoundRegistry;
    get_fs(): UserspaceFileSystem;
    get_window_manager(): UserspaceWindowManager | null;
    has_window_manager(): boolean;
    get_process_manager(): UserspaceProcessManager;
    get_ipc(): UserspaceIPCManager;
    get_env_info(): {
        version: string;
        env: string;
    };
    spawn(cmd_or_line_parse: string | ParsedCommandLine, explicit_args?: string[], shell?: AbstractShell): SpawnResult;
    request_privilege(reason: string): Promise<Kernel | false>;
}
export interface ParsedCommandLine {
    command: string;
    args: string[];
    unsubbed_args: string[];
    raw_parts: string[];
    run_in_bg: boolean;
}
export declare class Kernel {
    #private;
    get privileged(): boolean;
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
    spawn: (cmd_or_parse: string | ParsedCommandLine, explicit_args?: string[], shell?: AbstractShell, start_privileged?: boolean) => SpawnResult;
    panic(message: string, debug_info?: string): void;
    boot(on_init_spawned?: (kernel: Kernel) => Promise<void>): Promise<boolean>;
    request_privilege(reason: string, process: ProcessContext): Promise<Kernel | false>;
    constructor(term: WrappedTerminal, fs: AbstractFileSystem, prog_registry?: ProgramRegistry, sound_registry?: SoundRegistry, wm?: AbstractWindowManager);
    create_userspace_proxy(process: ProcessContext): Promise<UserspaceKernel>;
}
