import type { Kernel, UserspaceKernel } from "./kernel";
import type { AbstractTerminal, UserspaceTerminal } from "./kernel/term_ctl";
import type { ProcessContext, UserspaceProcessContext } from "./kernel/processes";
import type { AbstractShell, UserspaceShell } from "./abstract_shell";
import type { sdk } from "./kernel/program_sdk";
import type { Remote } from "./kernel/rpc";
type EitherKernel = Kernel | UserspaceKernel;
export interface ProgramMainData<K extends EitherKernel = UserspaceKernel, T extends ThreadFuncs = ThreadFuncs> {
    /**
     Methods to interact with the kernel.<br />
     By default, this is the {@link UserspaceKernel} interface, as seen across the RPC layer (see {@link Remote}).<br />
     Programs that need full access for their whole run (i.e. init system, drivers) set space: "kernel", and get the {@link Kernel} instead.
     Otherwise, export kernel_funcs and use {@link UserspaceKernel.request_kernel_func kernel.request_kernel_func()} to run them in kernel space.
     **/
    kernel: K extends Kernel ? K : Remote<K>;
    /**
     * Terminal I/O methods.
     */
    term: K extends Kernel ? AbstractTerminal : Remote<UserspaceTerminal>;
    /**
     * The shell that invoked the program, if any.
     */
    shell?: K extends Kernel ? AbstractShell : Remote<UserspaceShell>;
    /**
     * Process context of the instanced program. Contains information and resource requesting.
     */
    process: K extends Kernel ? ProcessContext<T> : Remote<UserspaceProcessContext<T>>;
    /**
     * Arguments passed to the program, after variable substitution (e.g. $HOME, $?, etc).
     */
    args: string[];
    /**
     * Arguments passed to the program, without variable substitution. Useful for programs that want to do their own parsing / substitution.
     */
    unsubbed_args: string[];
    /**
     * Raw command parts, including program name and unparsed args.
     */
    raw_parts: string[];
    /**
     * Abstract classes to extend to provide customised implementations. Note that the types associated with them are already available via the npm package, but these are required to actually extend classes at runtime.
     */
    sdk: K extends Kernel ? typeof sdk : undefined;
}
export type ProgramMain<K extends EitherKernel = UserspaceKernel> = (data: ProgramMainData<K>) => Promise<number>;
/**
 * Data given to a kernel function: the real kernel, and the calling process's own context, so anything it creates is owned (and cleaned up) by the caller.
 * @group Program Types
 * @category Kernel Functions
 */
export interface KernelFuncData {
    kernel: Kernel;
    process: ProcessContext;
    term: AbstractTerminal;
    shell?: AbstractShell;
}
/**
 * A function of a userspace program that runs in kernel space when requested with {@link UserspaceKernel.request_kernel_func kernel.request_kernel_func()} and granted.
 * The input comes from the program's untrusted side, so it should be validated before use.
 * Note that kernel funcs do not run in the same context/module as main, so they cannot share state or variables. Everything must be passed through the input and return value.
 * @group Program Types
 * @category Kernel Functions
 */
export type KernelFunc<Input = never, Result = unknown> = (data: KernelFuncData, input: Input) => Result | Promise<Result>;
export type KernelFuncs = Record<string, KernelFunc<any, any>>;
type SectionFunc = (data: any, input: any) => unknown;
type SectionInput<F extends SectionFunc> = Parameters<F>[1];
type SectionInputArgs<F extends SectionFunc> = undefined extends SectionInput<F> ? [input?: SectionInput<F>] : [input: SectionInput<F>];
/**
 * Requests that one of the calling program's own kernel functions runs in kernel space. Rejects with a "NotAllowedError" if not granted.
 * @group Program Types
 * @category Kernel Functions
 */
export type RequestKernelFunc<F extends KernelFuncs> = <N extends keyof F & string>(name: N, reason: string, ...input: SectionInputArgs<F[N]>) => Promise<Awaited<ReturnType<F[N]>>>;
/**
 * Data given to a thread function: the same userspace access as the program's main, whatever space the program itself runs in.
 * @group Program Types
 * @category Threads
 */
export interface ThreadData {
    kernel: Remote<UserspaceKernel>;
    process: Remote<UserspaceProcessContext>;
    term: Remote<UserspaceTerminal>;
}
/**
 * A function of a program that runs in an isothread of its own when requested with {@link UserspaceProcessContext.run_thread process.run_thread()}, keeping heavy work off the thread the program runs on.
 * Note that thread funcs do not run in the same context/module as main, so they cannot share state or variables. Everything must be passed through the input and return value.
 * @group Program Types
 * @category Threads
 */
export type ThreadFunc<Input = never, Result = unknown> = (data: ThreadData, input: Input) => Result | Promise<Result>;
export type ThreadFuncs = Record<string, ThreadFunc<any, any>>;
/**
 * Runs one of the calling program's own thread functions in a new isothread, resolving to its result. Rejects with a "ThreadNotFoundError" if the function is not defined in the program's threads export.
 * @group Program Types
 * @category Threads
 */
export type RunThread<T extends ThreadFuncs> = <N extends keyof T & string>(name: N, ...input: SectionInputArgs<T[N]>) => Promise<Awaited<ReturnType<T[N]>>>;
/**
 * The sections a program exports besides its main: pass `{kernel_funcs: typeof kernel_funcs, threads: typeof threads}` (or just the ones the program has) to the Program generic to get type safety when requesting them.
 * @group Program Types
 * @category Programs
 */
export interface ProgramSections {
    kernel_funcs?: KernelFuncs;
    threads?: ThreadFuncs;
}
type NoSections = Record<never, never>;
type KernelFuncsOf<S extends ProgramSections> = S["kernel_funcs"] extends KernelFuncs ? S["kernel_funcs"] : NoSections;
type ThreadsOf<S extends ProgramSections> = S["threads"] extends ThreadFuncs ? S["threads"] : NoSections;
export type UserspaceProgramMainData<S extends ProgramSections = NoSections> = ProgramMainData<UserspaceKernel<KernelFuncsOf<S>>, ThreadsOf<S>>;
/**
 * Properties related to how the program should be displayed in 3rd party GUI listings, such as start menus, search, etc.
 * @group Program Types
 * @category Programs
 */
export interface ProgramGUIProps {
    /**
     * The friendly name of the program to show in GUI listings. Should be concise.
     */
    display_name: string;
    /**
     * Default arguments to launch the program when launched from a GUI, where they often cannot be changed.
     */
    start_with_args?: string[];
    /**
     * If true, the program will be launched in a new terminal window, rather than running silently in the background.
     */
    starts_in_terminal_window?: boolean;
    /**
     * Whether to keep the terminal window open after the program exits.
     * Only applies if {@link starts_in_terminal_window} is true. the default behaviour is *on_error*.
     */
    keep_terminal_open_after_run?: "never" | "on_error" | "always";
    /**
     * Path in the {@link AbstractFilesystem fs} of an icon to show in program listings. Should be png format (ideally no larger than 512x512) or an SVG.
     */
    icon_path?: string;
}
/**
 * Any level of nested key:string pairs. Each key is a section title, until the innermost object, in which they are pairs of argument name and description.
 * @group Program Types
 * @category Programs
 */
export type ArgDescriptions = {
    [key: string]: string | ArgDescriptions;
};
export interface BaseProgram<D extends ProgramMainData<EitherKernel> = ProgramMainData<EitherKernel>> {
    /**
     * Command to execute the program, should ideally match the filename for consistency.
     */
    name: string;
    /**
     * A short description of the program, shown in help listings
     */
    description: string;
    /**
     * The suffix to show in usage, e.g. "file [options]", where the suffix is "[options]"
     */
    usage_suffix: string;
    /**
     * Descriptions of each argument the program takes, shown in help <program>
     */
    arg_descriptions: ArgDescriptions;
    /**
     * Default false, if true it will not be registered if running in node.js environments (useful for web specific or incompatible programs)
     */
    node_opt_out?: boolean;
    /**
     * Default false, if true it will be hidden from the program listing in help, but can still be found by typing help <program>. Useful for services and triggers.
     */
    hide_from_help?: boolean;
    /**
     * The space the program should run in. Default is "user". If set to "kernel", the program will be run with privileged kernel access, and will have access to the full {@link Kernel} interface. If set to "user", the program will be run with limited {@link UserspaceKernel} access, and will not have access to privileged kernel methods.
     * Requesting kernel space will trigger a prompt whenever the program is ran, unless already granted when spawned by another privileged program. If the user denies the request, the program will not run.
     */
    space?: "user" | "kernel";
    /**
     * Async entry point of the program, returning the exit code.
     */
    main: (data: D) => Promise<number>;
    /**
     * Optional tab completion generator.
     */
    completion?: CompletionGenerator;
    /**
     * The version of the program API the program is written for, e.g. "3.0.0". Programs written for an older major version than the OS's will not run. If not set, the program is considered a "1.x" legacy program.
     */
    compat?: string;
    /**
     * Optional GUI properties. If set, the program may be displayed in 3rd party GUI listings, such as start menus, search, etc with the provided display name and icon, and launched with the provided args.<br/>
     * If left blank, GUIs may not list the program as a user launchable program, but it can still be launched by typing its name in the terminal.
     */
    gui?: ProgramGUIProps;
}
interface UserspaceProgram<S extends ProgramSections = NoSections> extends BaseProgram<UserspaceProgramMainData<S>> {
    /**
     * The space the program should run in. Default is "user". If set to "kernel", the program will be run with privileged kernel access, and will have access to the full {@link Kernel} interface. If set to "user", the program will be run with limited {@link UserspaceKernel} access, and will not have access to privileged kernel methods.
     * Requesting kernel space will trigger a prompt whenever the program is ran, unless already granted when spawned by another privileged program. If the user denies the request, the program will not run.
     */
    space?: "user";
    /**
     * Default false. If true, the program runs in a frame instead of a worker, so it has a DOM, and its window's {@link UserspaceWindow.dom dom} is the frame's own document.
     * It is just as isolated, but shares the page's thread, and can only have one window.
     */
    needs_dom?: boolean;
    /**
     * Default false. If true, the program can connect to services on this device (localhost), e.g. a local development server.
     * The user is asked when the program is spawned (unless a trusted spawner started it with start_privileged), and the program doesn't run if they refuse.
     * It gives the program nothing else: no kernel access, and nothing on the rest of the local network.
     */
    needs_loopback?: boolean;
}
interface KernelspaceProgram<S extends ProgramSections = NoSections> extends BaseProgram<ProgramMainData<Kernel, ThreadsOf<S>>> {
    /**
     * The space the program should run in. Default is "user". If set to "kernel", the program will be run with privileged kernel access, and will have access to the full {@link Kernel} interface. If set to "user", the program will be run with limited {@link UserspaceKernel} access, and will not have access to privileged kernel methods.
     * Requesting kernel space will trigger a prompt whenever the program is ran, unless already granted when spawned by another privileged program. If the user denies the request, the program will not run.
     */
    space: "kernel";
    /**
     * The reason the program is privileged and requires kernel space. This will be shown to the user when requesting permission to run the program.
     */
    reason: string;
}
/**
 * When a program exports kernel_funcs or threads, name them in the generic to get type safety on kernel.request_kernel_func() and process.run_thread() in main,
 * e.g. `Program<{threads: typeof threads}>`. Kernel funcs are only available to userspace programs, threads to both.
 */
export type Program<S extends ProgramSections = NoSections> = UserspaceProgram<S> | KernelspaceProgram<S>;
export interface CompletionData {
    term: Remote<UserspaceTerminal>;
    kernel: Remote<UserspaceKernel>;
    shell?: Remote<UserspaceShell>;
    args: string[];
    unsubbed_args: string[];
    raw_parts: string[];
    /**
     * The current partially typed argument for completion.
     */
    current_partial: string;
    /**
     * Index of the argument being completed.
     */
    arg_index: number;
}
/**
 * What a caller passes to {@link UserspaceKernel.complete kernel.complete()}: the completion data, with the caller's shell or its proxy. The completion itself always gets the proxy.
 */
export type CompletionRequest = Omit<CompletionData, "shell"> & {
    shell?: AbstractShell | Remote<UserspaceShell>;
};
/**
 * Returns a list of possible completions (or as a generator). Return null to fall back to default completion behaviour (file paths).
 * @group Program Types
 * @category Programs
 */
export type CompletionGenerator = (data: CompletionData) => Promise<string[] | AsyncGenerator<string> | null> | AsyncGenerator<string>;
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type ProgramMetadata = DistributiveOmit<Program, "main" | "completion">;
export {};
