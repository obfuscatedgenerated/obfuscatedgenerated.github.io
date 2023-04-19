import type { WrappedTerminal } from "./term_ctl";
import type { ProgramRegistry } from "./prog_registry";

export interface ProgramMainData {
    term: WrappedTerminal,
    args: string[],
    unsubbed_args: string[],
    registry: ProgramRegistry,
}

export type ProgramMain = (data: ProgramMainData) => number;
export type AsyncProgramMain = (data: ProgramMainData) => Promise<number>;

export interface Program {
    name: string,
    description: string,
    usage_suffix: string,
    flags: { [key: string]: string }, // { flag: flag_description }
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