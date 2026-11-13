import {ANSI, NEWLINE, ansi_escape_regex, ansi_unescaped_regex, is_printable, non_printable_regex, word_wrap} from "../lib/ansi";
import {finalise_userspace_proxy, mirror_source, MirrorSource} from "./rpc";

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

// TODO: add trust flag and privilege agent preference not visible to userspace. a trusted terminal is allowed to have the privilege agent spawned in it

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
    domEvent: { key: string; code?: string };
}

export type UserspaceKeyEventHandler = (event: UserspaceKeyEvent, term: UserspaceTerminal) => void | Promise<void>;

export type UserspaceReadLineKeyHandler = (
    event: UserspaceKeyEvent,
    term: UserspaceTerminal,
    buffer: ReadLineBuffer
) => void | Promise<void> | boolean | Promise<boolean>;

export interface UserspaceKeyHandlerProps {
    keyString?: string;
    domEventCode?: string;
    block?: boolean;
}

// strips a kernel key event down to plain data, so no DOM object ever reaches userspace
const to_userspace_key_event = (event: KeyEvent): UserspaceKeyEvent => {
    const code = (event.domEvent as Partial<KeyboardEvent> | undefined)?.code;

    return Object.freeze({
        key: event.key,
        code,
        domEvent: Object.freeze({ key: event.key, code }),
    });
};

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
    read_line(
        custom_key_handlers?: { [key_string: string]: UserspaceReadLineKeyHandler },
        custom_printable_handler?: UserspaceReadLineKeyHandler
    ): Promise<string>;

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
export abstract class AbstractTerminal implements MirrorSource {
    readonly [mirror_source] = true as const;

    readonly #key_handlers: Map<RegisteredKeyEventIdentifier, { handler: KeyEventHandler, block: boolean }[]> = new Map();
    readonly #on_printable_handlers: KeyEventHandler[] = [];

    readonly #key_event_queue: KeyEvent[] = [];
    #is_handling_key_events = false;

    protected _kernel_has_panicked = false;

    // deprecated aliases kept for packages built before the ansi lib existed. remove in a future major

    /** @deprecated Import `ANSI` from `ollieos/ansi` instead. */
    get ansi() {
        return ANSI;
    }

    /** @deprecated Import `NEWLINE` from `ollieos/ansi` instead. */
    get newline() {
        return NEWLINE;
    }

    /** @deprecated Import `non_printable_regex()` from `ollieos/ansi` instead. Returns a fresh regex on each access. */
    get non_printable_regex() {
        return non_printable_regex();
    }

    /** @deprecated Import `ansi_escape_regex()` from `ollieos/ansi` instead. Returns a fresh regex on each access. */
    get ansi_escape_regex() {
        return ansi_escape_regex();
    }

    /** @deprecated Import `ansi_unescaped_regex()` from `ollieos/ansi` instead. Returns a fresh regex on each access. */
    get ansi_unescaped_regex() {
        return ansi_unescaped_regex();
    }

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

    // line discipline now completely handled by read_line, no global event loop
    read_line = async (custom_key_handlers: { [key_string: string]: ReadLineKeyHandler } = {}, custom_printable_handler?: ReadLineKeyHandler): Promise<string> => {
        const buffer: ReadLineBuffer = {
            current_line: "",
            current_index: 0,

            set_current_line: (new_line: string) => {
                buffer.current_line = new_line;
            },

            set_current_index: (new_index: number) => {
                buffer.current_index = new_index;
            }
        };

        let handler_dispose: (() => void) | null = null;

        return new Promise<string>((resolve) => {
            const handlers: { [key_string: string]: KeyEventHandler } = {
                // arrow left - move cursor left
                "\x1b[D": (_e, term) => {
                    if (buffer.current_index > 0) {
                        term.write("\b");
                        buffer.current_index--;
                    }
                },

                // arrow right - move cursor right
                "\x1b[C": (_e, term) => {
                    if (buffer.current_index < buffer.current_line.length) {
                        term.write(buffer.current_line[buffer.current_index]);
                        buffer.current_index++;
                    }
                },

                // backspace - delete character
                "\x7F": (_e, term) => {
                    if (buffer.current_line.length > 0 && buffer.current_index > 0) {
                        // get everything before the cursor
                        const before = buffer.current_line.slice(0, buffer.current_index - 1);

                        // get everything after the cursor
                        const after = buffer.current_line.slice(buffer.current_index);

                        // update current line
                        buffer.current_line = before + after;

                        // move cursor back one
                        term.write("\b");

                        // overwrite with after content and a space (remove last character)
                        term.write(after + " ");

                        // move cursor back to original position
                        term.write("\b".repeat(after.length + 1));
                        buffer.current_index--;
                    }
                },

                // enter - finish line
                "\r": (_e, term) => {
                    if (handler_dispose) {
                        handler_dispose();
                    }

                    term.write(NEWLINE);
                    resolve(buffer.current_line);
                }
            }

            // register blocking catch all key handler which handles all keys during read_line
            handler_dispose = this.register_key_event_handler(
                async (e) => {
                    // check for custom handlers first
                    if (e.key in custom_key_handlers) {
                        const block = await custom_key_handlers[e.key](e, this, buffer);

                        if (block) {
                            return;
                        }
                    }

                    // check for builtin handlers
                    if (e.key in handlers) {
                        await handlers[e.key](e, this);
                        return;
                    }

                    // check for printable characters
                    if (is_printable(e.key)) {
                        if (custom_printable_handler) {
                            const block = await custom_printable_handler(e, this, buffer);

                            if (block) {
                                return;
                            }
                        }

                        // if at the end of the line, just append the character
                        if (buffer.current_index === buffer.current_line.length) {
                            buffer.current_line += e.key;
                            this.write(e.key);
                            buffer.current_index++;
                            return;
                        }

                        // insert the character at the cursor, shift the rest of the line to the right
                        const before_cursor = buffer.current_line.slice(0, buffer.current_index);
                        const after_cursor = buffer.current_line.slice(buffer.current_index);
                        buffer.current_line = before_cursor + e.key + after_cursor;

                        // write the new right of the line over the old one
                        this.write(e.key + after_cursor);

                        // move back to the cursor position
                        this.write(`\x1b[${after_cursor.length}D`);

                        // increment the cursor position
                        buffer.current_index++;
                    } else {
                        console.warn("Ignored key event:", e);
                        // TODO: handle more special keys and sequences (probably in shells)
                    }
                },
                {
                    block: true,
                    high_priority: true
                }
            );
        });
    }

    #search_handlers = (key: string | undefined, domEventCode: string | undefined, strict = false): { handler: KeyEventHandler, block: boolean }[] => {
        for (const pair of this.#key_handlers.entries()) {
            const identfier = pair[0] as RegisteredKeyEventIdentifier;

            // if strict matching is required, both key and domEventCode must match
            if (strict) {
                if (identfier.key === key && identfier.domEventCode === domEventCode) {
                    return pair[1] as { handler: KeyEventHandler, block: boolean }[];
                } else {
                    continue;
                }
            }

            // if the identifier matches, return the entries
            if (identfier.key === key || identfier.domEventCode === domEventCode) {
                return pair[1] as { handler: KeyEventHandler, block: boolean }[];
            }
        }

        // if no match is found, return an empty array
        return [];
    }

    /**
     * Registers a key event handler.
     * Handlers with no filter run BEFORE filtered handlers.
     *
     * @param {KeyEventHandler} handler The handler to register
     * @param {{ keyString?: string, domEventCode?: string, block: boolean, high_priority: boolean }} props The properties of the handler. Key is the key as a string to filter by, domEventCode is the DOM event code to filter by. Block determines whether the event should be blocked from bubbling up to following handlers and/or the terminal display. High priority determines whether the handler should be placed at the beginning of the handler list.
     * @returns {() => () => void} A function to unregister the handler
     */
    register_key_event_handler = (handler: KeyEventHandler, props: { keyString?: string, domEventCode?: string, block?: boolean, high_priority?: boolean }) => {
        // build the identifier
        const identifier: RegisteredKeyEventIdentifier = {
            key: props.keyString,
            domEventCode: props.domEventCode
        };

        const entry = { handler, block: props.block ?? false };

        // if the identifier has not already been registered, create a new array for it
        const existing_entries = this.#search_handlers(props.keyString, props.domEventCode, true);
        if (existing_entries.length === 0) {
            this.#key_handlers.set(identifier, [entry]);
        } else {
            // otherwise, add the handler to the existing array
            // NOTE: reference is retained so no need to search
            if (props.high_priority) {
                existing_entries.unshift(entry);
            } else {
                existing_entries.push(entry);
            }
        }

        // return a function to unregister the handler
        // NOTE: reference is retained so no need to search
        return () => {
            const handlers = this.#key_handlers.get(identifier);
            if (!handlers) {
                return;
            }

            handlers.splice(handlers.indexOf(entry), 1);

            // if there are no more handlers for the identifier, remove the identifier from the map
            if (handlers.length === 0) {
                this.#key_handlers.delete(identifier);
            }
        }
    }

    #handle_key_event = async (e: KeyEvent): Promise<void> => {
        // TODO: supress builtin key events when program is running, create ctrl+c handler

        // look for any handlers against all keys
        const all_key_entries = this.#search_handlers(undefined, undefined, true);
        if (all_key_entries) {
            for (const entry of all_key_entries) {
                // await if the handler is async
                await entry.handler(e, this);

                if (entry.block) {
                    // if the handler is blocking, don't go to next handler or display logic
                    return;
                }
            }
        }

        // search the handlers for the key
        const entries = this.#search_handlers(e.key, e.domEvent.code);

        // if there are any handlers, run them
        for (const entry of entries) {
            // await if the handler is async
            await entry.handler(e, this);

            if (entry.block) {
                // if the handler is blocking, don't go to next handler or display logic
                return;
            }
        }

        // check if the key is printable
        if (is_printable(e.key)) {
            // call any registered printable key handlers
            for (const handler of this.#on_printable_handlers) {
                await handler(e, this);
            }
        }
    }

    /**
     * Registers a handler that is called when any printable key is pressed.
     * @param handler  - The handler to register
     * @param high_priority - If true, the handler will be placed at the beginning of the handler list (cannot run before the default printable key handler)
     */
    register_on_printable_key_event_handler = (handler: KeyEventHandler, high_priority = false) => {
        if (high_priority) {
            this.#on_printable_handlers.unshift(handler);
        } else {
            this.#on_printable_handlers.push(handler);
        }

        // return a function to unregister the handler
        return () => {
            const index = this.#on_printable_handlers.indexOf(handler);
            if (index !== -1) {
                this.#on_printable_handlers.splice(index, 1);
            }
        };
    }

    protected _enqueue_key_event = (e: KeyEvent) => {
        this.#key_event_queue.push(e);

        // if the queue is not being handled, handle it
        if (!this.#is_handling_key_events) {
            this.#is_handling_key_events = true;
            this.#handle_key_event_queue();
        }
    }

    #handle_key_event_queue = async () => {
        // if there are no events in the queue, return
        if (this.#key_event_queue.length === 0) {
            this.#is_handling_key_events = false;
            return;
        }

        if (this.#is_handling_key_events) {
            // handle the first event in the queue
            await this.#handle_key_event(this.#key_event_queue.shift()!);

            // handle the rest of the events in the queue
            this.#handle_key_event_queue();
        }
    }

    protected _simulate_typing(text: string) {
        // simulate key events for each character (lazy but it works great, no need to rewrite the key handler)
        for (let i = 0; i < text.length; i++) {
            const char = text[i];

            let dom_event_code = `Key${char.toUpperCase()}`;
            let key = char;

            if (char === "\r") {
                // skip, its CRLF
                continue;
            }

            if (char === "\n") {
                key = "\r";
                dom_event_code = "Enter";
            }

            if (char === " ") {
                dom_event_code = "Space";
            }

            // check for escape sequences e.g. arrow keys
            if (char === "\x1b") {
                if (i + 2 < text.length && text[i + 1] === "[") {
                    const code = text[i + 2];
                    let key_name = "";

                    switch (code) {
                        case "A":
                            key_name = "ArrowUp";
                            break;
                        case "B":
                            key_name = "ArrowDown";
                            break;
                        case "C":
                            key_name = "ArrowRight";
                            break;
                        case "D":
                            key_name = "ArrowLeft";
                            break;
                    }

                    if (key_name) {
                        dom_event_code = key_name;
                        key = `\x1b[${code}`;
                        i += 2; // skip the next two characters as they are part of the escape sequence
                    }
                }
            }

            this.#key_event_queue.push(({ key, domEvent: { code: dom_event_code } } as KeyEvent));
        }

        // if the queue is not being handled, handle it
        if (!this.#is_handling_key_events) {
            this.#is_handling_key_events = true;
            this.#handle_key_event_queue();
        }
    }

    // note that this does not recieve pasted input, use a key event handler for that
    wait_for_keypress = async (): Promise<KeyEvent> => {
        // dispose of the current key handler (block bubbling)
        this.pause_input_processing();

        try {
            const event = await this._read_raw_key();
            return event;
        } finally {
            // re-register the original key handler
            this.resume_input_processing();
        }
    }

    get_text = async (max_length?: number): Promise<string> => {
        let text = "";

        return new Promise((resolve) => {
            const unregister_handler = this.register_key_event_handler(
                (e) => {
                    if (e.key === "\r") {
                        // if the key is enter, return the text
                        unregister_handler();
                        resolve(text);
                    } else if (e.key === "\x7F") {
                        // if the key is backspace, remove the last character
                        if (text.length > 0) {
                            text = text.slice(0, -1);
                            this.write("\b \b");
                        }
                    } else if (is_printable(e.key)) {
                        // if the key is printable, add it to the text
                        if (max_length === undefined || text.length < max_length) {
                            text += e.key;
                            this.write(e.key);
                        }
                    }
                },
                {
                    block: true,
                    high_priority: true
                }
            );
        });
    }

    /** @deprecated Import `word_wrap()` from `ollieos/ansi` instead. */
    word_wrap(text: string, width: number): string {
        return word_wrap(text, width);
    }

    copy_or_paste() {
        // if there is a selection, copy it
        if (this.has_selection()) {
            this.copy();
        } else {
            this.paste();
        }
    }

    handle_kernel_panic = (message: string, process_info: string, debug_info?: string) => {
        if (this._kernel_has_panicked) {
            return;
        }

        this._kernel_has_panicked = true;

        this.reset();

        // stop reading key events
        this.pause_input_processing();
        this.write(ANSI.CURSOR.invisible);

        this.input_enabled = false;

        this.writeln(`${ANSI.BG.red + ANSI.FG.white}Panic: ${message}`);
        this.writeln(`at time: ${new Date().toISOString()}`);

        this.write(NEWLINE);
        this.writeln("Debug info:");
        if (debug_info) {
            this.writeln(debug_info);
        } else {
            this.writeln("No debug info provided.");
        }

        this.write(NEWLINE);
        this.writeln("Processes running at time of panic:");
        this.writeln(process_info || "None.");

        if (typeof window !== "undefined") {
            this.write(NEWLINE);
            this.writeln("OS unrecoverable?")
            this.writeln(`Visit ${window.location.origin}/recover_fs if stuck.`);
        }

        this.writeln(ANSI.STYLE.reset_all);
    }

    create_userspace_proxy(): UserspaceTerminal {
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const self = this;
        const proxy = Object.create(null) as UserspaceTerminal;

        // handlers must never see the raw terminal or a DOM event, so every callback is rewrapped
        const wrap_key_handler = (handler: UserspaceKeyEventHandler): KeyEventHandler =>
            (event) => handler(to_userspace_key_event(event), proxy);

        const wrap_read_line_handler = (handler: UserspaceReadLineKeyHandler): ReadLineKeyHandler =>
            (event, _term, buffer) => handler(to_userspace_key_event(event), proxy, buffer);

        Object.defineProperties(proxy, {
            cols: { get: () => self.cols, enumerable: true },
            rows: { get: () => self.rows, enumerable: true },

            write: { value: (data: string | Uint8Array, callback?: () => void) => self.write(data, callback), enumerable: true },
            writeln: { value: (data: string | Uint8Array, callback?: () => void) => self.writeln(data, callback), enumerable: true },
            clear: { value: () => self.clear(), enumerable: true },
            reset: { value: () => self.reset(), enumerable: true },

            wait_for_keypress: {
                value: async () => to_userspace_key_event(await self.wait_for_keypress()),
                enumerable: true,
            },
            read_line: {
                value: (
                    custom_key_handlers: { [key_string: string]: UserspaceReadLineKeyHandler } = {},
                    custom_printable_handler?: UserspaceReadLineKeyHandler
                ) => {
                    // null prototype so read_line's "key in handlers"" check can't hit inherited members
                    const wrapped_handlers: { [key_string: string]: ReadLineKeyHandler } = Object.create(null);
                    for (const [key_string, handler] of Object.entries(custom_key_handlers)) {
                        wrapped_handlers[key_string] = wrap_read_line_handler(handler);
                    }

                    const wrapped_printable = custom_printable_handler
                        ? wrap_read_line_handler(custom_printable_handler)
                        : undefined;

                    return self.read_line(wrapped_handlers, wrapped_printable);
                },
                enumerable: true,
            },

            register_key_event_handler: {
                // rebuild props explicitly so high_priority can't be smuggled in by a plain JS caller
                value: (handler: UserspaceKeyEventHandler, props: UserspaceKeyHandlerProps) =>
                    self.register_key_event_handler(wrap_key_handler(handler), {
                        keyString: props.keyString,
                        domEventCode: props.domEventCode,
                        block: props.block,
                    }),
                enumerable: true,
            },
            register_on_printable_key_event_handler: {
                value: (handler: UserspaceKeyEventHandler) =>
                    self.register_on_printable_key_event_handler(wrap_key_handler(handler), false),
                enumerable: true,
            },

            get_custom_flag: { value: (flag: string): unknown => self.get_custom_flag(flag), enumerable: true },
            set_custom_flag: { value: (flag: string, value: unknown) => self.set_custom_flag(flag, value), enumerable: true },
            supports_custom_flag: { value: (flag: string) => self.supports_custom_flag(flag), enumerable: true },

            ansi: { get: () => self.ansi, enumerable: true },
            newline: { get: () => self.newline, enumerable: true },
            non_printable_regex: { get: () => self.non_printable_regex, enumerable: true },
            ansi_escape_regex: { get: () => self.ansi_escape_regex, enumerable: true },
            ansi_unescaped_regex: { get: () => self.ansi_unescaped_regex, enumerable: true },
            word_wrap: { value: (text: string, width: number) => self.word_wrap(text, width), enumerable: true },
        });

        return finalise_userspace_proxy(proxy, {
            cols: "mirrored",
            rows: "mirrored",
            ansi: "constant",
            newline: "constant",
            non_printable_regex: { local: "ansi.non_printable_regex" },
            ansi_escape_regex: { local: "ansi.ansi_escape_regex" },
            ansi_unescaped_regex: { local: "ansi.ansi_unescaped_regex" },
            word_wrap: { local: "ansi.word_wrap" },
        }, [
            this
        ]);
    }
}

// TODO: emit resize events

// as of 09/01/2026, the god class of WrappedTerminal is no more!
// this used to be the kernel, shell, tty, and bootstrap all in one

// and as of 05/03/2026 this is now abstract, and all xterm behaviour is moved to XTermTerminal,
// now allowing for virtual terminals without needing to implement all of xterm!
