import type {Kernel} from "./kernel";
import type {WrappedTerminal} from "./term_ctl";
import type {ProcessContext} from "./processes";
import type {AbstractShell} from "./abstract_shell";

export interface ProgramMainData {
    kernel: Kernel,
    term: WrappedTerminal,
    shell?: AbstractShell;
    process: ProcessContext,

    args: string[],
    unsubbed_args: string[],
    raw_parts: string[], // raw command parts, including program name and unparsed args
}

export type ProgramMain = (data: ProgramMainData) => Promise<number>;

export type ArgDescriptions = { [key: string]: string | ArgDescriptions }; // any level of nested key:string pairs. each key is a section title, until the innermost object, in which they are pairs of argument name and description.
export interface Program {
    // command to execute the program, should ideally match the filename for consistency
    name: string,

    // a short description of the program, shown in help listings
    description: string,

    // suffix to show in usage, e.g. "file [options]"
    usage_suffix: string,

    // descriptions of each argument the program takes, shown in help <program>
    arg_descriptions: ArgDescriptions,

    // default false, if true it will not be registered if running in node
    node_opt_out?: boolean,

    // default false, if true it will be hidden from the program listing in help, but can still be found by typing help <program>. useful for services and triggers
    hide_from_help?: boolean,

    // async entry point of the program, returning the exit code
    main: ProgramMain,

    // optional tab completion generator
    completion?: CompletionGenerator,

    // should be set to "2.0.0" for programs that have been ported to the 2.0.0+ API. if not set, considered to be "1.x" legacy program that will not run.
    compat?: string
}

// TODO: move some of these to their correct modules

export interface CompletionData {
    term: WrappedTerminal,
    kernel: Kernel,
    shell?: AbstractShell,

    args: string[],
    unsubbed_args: string[],
    raw_parts: string[],
    current_partial: string,
    arg_index: number, // index of the argument being completed
}

// return null to fall back to default completion behavior (file paths)
export type CompletionGenerator = (data: CompletionData) => Promise<string[] | null> | AsyncGenerator<string>;

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