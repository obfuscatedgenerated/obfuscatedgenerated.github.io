import { ANSI } from "../lib/ansi";
export interface KeyEvent {
    key: string;
    domEvent: KeyboardEvent;
}
export type KeyEventHandler = (event: KeyEvent, term: AbstractTerminal) => void | Promise<void>;
export interface RegisteredKeyEventIdentifier {
    key?: string;
    domEventCode?: string;
}
export interface ReadLineBuffer {
    current_line: string;
    current_index: number;
    set_current_line: (new_line: string) => void;
    set_current_index: (new_index: number) => void;
}
export type ReadLineKeyHandler = (event: KeyEvent, term: AbstractTerminal, buffer: ReadLineBuffer) => void | Promise<void> | boolean | Promise<boolean>;
/**
 * Key event as seen by userspace. Plain data only, never a DOM event.
 *
 * @group Userspace
 * @category Terminal
 */
export interface UserspaceKeyEvent {
    key: string;
    code?: string;
    /**
     * @deprecated Plain-object stand-in for the old DOM event. Use `key` and `code` instead.
     */
    domEvent: {
        key: string;
        code?: string;
    };
}
export type UserspaceKeyEventHandler = (event: UserspaceKeyEvent, term: UserspaceTerminal) => void | Promise<void>;
export type UserspaceReadLineKeyHandler = (event: UserspaceKeyEvent, term: UserspaceTerminal, buffer: ReadLineBuffer) => void | Promise<void> | boolean | Promise<boolean>;
export interface UserspaceKeyHandlerProps {
    keyString?: string;
    domEventCode?: string;
    block?: boolean;
}
/**
 * The terminal as seen by userspace programs.
 *
 * @group Userspace
 * @category Terminal
 */
export interface UserspaceTerminal {
    readonly cols: number;
    readonly rows: number;
    write(data: string | Uint8Array, callback?: () => void): void;
    writeln(data: string | Uint8Array, callback?: () => void): void;
    clear(): void;
    reset(): void;
    wait_for_keypress(): Promise<UserspaceKeyEvent>;
    read_line(custom_key_handlers?: {
        [key_string: string]: UserspaceReadLineKeyHandler;
    }, custom_printable_handler?: UserspaceReadLineKeyHandler): Promise<string>;
    /** @returns A function that unregisters the handler. */
    register_key_event_handler(handler: UserspaceKeyEventHandler, props: UserspaceKeyHandlerProps): () => void;
    /** @returns A function that unregisters the handler. */
    register_on_printable_key_event_handler(handler: UserspaceKeyEventHandler): () => void;
    get_custom_flag(flag: string): unknown;
    set_custom_flag(flag: string, value: unknown): void;
    supports_custom_flag(flag: string): boolean;
    /** @deprecated Import `ANSI` from `ollieos/ansi` instead. */
    readonly ansi: typeof ANSI;
    /** @deprecated Import `NEWLINE` from `ollieos/ansi` instead. */
    readonly newline: string;
    /** @deprecated Import `non_printable_regex()` from `ollieos/ansi` instead. */
    readonly non_printable_regex: RegExp;
    /** @deprecated Import `ansi_escape_regex()` from `ollieos/ansi` instead. */
    readonly ansi_escape_regex: RegExp;
    /** @deprecated Import `ansi_unescaped_regex()` from `ollieos/ansi` instead. */
    readonly ansi_unescaped_regex: RegExp;
    /** @deprecated Import `word_wrap()` from `ollieos/ansi` instead. */
    word_wrap(text: string, width: number): string;
}
/**
 * To implement in a package, use {@link https://ollieg.codes/docs/Program_Types/ProgramMainData.html#sdk sdk.AbstractTerminal} passed via program main data.
 *
 * @group Kernel (Privileged)
 * @category Terminal
 */
export declare abstract class AbstractTerminal {
    #private;
    protected _kernel_has_panicked: boolean;
    /** @deprecated Import `ANSI` from `ollieos/ansi` instead. */
    get ansi(): Readonly<{
        FG: Readonly<{
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
        }>;
        BG: Readonly<{
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
        }>;
        STYLE: Readonly<{
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
        }>;
        CURSOR: Readonly<{
            invisible: string;
            visible: string;
        }>;
        PREFABS: Readonly<{
            program_name: string;
            error: string;
            variable_name: string;
            file_path: string;
            dir_name: string;
            secret: string;
        }>;
    }>;
    /** @deprecated Import `NEWLINE` from `ollieos/ansi` instead. */
    get newline(): string;
    /** @deprecated Import `non_printable_regex()` from `ollieos/ansi` instead. Returns a fresh regex on each access. */
    get non_printable_regex(): RegExp;
    /** @deprecated Import `ansi_escape_regex()` from `ollieos/ansi` instead. Returns a fresh regex on each access. */
    get ansi_escape_regex(): RegExp;
    /** @deprecated Import `ansi_unescaped_regex()` from `ollieos/ansi` instead. Returns a fresh regex on each access. */
    get ansi_unescaped_regex(): RegExp;
    abstract write(data: string | Uint8Array, callback?: () => void): void;
    abstract writeln(data: string | Uint8Array, callback?: () => void): void;
    abstract clear(): void;
    abstract reset(): void;
    abstract get_selection(): string;
    abstract clear_selection(): void;
    abstract has_selection(): boolean;
    abstract copy(): void;
    abstract paste(): void;
    abstract focus(): void;
    abstract dispose(): void;
    abstract get input_enabled(): boolean;
    abstract set input_enabled(value: boolean);
    abstract pause_input_processing(): void;
    abstract resume_input_processing(): void;
    protected abstract _read_raw_key(): Promise<KeyEvent>;
    abstract get cols(): number;
    abstract get rows(): number;
    abstract get cursor_x(): number;
    abstract get cursor_y(): number;
    abstract get_custom_flag(flag: string): any;
    abstract set_custom_flag(flag: string, value: any): void;
    abstract supports_custom_flag(flag: string): boolean;
    read_line: (custom_key_handlers?: {
        [key_string: string]: ReadLineKeyHandler;
    }, custom_printable_handler?: ReadLineKeyHandler) => Promise<string>;
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
    /**
     * Registers a handler that is called when any printable key is pressed.
     * @param handler  - The handler to register
     * @param high_priority - If true, the handler will be placed at the beginning of the handler list (cannot run before the default printable key handler)
     */
    register_on_printable_key_event_handler: (handler: KeyEventHandler, high_priority?: boolean) => () => void;
    protected _enqueue_key_event: (e: KeyEvent) => void;
    protected _simulate_typing(text: string): void;
    wait_for_keypress: () => Promise<KeyEvent>;
    get_text: (max_length?: number) => Promise<string>;
    /** @deprecated Import `word_wrap()` from `ollieos/ansi` instead. */
    word_wrap(text: string, width: number): string;
    copy_or_paste(): void;
    handle_kernel_panic: (message: string, process_info: string, debug_info?: string) => void;
    create_userspace_proxy(): UserspaceTerminal;
}
