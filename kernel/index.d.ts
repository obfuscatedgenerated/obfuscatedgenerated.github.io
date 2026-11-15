import { AbstractFileSystem, type UserspaceFileSystem } from "./filesystem";
import { AbstractWindowManager, UserspaceWindowManager } from "./windowing";
import { AbstractNetworkManager, UserspaceNetworkManager } from "./network";
import { AbstractPlatformAPI, UserspacePlatformAPI } from "./platform";
import { IPCManager, ProcessContext, ProcessManager, UserspaceIPCManager, UserspaceProcessContext, UserspaceProcessManager } from "./processes";
import { AbstractShell } from "../abstract_shell";
import { CompletionData, CompletionGenerator, KernelFuncs, Program, ProgramMain, ProgramMetadata, RequestKernelFunc, ThreadFuncs } from "../types";
import { type AbstractTerminal } from "./term_ctl";
import { AbstractIsoThreadManager } from "./isothreads";
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
 * For the privileged API, see {@link Kernel}.
 *
 * @group Userspace
 * @category Kernel
 */
export interface UserspaceKernel<F extends KernelFuncs = KernelFuncs> {
    /**
     * Whether this kernel interface has privileged access (false for UserspaceKernel interface).
     */
    readonly privileged: boolean;
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
     * Access the chosen {@link UserspaceNetworkManager} for this kernel, if any.
     */
    get_network_manager(): UserspaceNetworkManager | null;
    /**
     * Determine if a network manager is present.
     */
    has_network_manager(): boolean;
    /**
     * Access the {@link UserspacePlatformAPI} for this kernel, if any.
     */
    get_platform(): UserspacePlatformAPI | null;
    /**
     * Determine if a platform API is present.
     */
    has_platform(): boolean;
    /**
     * Access the {@link UserspaceProcessManager} for this kernel.
     */
    get_process_manager(): UserspaceProcessManager;
    /**
     * Access the {@link UserspaceIPCManager} for this kernel.
     */
    get_ipc(): UserspaceIPCManager;
    has_isothread_manager(): boolean;
    get_isothread_manager_unique_type_name(): string | null;
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
    spawn(cmd_or_line_parse: string | ParsedCommandLine, explicit_args?: string[], shell?: AbstractShell): Promise<SpawnResult>;
    find_program(name: string): Promise<{
        code_path?: string;
        metadata: ProgramMetadata;
    } | null>;
    list_programs(): Promise<{
        name: string;
        metadata: ProgramMetadata;
        builtin: boolean;
    }[]>;
    /**
     * Runs a program's tab completion. Isolated programs complete in their own thread, so their code never loads in the caller's realm.
     * @returns The completions, or null to fall back to default completion.
     */
    complete(name: string, data: CompletionData): Promise<string[] | null>;
    /**
     * Requests that one of the calling program's own kernel functions runs in kernel space. Rejects with a "NotAllowedError" if not granted, or a "KernelFuncNotFoundError" if the function is not defined in the program's kernel_funcs object.
     */
    request_kernel_func: RequestKernelFunc<F>;
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
export interface FoundProgram {
    code_path: string | null;
    metadata: ProgramMetadata;
}
export interface ProgramCode {
    main: ProgramMain;
    completion?: CompletionGenerator;
    kernel_funcs?: KernelFuncs;
    threads?: ThreadFuncs;
}
export type VirtualProgram = Program & Pick<ProgramCode, "kernel_funcs" | "threads">;
/**
 * Where program code is evaluated. Only kernelspace exists until isothreads are implemented; an isothread host will be added as another kind.
 */
export type ProgramCodeHost = {
    readonly kind: "kernel";
};
export declare const KERNEL_HOST: ProgramCodeHost;
/**
 * Interface for interacting with the kernel.
 *
 * For the userspace API, see {@link UserspaceKernel}.
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
     * Access the chosen {@link AbstractNetworkManager} implementation for this kernel, if any.
     */
    get_network_manager(): AbstractNetworkManager | null;
    /**
     * Determine if a network manager is present.
     */
    has_network_manager(): boolean;
    /**
     * Access the chosen {@link AbstractPlatformAPI} implementation for this kernel, if any.
     */
    get_platform(): AbstractPlatformAPI | null;
    /**
     * Determine if a platform API is present.
     */
    has_platform(): boolean;
    /**
     * Access the {@link ProcessManager} for this kernel.
     */
    get_process_manager(): ProcessManager;
    /**
     * Access the {@link IPCManager} for this kernel.
     */
    get_ipc(): IPCManager;
    get_isothread_manager(): AbstractIsoThreadManager | null;
    has_isothread_manager(): boolean;
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
    find_program(name: string): Promise<FoundProgram | null>;
    list_programs(): Promise<{
        name: string;
        metadata: ProgramMetadata;
        builtin: boolean;
    }[]>;
    /**
     * Runs a program's tab completion. Programs that would be isothreaded when spawned also complete in an isothread, so their code never loads in the kernel realm.
     * @returns The completions, or null to fall back to default completion.
     */
    complete(name: string, data: CompletionData): Promise<string[] | null>;
    /**
     * Loads a program's code in the given host. Builtins always come from the virtual program store.
     */
    load_program(name_or_found: string | FoundProgram, host: ProgramCodeHost): Promise<ProgramCode>;
    /**
     * Spawn a new process.
     * @param cmd_or_parse Either a command string or a pre-parsed command line to execute.
     * @param spawning_process The process that is spawning this new process. This should only be null if you're the kernel, which you aren't!
     * @param explicit_args Ignored if cmd_or_parse is a {@link ParsedCommandLine}. Otherwise, the explicit arguments to pass to the command.
     * @param shell The shell that is spawning this process, if any.
     * @param start_privileged Whether the spawner vouches for the program, so it isn't asked about: a kernelspace program runs without the prompt to allow it, and a userspace program's kernel funcs run without asking. It never gives a userspace program the kernel.
     * @param term_override An optional {@link AbstractTerminal} to use for this process instead of the default kernel terminal. This is useful for daemons running virtual terminals.
     * @returns A {@link SpawnResult} containing the process context and a promise for its completion. You are responsible for terminating the process on an error or after execution.
     */
    spawn(spawning_process: ProcessContext | UserspaceProcessContext | null, cmd_or_parse: string | ParsedCommandLine, explicit_args?: string[], shell?: AbstractShell, start_privileged?: boolean, term_override?: AbstractTerminal): Promise<SpawnResult>;
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
     * @returns A boolean indicating whether privileged access should be granted.
     */
    request_privilege(reason: string, process: ProcessContext): Promise<boolean>;
    /**
     * Runs one of the calling process's own kernel functions in kernel space, after prompting. Typed per program via {@link UserspaceKernel.request_kernel_func}.
     */
    request_kernel_func(process: ProcessContext, name: string, reason: string, input?: unknown): Promise<unknown>;
    /**
     * Runs one of the calling process's own thread functions, in an isothread when possible. Typed per program via {@link UserspaceProcessContext.run_thread}.
     */
    run_thread(process: ProcessContext, name: string, input?: unknown): Promise<unknown>;
    power_off(): void;
    reboot(): void;
    constructor(opts: {
        term: AbstractTerminal;
        fs: AbstractFileSystem;
        wm?: AbstractWindowManager;
        net_manager?: AbstractNetworkManager;
        platform?: AbstractPlatformAPI;
        virtual_programs?: Map<string, VirtualProgram>;
        isothread_manager?: AbstractIsoThreadManager;
    });
    /**
     * Create a userspace proxy of this kernel for use in a userspace process.
     * @param process The process to create the proxy for.
     * @returns A {@link UserspaceKernel} proxy of this kernel.
     */
    create_userspace_proxy(process: ProcessContext): UserspaceKernel;
}
