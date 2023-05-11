import type { WrappedTerminal } from "./term_ctl";

export interface ProgramMainData {
    term: WrappedTerminal,
    args: string[],
    unsubbed_args: string[],
}

export type ProgramMain = (data: ProgramMainData) => number;
export type AsyncProgramMain = (data: ProgramMainData) => Promise<number>;

export type arg_descriptions = { [key: string]: string | arg_descriptions }; // any level of nested key:string pairs. each key is a section title, until the innermost object, in which they are pairs of argument name and description.
export interface Program {
    name: string,
    description: string,
    usage_suffix: string,
    arg_descriptions: arg_descriptions,
}

export interface SyncProgram extends Program {
    main: ProgramMain,
}

export interface AsyncProgram extends Program {
    async_main: AsyncProgramMain,
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