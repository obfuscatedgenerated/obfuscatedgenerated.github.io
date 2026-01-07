import { IDisposable, ITerminalOptions, Terminal } from "@xterm/xterm";
import { ProgramRegistry } from "./prog_registry";
import type { AbstractFileSystem } from "./filesystem";
import type { KeyEvent, KeyEventHandler, RegisteredKeyEventIdentifier } from "./types";
import { SoundRegistry } from "./sfx_registry";
import { AbstractWindowManager } from "./windowing";
import { IPCManager, ProcessContext, ProcessManager } from "./processes";
export declare const NEWLINE = "\r\n";
export declare const NON_PRINTABLE_REGEX: RegExp;
export declare const ANSI_ESCAPE_REGEX: RegExp;
export declare const ANSI_UNESCAPED_REGEX: RegExp;
export declare const ANSI: {
    FG: {
        reset: string;
        black: string;
        red: string;
        green: string;
        yellow: string;
        blue: string;
        magenta: string;
        cyan: string;
        white: string;
        gray: string;
    };
    BG: {
        reset: string;
        black: string;
        red: string;
        green: string;
        yellow: string;
        blue: string;
        magenta: string;
        cyan: string;
        white: string;
        gray: string;
    };
    STYLE: {
        reset_all: string;
        bold: string;
        dim: string;
        no_bold_or_dim: string;
        italic: string;
        no_italic: string;
        underline: string;
        double_underline: string;
        no_underline: string;
        inverse: string;
        no_inverse: string;
        hidden: string;
        no_hidden: string;
        strikethrough: string;
        no_strikethrough: string;
        negative: string;
        positive: string;
    };
    CURSOR: {
        invisible: string;
        visible: string;
    };
    PREFABS: {
        program_name: string;
        error: string;
        variable_name: string;
        file_path: string;
        dir_name: string;
        secret: string;
    };
};
export interface LineParseResultCommand {
    type: "command";
    command: string;
    args: string[];
    unsubbed_args: string[];
    raw_parts: string[];
    run_in_bg: boolean;
}
export interface LineParseResultVarAssignment {
    type: "var";
    var_name: string;
    var_value: string;
}
export type LineParseResult = LineParseResultCommand | LineParseResultVarAssignment | null;
export interface SpawnResult {
    process: ProcessContext;
    completion: Promise<number>;
}
export declare class WrappedTerminal extends Terminal {
    _disposable_onkey: IDisposable;
    _history: string[];
    _current_line: string;
    _current_index: number;
    _current_history_index: number;
    _preline: string;
    _prompt_suffix: string;
    _process_manager: ProcessManager;
    _prog_registry: ProgramRegistry;
    _sfx_registry: SoundRegistry;
    _fs: AbstractFileSystem;
    _wm: AbstractWindowManager | null;
    _key_handlers: Map<RegisteredKeyEventIdentifier, {
        handler: KeyEventHandler;
        block: boolean;
    }[]>;
    _on_printable_handlers: KeyEventHandler[];
    _key_event_queue: KeyEvent[];
    _is_handling_key_events: boolean;
    _vars: Map<string, string>;
    _aliases: Map<string, string>;
    _panicked: boolean;
    get ansi(): {
        FG: {
            reset: string;
            black: string;
            red: string;
            green: string;
            yellow: string;
            blue: string;
            magenta: string;
            cyan: string;
            white: string;
            gray: string;
        };
        BG: {
            reset: string;
            black: string;
            red: string;
            green: string;
            yellow: string;
            blue: string;
            magenta: string;
            cyan: string;
            white: string;
            gray: string;
        };
        STYLE: {
            reset_all: string;
            bold: string;
            dim: string;
            no_bold_or_dim: string;
            italic: string;
            no_italic: string;
            underline: string;
            double_underline: string;
            no_underline: string;
            inverse: string;
            no_inverse: string;
            hidden: string;
            no_hidden: string;
            strikethrough: string;
            no_strikethrough: string;
            negative: string;
            positive: string;
        };
        CURSOR: {
            invisible: string;
            visible: string;
        };
        PREFABS: {
            program_name: string;
            error: string;
            variable_name: string;
            file_path: string;
            dir_name: string;
            secret: string;
        };
    };
    get newline(): string;
    get non_printable_regex(): RegExp;
    get ansi_escape_regex(): RegExp;
    get ansi_unescaped_regex(): RegExp;
    get_program_registry(): ProgramRegistry;
    get_sound_registry(): SoundRegistry;
    get_fs(): AbstractFileSystem;
    get_window_manager(): AbstractWindowManager | null;
    has_window_manager(): boolean;
    get_process_manager(): ProcessManager;
    get_ipc(): IPCManager;
    list_variables(): Map<string, string>;
    get_variable(name: string): string | undefined;
    set_variable(name: string, value: string): void;
    unset_variable(name: string): boolean;
    list_aliases(): Map<string, string>;
    get_alias(name: string): string | undefined;
    set_alias(name: string, value: string): void;
    unset_alias(name: string): boolean;
    clear_history(): void;
    reset_current_vars(reset_history_index?: boolean): void;
    get_current_line(): string;
    get_current_index(): number;
    insert_preline(newline?: boolean): Promise<void>;
    set_preline(preline: string): void;
    set_prompt(prompt: string): void;
    get_prompt_suffix(): string;
    set_prompt_suffix(suffix: string): void;
    next_line(): Promise<void>;
    parse_line: (line: string) => LineParseResult;
    spawn: (command: string, args?: string[], original_line_parse?: LineParseResultCommand) => SpawnResult;
    execute: (line: string, edit_doc_title?: boolean, program_final_completion_callback?: (exit_code?: number) => void) => Promise<boolean>;
    _search_handlers: (key: string | undefined, domEventCode: string | undefined, strict?: boolean) => {
        handler: KeyEventHandler;
        block: boolean;
    }[];
    /**
     * Registers a key event handler.
     * Handlers with no filter run BEFORE filtered handlers.
     *
     * @param {KeyEventHandler} handler The handler to register
     * @param {{ keyString?: string, domEventCode?: string, block: boolean, high_priority: boolean }} props The properties of the handler. Key is the key as a string to filter by, domEventCode is the DOM event code to filter by. Block determines whether the event should be blocked from bubbling up to following handlers and/or the terminal display. High priority determines whether the handler should be placed at the beginning of the handler list.
     * @returns {() => () => void} A function to unregister the handler
     */
    register_key_event_handler: (handler: KeyEventHandler, props: {
        keyString?: string;
        domEventCode?: string;
        block?: boolean;
        high_priority?: boolean;
    }) => () => void;
    _handle_key_event: (e: KeyEvent) => Promise<void>;
    /**
     * Registers a handler that is called when any printable key is pressed.
     * @param handler  - The handler to register
     * @param high_priority - If true, the handler will be placed at the beginning of the handler list (cannot run before the default printable key handler)
     */
    register_on_printable_key_event_handler: (handler: KeyEventHandler, high_priority?: boolean) => void;
    _enqueue_key_event: (e: KeyEvent) => void;
    _handle_key_event_queue: () => Promise<void>;
    wait_for_keypress: () => Promise<KeyEvent>;
    get_text: (max_length?: number) => Promise<string>;
    word_wrap(text: string, width: number): string;
    copy(): void;
    paste(): void;
    copy_or_paste(): void;
    run_script(path: any): Promise<void>;
    panic(message: string, debug_info?: string): void;
    constructor(fs: AbstractFileSystem, prog_registry?: ProgramRegistry, sound_registry?: SoundRegistry, xterm_opts?: ITerminalOptions, register_builtin_handlers?: boolean, wm?: AbstractWindowManager);
}
