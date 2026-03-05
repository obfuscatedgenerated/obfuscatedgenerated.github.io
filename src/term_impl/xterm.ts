import {AbstractTerminal, KeyEvent} from "../kernel/term_ctl";
import {IDisposable, ITerminalAddon, ITerminalOptions, Terminal} from "@xterm/xterm";

export class XTermTerminal extends AbstractTerminal {
    #xterm: Terminal;
    #disposable_onkey: IDisposable;

    write(data: string | Uint8Array, callback?: () => void) {
        this.#xterm.write(data, callback);
    }

    writeln(data: string | Uint8Array, callback?: () => void) {
        this.#xterm.writeln(data, callback);
    }

    reset() {
        this.#xterm.reset();
    }

    clear() {
        this.#xterm.clear();
    }

    get_selection(): string {
        return this.#xterm.getSelection();
    }

    clear_selection() {
        this.#xterm.clearSelection();
    }

    has_selection(): boolean {
        return this.#xterm.hasSelection();
    }

    get cols(): number {
        return this.#xterm.cols;
    }

    get rows(): number {
        return this.#xterm.rows;
    }

    get cursor_x(): number {
        return this.#xterm.buffer.active.cursorX;
    }

    get cursor_y(): number {
        return this.#xterm.buffer.active.cursorY;
    }

    get_custom_flag(flag: string): any {
        if (flag === "reader_support") {
            return this.#xterm.options.screenReaderMode;
        }
    }

    set_custom_flag(flag: string, value: any) {
        if (flag === "reader_support") {
            this.#xterm.options.screenReaderMode = value;
        }
    }

    supports_custom_flag(flag: string): boolean {
        if (flag === "reader_support") {
            return true;
        }

        return false;
    }

    get input_enabled() {
        return this.#xterm.textarea ? !this.#xterm.textarea.disabled : false;
    }

    set input_enabled(enabled: boolean) {
        if (this.#xterm.textarea) {
            this.#xterm.textarea.disabled = !enabled;
        }
    }

    pause_input_processing() {
        this.#disposable_onkey.dispose();
    }

    resume_input_processing() {
        this.#disposable_onkey = this.#xterm.onKey(this._enqueue_key_event);
    }

    protected async _read_raw_key(): Promise<KeyEvent> {
        return new Promise((resolve) => {
            const disposable = this.#xterm.onKey((e) => {
                // dispose of this handler
                disposable.dispose();

                // resolve the promise
                resolve(e);
            });
        });
    }

    copy() {
        // copy the selected text to the clipboard
        navigator.clipboard.writeText(this.get_selection()).then(() => {
            // clear the selection
            this.clear_selection();
        });
    }

    paste() {
        if (this._kernel_has_panicked) {
            return;
        }

        // TODO: sometimes has issues with large text (queue consumption not restarted properly after execution)
        // read the clipboard
        navigator.clipboard.readText().then((text) => {
            this._simulate_typing(text);
        });
    }

    loadAddon(addon: ITerminalAddon) {
        return this.#xterm.loadAddon(addon);
    }

    open(parent: HTMLElement) {
        this.#xterm.open(parent);
    }

    focus() {
        this.#xterm.focus();
    }

    dispose() {
        this.#xterm.dispose();
    }

    constructor(xterm_opts?: ITerminalOptions) {
        super();

        this.#xterm = new Terminal(xterm_opts);
        this.resume_input_processing();
    }
}
