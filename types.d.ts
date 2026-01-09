import type { Kernel } from "./kernel";
import type { WrappedTerminal } from "./term_ctl";
import type { ProcessContext } from "./processes";
import type { AbstractShell } from "./abstract_shell";
export interface ProgramMainData {
    kernel: Kernel;
    term: WrappedTerminal;
    shell?: AbstractShell;
    process: ProcessContext;
    args: string[];
    unsubbed_args: string[];
    raw_parts: string[];
}
export type ProgramMain = (data: ProgramMainData) => Promise<number>;
export type arg_descriptions = {
    [key: string]: string | arg_descriptions;
};
export interface Program {
    name: string;
    description: string;
    usage_suffix: string;
    arg_descriptions: arg_descriptions;
    node_opt_out?: boolean;
    hide_from_help?: boolean;
    main: ProgramMain;
    completion?: CompletionGenerator;
}
export interface CompletionData {
    term: WrappedTerminal;
    kernel: Kernel;
    shell?: AbstractShell;
    args: string[];
    unsubbed_args: string[];
    raw_parts: string[];
    current_partial: string;
    arg_index: number;
}
export type CompletionGenerator = (data: CompletionData) => Promise<string[] | null> | AsyncGenerator<string>;
export interface ProgramRegistrant {
    program: Program;
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
