import { ProgramRegistry, UserspaceProgramRegistry } from "./prog_registry";
import { AbstractFileSystem, type UserspaceFileSystem } from "./filesystem";
import { SoundRegistry } from "./sfx_registry";
import { AbstractWindowManager, UserspaceWindowManager } from "./windowing";
import { IPCManager, ProcessContext, ProcessManager, UserspaceIPCManager, UserspaceProcessManager } from "./processes";
import type { AbstractShell } from "../abstract_shell";
import { type WrappedTerminal } from "./term_ctl";
/**
 * Result of a spawned process.
 * @property process The {@link ProcessContext} of the spawned process.
 * @property completion A promise that resolves to the exit code of the process. Note that the program has already started executing by the time this promise is returned. Awaiting it is not necessary to start execution.
 *
 * @group Userspace
 * @category Kernel
 */
export interface SpawnResult {
    process: ProcessContext;
    completion: Promise<number>;
}
/**
 * Interface for interacting with the kernel from userspace.
 *
 * @group Userspace
 * @category Kernel
 */
export interface UserspaceKernel {
    /**
     * Whether this kernel interface has privileged access (false for UserspaceKernel interface).
     */
    readonly privileged: boolean;
    /**
     * Access the {@link UserspaceProgramRegistry} for this kernel.
     */
    get_program_registry(): UserspaceProgramRegistry;
    /**
     * Access the {@link SoundRegistry} for this kernel.
     */
    get_sound_registry(): SoundRegistry;
    /**
     * Access the chosen {@link UserspaceFileSystem} for this kernel.
     */
    get_fs(): UserspaceFileSystem;
    /**
     * Access the chosen {@link UserspaceWindowManager} for this kernel, if any.
     */
    get_window_manager(): UserspaceWindowManager | null;
    /**
     * Determine if a window manager is present.
     */
    has_window_manager(): boolean;
    /**
     * Access the {@link UserspaceProcessManager} for this kernel.
     */
    get_process_manager(): UserspaceProcessManager;
    /**
     * Access the {@link UserspaceIPCManager} for this kernel.
     */
    get_ipc(): UserspaceIPCManager;
    /**
     * Access the version and environment info assigned to this kernel.
     */
    get_env_info(): {
        version: string;
        env: string;
    };
    /**
     * Spawn a new process.
     * @param cmd_or_line_parse Either a command string or a pre-parsed command line to execute.
     * @param explicit_args Ignored if cmd_or_line_parse is a {@link ParsedCommandLine}. Otherwise, the explicit arguments to pass to the command.
     * @param shell The shell that is spawning this process, if any.
     * @returns A {@link SpawnResult} containing the process context and a promise for its completion. You are responsible for terminating the process on an error or after execution.
     */
    spawn(cmd_or_line_parse: string | ParsedCommandLine, explicit_args?: string[], shell?: AbstractShell): SpawnResult;
    /**
     * Request privileged access from the kernel.
     * @param reason The reason for requesting privileged access.
     * @returns A promise that resolves to a privileged {@link Kernel} interface if approved, or false if denied.
     */
    request_privilege(reason: string): Promise<Kernel | false>;
}
/**
 * Parsed command line structure.
 * @property command The command (program name) to execute.
 * @property args The arguments to pass to the command, trimmed and with any substitutions applied (e.g. variables).
 * @property unsubbed_args The arguments to pass to the command, trimmed but without any substitutions applied.
 * @property raw_parts The raw parts of the command line, including the command and all unparsed but split arguments, without trimming or substitutions applied.
 * @property run_in_bg Whether the command is to be run in the background.
 *
 * @group Userspace
 * @category Kernel
 */
export interface ParsedCommandLine {
    command: string;
    args: string[];
    unsubbed_args: string[];
    raw_parts: string[];
    run_in_bg: boolean;
}
/**
 * Interface for interacting with the kernel.
 *
 * @group Kernel (Privileged)
 * @category Kernel
 */
export declare class Kernel {
    #private;
    /**
     * Whether this kernel interface has privileged access (always true for Kernel class).
     */
    get privileged(): boolean;
    /**
     * Whether the kernel has panicked.
     */
    get panicked(): boolean;
    /**
     * Access the {@link ProgramRegistry} for this kernel.
     */
    get_program_registry(): ProgramRegistry;
    /**
     * Access the {@link SoundRegistry} for this kernel.
     */
    get_sound_registry(): SoundRegistry;
    /**
     * Access the chosen {@link AbstractFileSystem} implementation for this kernel.
     */
    get_fs(): AbstractFileSystem;
    /**
     * Access the chosen {@link AbstractWindowManager} implementation for this kernel, if any.
     */
    get_window_manager(): AbstractWindowManager | null;
    /**
     * Determine if a window manager is present.
     */
    has_window_manager(): boolean;
    /**
     * Access the {@link ProcessManager} for this kernel.
     */
    get_process_manager(): ProcessManager;
    /**
     * Access the {@link IPCManager} for this kernel.
     */
    get_ipc(): IPCManager;
    /**
     * Access the version and environment info assigned to this kernel.
     */
    get_env_info(): {
        version: string;
        env: string;
    };
    /**
     * Assign version and environment info to this kernel.
     * @param version The version of OllieOS running.
     * @param env Custom string representing the environment OllieOS is running in (i.e. "web", "node", etc).
     */
    set_env_info(version: string, env: string): void;
    /**
     * Spawn a new process.
     * @param cmd_or_parse Either a command string or a pre-parsed command line to execute.
     * @param explicit_args Ignored if cmd_or_parse is a {@link ParsedCommandLine}. Otherwise, the explicit arguments to pass to the command.
     * @param shell The shell that is spawning this process, if any.
     * @param start_privileged Whether to start the process with privileged kernel access. The process will not need to use {@link request_privilege} if this is true!!!
     * @returns A {@link SpawnResult} containing the process context and a promise for its completion. You are responsible for terminating the process on an error or after execution.
     */
    spawn: (cmd_or_parse: string | ParsedCommandLine, explicit_args?: string[], shell?: AbstractShell, start_privileged?: boolean) => SpawnResult;
    /**
     * Throw all the toys out of the pram.
     * @param message The panic message to show at the top of the panic screen.
     * @param debug_info Optional debug information to show below the panic message. It is usually helpful to pass the error message and stack trace here.
     */
    panic(message: string, debug_info?: string): void;
    /**
     * Boot the kernel by starting the init system.
     * @param on_init_spawned Optional callback that is called once the init program has been spawned.
     * @param after_panic Optional callback that is called after a panic occurs.
     * @returns A promise that resolves at the end of all OllieOS execution (i.e. when init exits). Returns true for a successful finish, false for an unexpected exit (but neither case is good if expecting the system to keep running!).
     */
    boot(on_init_spawned?: (kernel: Kernel) => Promise<void>, after_panic?: (message: string, debug_info?: string) => void): Promise<boolean>;
    /**
     * Request privileged access from the kernel.
     * @param reason The reason for requesting privileged access.
     * @param process The process requesting privileged access.
     * @returns A promise that resolves to a privileged {@link Kernel} interface if approved, or false if denied.
     */
    request_privilege(reason: string, process: ProcessContext): Promise<Kernel | false>;
    constructor(term: WrappedTerminal, fs: AbstractFileSystem, prog_registry?: ProgramRegistry, sound_registry?: SoundRegistry, wm?: AbstractWindowManager);
    /**
     * Create a userspace proxy of this kernel for use in a userspace process.
     * @param process The process to create the proxy for.
     * @returns A {@link UserspaceKernel} proxy of this kernel.
     */
    create_userspace_proxy(process: ProcessContext): UserspaceKernel;
}
