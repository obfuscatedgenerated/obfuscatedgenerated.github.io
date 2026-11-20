import {AbstractTerminal, type KeyEvent} from "../kernel/term_ctl";

/**
 * Options for a {@link BridgedTerminal}.
 */
export interface BridgedTerminalOptions {
    /**
     * Called when the escape key (Ctrl+]) is pressed, which is never passed through. Used to get out of a guest that won't stop by itself.
     */
    on_escape?: () => void;
}

// ctrl+], as telnet uses
const ESCAPE_KEY = "\x1d";

/**
 * A terminal that runs on top of another, e.g. a guest kernel's console shown in the terminal of the program that started it.
 *
 * Takes over the parent's keys while attached, so the parent's own handlers (and its Ctrl+C) don't see them. Output is passed through, except for title escapes:
 * the bridged terminal keeps its own title stack, so pushes that are never popped (e.g. from a shell killed mid-command) can't unbalance the parent's.
 * Once disposed it swallows everything, like a closed terminal, as code that is still winding down may write to it.
 */
export class BridgedTerminal extends AbstractTerminal {
    readonly #parent: AbstractTerminal;
    readonly #on_escape: (() => void) | undefined;

    // set while wait_for_keypress is waiting, so the next key goes straight to it
    #raw_key_waiter: ((event: KeyEvent) => void) | null = null;

    #unregister_key_handler: (() => void) | null = null;
    #pop_interrupt_handler: (() => void) | null = null;
    #disposed = false;

    #input_enabled = true;

    #title_stack: string[] = [];
    #title = "";

    constructor(parent: AbstractTerminal, options: BridgedTerminalOptions = {}) {
        super();
        this.#parent = parent;
        this.#on_escape = options.on_escape;
    }

    /**
     * Starts taking the parent's keys.
     */
    attach(): void {
        if (this.#disposed || this.#unregister_key_handler) {
            return;
        }

        // a blocking catch-all handler, so the parent's own handlers don't see the keys too
        this.#unregister_key_handler = this.#parent.register_key_event_handler((event) => this.#receive_key(event), {block: true});

        // the newest interrupt handler wins, so ctrl+c reaches this terminal rather than whatever owns the parent
        this.#pop_interrupt_handler = this.#parent.push_interrupt_handler(() => this.#receive_key({key: "\u0003", domEvent: {code: "KeyC", ctrlKey: true} as KeyboardEvent}));
    }

    #receive_key(event: KeyEvent) {
        if (event.key === ESCAPE_KEY && this.#on_escape) {
            this.#on_escape();
            return;
        }

        if (!this.#input_enabled) {
            return;
        }

        const waiter = this.#raw_key_waiter;
        if (waiter) {
            this.#raw_key_waiter = null;
            waiter(event);
            return;
        }

        this._enqueue_key_event(event);
    }

    protected _read_raw_key(): Promise<KeyEvent> {
        return new Promise((resolve) => {
            this.#raw_key_waiter = resolve;
        });
    }

    dispose(): void {
        this.#disposed = true;

        this.#unregister_key_handler?.();
        this.#unregister_key_handler = null;

        this.#pop_interrupt_handler?.();
        this.#pop_interrupt_handler = null;
    }

    #translate_titles(data: string): string {
        // eslint-disable-next-line no-control-regex
        return data.replace(/\x1b\[(22|23);[02]?t|\x1b\][02];([^\x07\x1b]*)(?:\x07|\x1b\\)/g, (_sequence, stack_op: string | undefined, title: string | undefined) => {
            if (stack_op === "22") {
                this.#title_stack.push(this.#title);
                return "";
            }

            if (stack_op === "23") {
                this.#title = this.#title_stack.pop() ?? "";
            } else {
                this.#title = title ?? "";
            }

            // only ever set the parent's title, never its stack
            return `\x1b]2;${this.#title}\x07`;
        });
    }

    write(data: string | Uint8Array, callback?: () => void): void {
        if (this.#disposed) {
            return;
        }

        this.#parent.write(typeof data === "string" ? this.#translate_titles(data) : data, callback);
    }

    writeln(data: string | Uint8Array, callback?: () => void): void {
        if (this.#disposed) {
            return;
        }

        this.#parent.writeln(typeof data === "string" ? this.#translate_titles(data) : data, callback);
    }

    clear(): void {
        if (!this.#disposed) {
            this.#parent.clear();
        }
    }

    reset(): void {
        if (!this.#disposed) {
            this.#parent.reset();
        }
    }

    // the screen is the parent's, so selection and the clipboard are too

    get_selection(): string {
        return this.#parent.get_selection();
    }

    clear_selection(): void {
        this.#parent.clear_selection();
    }

    has_selection(): boolean {
        return this.#parent.has_selection();
    }

    copy(): void {
        this.#parent.copy();
    }

    paste(): void {
        // pasted text arrives as the parent's keys, which this terminal is taking
        this.#parent.paste();
    }

    focus(): void {
        this.#parent.focus();
    }

    get input_enabled(): boolean {
        return this.#input_enabled;
    }

    set input_enabled(value: boolean) {
        this.#input_enabled = value;
    }

    pause_input_processing(): void {
        // raw reads take priority over the key queue anyway, so there is nothing to pause
    }

    resume_input_processing(): void {
        // nothing was paused
    }

    get cols(): number {
        return this.#parent.cols;
    }

    get rows(): number {
        return this.#parent.rows;
    }

    get cursor_x(): number {
        return this.#parent.cursor_x;
    }

    get cursor_y(): number {
        return this.#parent.cursor_y;
    }

    get_custom_flag(flag: string) {
        return this.#parent.get_custom_flag(flag);
    }

    set_custom_flag(flag: string, value: unknown): void {
        if (!this.#disposed) {
            this.#parent.set_custom_flag(flag, value);
        }
    }

    supports_custom_flag(flag: string): boolean {
        return this.#parent.supports_custom_flag(flag);
    }
}
