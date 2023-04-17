import type { WrappedTerminal } from "./term_ctl";
import type { ProgramRegistry } from "./prog_registry";

export interface ANSIDict {
    FG: { [key: string]: string },
    BG: { [key: string]: string },
    STYLE: { [key: string]: string },
    PREFABS: { [key: string]: string }
}

export interface ProgramMainData {
    term: WrappedTerminal,
    args: string[],
    ANSI: ANSIDict,
    registry: ProgramRegistry
}

export type ProgramMain = (data: ProgramMainData) => number;

export interface Program {
    name: string,
    description: string,
    usage_suffix: string,
    flags: { [key: string]: string }, // { flag: flag_description }
    main: ProgramMain
}
