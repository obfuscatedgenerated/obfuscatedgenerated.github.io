import type { Kernel, UserspaceKernel } from "./kernel";
import type { WrappedTerminal } from "./term_ctl";
import type { ProcessContext } from "./processes";
import type { AbstractShell } from "./abstract_shell";
export interface ProgramMainData<K = UserspaceKernel> {
    kernel: K;
    term: WrappedTerminal;
    shell?: AbstractShell;
    process: ProcessContext;
    args: string[];
    unsubbed_args: string[];
    raw_parts: string[];
}
export type PrivilegedProgramMainData = ProgramMainData<Kernel>;
export type ProgramMain<K = UserspaceKernel> = (data: ProgramMainData<K>) => Promise<number>;
export type PrivilegedProgramMain = ProgramMain<Kernel>;
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
}
export type PrivilegedProgram = Program<Kernel>;
export interface CompletionData {
    term: WrappedTerminal;
    kernel: UserspaceKernel;
    shell?: AbstractShell;
    args: string[];
    unsubbed_args: string[];
    raw_parts: string[];
    current_partial: string;
    arg_index: number;
}
export type CompletionGenerator = (data: CompletionData) => Promise<string[] | null> | AsyncGenerator<string>;
export interface ProgramRegistrant {
    program: Program<unknown>;
    built_in: boolean;
}
export interface KeyEvent {
    key: string;
    domEvent: KeyboardEvent;
}
export type KeyEventHandler = (event: KeyEvent, term: WrappedTerminal) => void | Promise<void>;
export interface RegisteredKeyEventIdentifier {
    key?: string;
    domEventCode?: string;
}
