import type { WrappedTerminal } from "./term_ctl";
import type { ProgramRegistry } from "./prog_registry";

export interface ProgramMainData {
    term: WrappedTerminal,
    args: string[],
    unsubbed_args: string[],
    registry: ProgramRegistry,
}

export type ProgramMain = (data: ProgramMainData) => number;

export interface Program {
    name: string,
    description: string,
    usage_suffix: string,
    flags: { [key: string]: string }, // { flag: flag_description }
    main: ProgramMain
}


export interface KeyEvent {
    key: string;
    domEvent: KeyboardEvent;
}

export type KeyEventHandler = (event: KeyEvent, term: WrappedTerminal) => void;
export interface RegisteredKeyEventIdentifier {
    key?: string;
    domEventCode?: string;
}