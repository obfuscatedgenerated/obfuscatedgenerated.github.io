import type { WrappedTerminal } from "./term_ctl";
export interface ProgramMainData {
    term: WrappedTerminal;
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
    main: ProgramMain;
    completion?: CompletionGenerator;
}
export interface CompletionData {
    term: WrappedTerminal;
    args: string[];
    unsubbed_args: string[];
    raw_parts: string[];
    current_partial: string;
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
