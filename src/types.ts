import type {Kernel, UserspaceKernel} from "./kernel";
import type {AbstractTerminal, UserspaceTerminal} from "./kernel/term_ctl";
import type {ProcessContext, UserspaceProcessContext} from "./kernel/processes";
import type {AbstractShell} from "./abstract_shell";
import type {sdk} from "./kernel/program_sdk";

type EitherKernel = Kernel | UserspaceKernel;

export interface ProgramMainData<K extends EitherKernel = UserspaceKernel> {
    /**
     Methods to interact with the kernel.<br />
     By default, this is the {@link UserspaceKernel} interface.<br />
     If you expect your program to have immediate privileged access, (i.e. init system, drivers) use the {@link PrivilegedProgram} types / Program<Kernel> generics.
     Otherwise, declare kernel_funcs and use {@link UserspaceKernel.request_kernel_func kernel.request_kernel_func()} to run them in kernel space.
     **/
    kernel: K,

    /**
     * Terminal I/O methods.
     */
    term: K extends Kernel ? AbstractTerminal : UserspaceTerminal;

    /**
     * The shell that invoked the program, if any.
     */
    shell?: AbstractShell;

    /**
     * Process context of the instanced program. Contains information and resource requesting.
     */
    process: K extends Kernel ? ProcessContext : UserspaceProcessContext;

    /**
     * Arguments passed to the program, after variable substitution (e.g. $HOME, $?, etc).
     */
    args: string[],

    /**
     * Arguments passed to the program, without variable substitution. Useful for programs that want to do their own parsing / substitution.
     */
    unsubbed_args: string[],

    /**
     * Raw command parts, including program name and unparsed args.
     */
    raw_parts: string[],

    /**
     * Abstract classes to extend to provide customised implementations. Note that the types associated with them are already available via the npm package, but these are required to actually extend classes at runtime.
     */
    sdk: K extends Kernel ? typeof sdk : undefined
}

export type ProgramMain<K extends EitherKernel = UserspaceKernel> = (data: ProgramMainData<K>) => Promise<number>;

/**
 * Data given to a kernel function: the real kernel, and the calling process's own context, so anything it creates is owned (and cleaned up) by the caller.
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
 */
export type KernelFunc<Input = never, Result = unknown> = (data: KernelFuncData, input: Input) => Result | Promise<Result>;
export type KernelFuncs = Record<string, KernelFunc<any, any>>;

type KernelFuncInput<F extends KernelFunc<any, any>> = Parameters<F>[1];

/**
 * Requests that one of the calling program's own kernel functions runs in kernel space. Rejects with a "NotAllowedError" if not granted.
 */
// input is optional only when the func accepts undefined
export type RequestKernelFunc<F extends KernelFuncs> = <N extends keyof F & string>(
    name: N,
    reason: string,
    ...input: undefined extends KernelFuncInput<F[N]> ? [input?: KernelFuncInput<F[N]>] : [input: KernelFuncInput<F[N]>]
) => Promise<Awaited<ReturnType<F[N]>>>;

export type UserspaceProgramMainData<F extends KernelFuncs = KernelFuncs> = ProgramMainData<UserspaceKernel<F>>;

/**
 * Properties related to how the program should be displayed in 3rd party GUI listings, such as start menus, search, etc.
 * @group Program Types
 * @category Programs
 */
export interface ProgramGUIProps {
    /**
     * The friendly name of the program to show in GUI listings. Should be concise.
     */
    display_name: string,

    /**
     * Default arguments to launch the program when launched from a GUI, where they often cannot be changed.
     */
    start_with_args?: string[],

    /**
     * If true, the program will be launched in a new terminal window, rather than running silently in the background.
     */
    starts_in_terminal_window?: boolean,

    /**
     * Whether to keep the terminal window open after the program exits.
     * Only applies if {@link starts_in_terminal_window} is true. the default behaviour is *on_error*.
     */
    keep_terminal_open_after_run?: "never" | "on_error" | "always",

    /**
     * Path in the {@link AbstractFilesystem fs} of an icon to show in program listings. Should be png format (ideally no larger than 512x512) or an SVG.
     */
    icon_path?: string
}

/**
 * Any level of nested key:string pairs. Each key is a section title, until the innermost object, in which they are pairs of argument name and description.
 * @group Program Types
 * @category Programs
 */
export type ArgDescriptions = { [key: string]: string | ArgDescriptions };


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
     * Should be set to "2.0.0" for programs that have been ported to the 2.0.0+ API. if not set, considered to be "1.x" legacy program that will not run.
     */
    compat?: string;

    /**
     * Optional GUI properties. If set, the program may be displayed in 3rd party GUI listings, such as start menus, search, etc with the provided display name and icon, and launched with the provided args.<br/>
     * If left blank, GUIs may not list the program as a user launchable program, but it can still be launched by typing its name in the terminal.
     */
    gui?: ProgramGUIProps;
}

interface UserspaceProgram<F extends KernelFuncs = KernelFuncs> extends BaseProgram<UserspaceProgramMainData<F>> {
    /**
     * The space the program should run in. Default is "user". If set to "kernel", the program will be run with privileged kernel access, and will have access to the full {@link Kernel} interface. If set to "user", the program will be run with limited {@link UserspaceKernel} access, and will not have access to privileged kernel methods.
     * Requesting kernel space will trigger a prompt whenever the program is ran, unless already granted when spawned by another privileged program. If the user denies the request, the program will not run.
     */
    space?: "user";

    /**
     * Functions that run in kernel space when requested with {@link UserspaceKernel.request_kernel_func kernel.request_kernel_func()} and granted.
     * They share nothing with main: everything goes through the input and the return value.
     */
    kernel_funcs?: F;
}

interface KernelspaceProgram extends BaseProgram<ProgramMainData<Kernel>> {
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
 * When defining kernel funcs, pass `typeof kernel_funcs` to the Program generic to get type safety on the kernel.request_kernel_func() method in main.
 */
export type Program<F extends KernelFuncs = KernelFuncs> = UserspaceProgram<F> | KernelspaceProgram;

export interface CompletionData {
    term: UserspaceTerminal,
    kernel: UserspaceKernel,
    shell?: AbstractShell,

    args: string[],
    unsubbed_args: string[],
    raw_parts: string[],

    /**
     * The current partially typed argument for completion.
     */
    current_partial: string,

    /**
     * Index of the argument being completed.
     */
    arg_index: number,
}

/**
 * Returns a list of possible completions (or as a generator). Return null to fall back to default completion behaviour (file paths).
 * @group Program Types
 * @category Programs
 */
export type CompletionGenerator = (data: CompletionData) => Promise<string[] | null> | AsyncGenerator<string>;

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

export type ProgramMetadata = DistributiveOmit<Program, "main" | "completion" | "kernel_funcs">;
