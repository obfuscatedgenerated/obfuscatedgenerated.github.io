import type { WrappedTerminal } from "./term_ctl";

export interface ProgramMainData {
    term: WrappedTerminal,
    args: string[],
    unsubbed_args: string[],
}

export type ProgramMain = (data: ProgramMainData) => Promise<number>;

export type arg_descriptions = { [key: string]: string | arg_descriptions }; // any level of nested key:string pairs. each key is a section title, until the innermost object, in which they are pairs of argument name and description.
export interface Program {
    name: string,
    description: string,
    usage_suffix: string,
    arg_descriptions: arg_descriptions,
    node_opt_out?: boolean, // default false, if true it will not be registered if running in node
    main: ProgramMain
}

export interface ProgramRegistrant {
    program: Program,
    built_in: boolean,
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