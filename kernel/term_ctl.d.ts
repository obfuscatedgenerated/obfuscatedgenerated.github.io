import { ITerminalOptions, Terminal } from "@xterm/xterm";
import type { KeyEvent, KeyEventHandler } from "../types";
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
export interface ReadLineBuffer {
    current_line: string;
    current_index: number;
    set_current_line: (new_line: string) => void;
    set_current_index: (new_index: number) => void;
}
export type ReadLineKeyHandler = (event: KeyEvent, term: WrappedTerminal, buffer: ReadLineBuffer) => void | Promise<void> | boolean | Promise<boolean>;
export declare class WrappedTerminal extends Terminal {
    #private;
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
    read_line: (custom_key_handlers?: {
        [key_string: string]: ReadLineKeyHandler;
    }, custom_printable_handler?: ReadLineKeyHandler) => Promise<string>;
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
    handle_kernel_panic: (message: string, process_info: string, debug_info?: string) => void;
    constructor(xterm_opts?: ITerminalOptions);
}
