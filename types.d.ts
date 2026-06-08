import type { Kernel, UserspaceKernel } from "./kernel";
import type { AbstractTerminal } from "./kernel/term_ctl";
import type { ProcessContext, UserspaceProcessContext } from "./kernel/processes";
import type { AbstractShell } from "./abstract_shell";
import type { sdk } from "./kernel/program_sdk";
export interface ProgramMainData<K = UserspaceKernel> {
    /**
      Methods to interact with the kernel.<br />
      By default, this is the {@link UserspaceKernel} interface.<br />
      If you expect your program to have immediate privileged access, (i.e. init system, drivers) use the {@link PrivilegedProgram} types / Program<Kernel> generics.
      Otherwise, use {@link UserspaceKernel.request_privilege kernel.request_privilege()} to access a privileged kernel.
    **/
    kernel: K;
    /**
     * Terminal I/O methods.
     */
    term: AbstractTerminal;
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
    sdk: typeof sdk;
}
export type PrivilegedProgramMainData = ProgramMainData<Kernel>;
export type ProgramMain<K = UserspaceKernel> = (data: ProgramMainData<K>) => Promise<number>;
export type PrivilegedProgramMain = ProgramMain<Kernel>;
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
export interface Program<K = UserspaceKernel> {
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
     * Async entry point of the program, returning the exit code.
     */
    main: ProgramMain<K>;
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
export type PrivilegedProgram = Program<Kernel>;
export interface CompletionData {
    term: AbstractTerminal;
    kernel: UserspaceKernel;
    shell?: AbstractShell;
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
 * Returns a list of possible completions (or as a generator). Return null to fall back to default completion behaviour (file paths).
 * @group Program Types
 * @category Programs
 */
export type CompletionGenerator = (data: CompletionData) => Promise<string[] | null> | AsyncGenerator<string>;
