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

export type arg_descriptions = { [key: string]: string | arg_descriptions }; // any level of nested key:string pairs. each key is a section title, until the innermost object, in which they are pairs of argument name and description.
export interface Program {
    name: string,
    description: string,
    usage_suffix: string,
    arg_descriptions: arg_descriptions,
    node_opt_out?: boolean, // default false, if true it will not be registered if running in node
    hide_from_help?: boolean, // default false, if true it will be hidden from the program listing in help, but can still be found by typing help <program>. useful for services
    main: ProgramMain,
    completion?: CompletionGenerator,
    compat?: string // should be set to "2.0.0" for programs that have been ported to the 2.0.0+ API
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