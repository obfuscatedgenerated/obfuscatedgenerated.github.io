import type { Kernel, UserspaceKernel } from "./kernel";
import type { AbstractTerminal } from "./kernel/term_ctl";
import type { ProcessContext, UserspaceProcessContext } from "./kernel/processes";
import type { AbstractShell } from "./abstract_shell";
export interface ProgramMainData<K = UserspaceKernel> {
    kernel: K;
    term: AbstractTerminal;
    shell?: AbstractShell;
    process: K extends Kernel ? ProcessContext : UserspaceProcessContext;
    args: string[];
    unsubbed_args: string[];
    raw_parts: string[];
}
export type PrivilegedProgramMainData = ProgramMainData<Kernel>;
export type ProgramMain<K = UserspaceKernel> = (data: ProgramMainData<K>) => Promise<number>;
export type PrivilegedProgramMain = ProgramMain<Kernel>;
/**
 * Properties related to how the program should be displayed in 3rd party GUI listings, such as start menus, search, etc.
 */
export interface ProgramGUIProps {
    display_name: string;
    start_with_args?: string[];
    starts_in_terminal_window?: boolean;
    keep_terminal_open_after_run?: "never" | "on_error" | "always";
}
export type ArgDescriptions = {
    [key: string]: string | ArgDescriptions;
};
export interface Program<K = UserspaceKernel> {
    name: string;
    description: string;
    usage_suffix: string;
    arg_descriptions: ArgDescriptions;
    node_opt_out?: boolean;
    hide_from_help?: boolean;
    main: ProgramMain<K>;
    completion?: CompletionGenerator;
    compat?: string;
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
    current_partial: string;
    arg_index: number;
}
export type CompletionGenerator = (data: CompletionData) => Promise<string[] | null> | AsyncGenerator<string>;
