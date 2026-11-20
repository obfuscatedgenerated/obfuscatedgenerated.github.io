import { AbstractTerminal, type KeyEvent } from "../kernel/term_ctl";
/**
 * Options for a {@link BridgedTerminal}.
 */
export interface BridgedTerminalOptions {
    /**
     * Called when the escape key (Ctrl+]) is pressed, which is never passed through. Used to get out of a guest that won't stop by itself.
     */
    on_escape?: () => void;
}
/**
 * A terminal that runs on top of another, e.g. a guest kernel's console shown in the terminal of the program that started it.
 *
 * Takes over the parent's keys while attached, so the parent's own handlers (and its Ctrl+C) don't see them. Output is passed through, except for title escapes:
 * the bridged terminal keeps its own title stack, so pushes that are never popped (e.g. from a shell killed mid-command) can't unbalance the parent's.
 * Once disposed it swallows everything, like a closed terminal, as code that is still winding down may write to it.
 */
export declare class BridgedTerminal extends AbstractTerminal {
    #private;
    constructor(parent: AbstractTerminal, options?: BridgedTerminalOptions);
    /**
     * Starts taking the parent's keys.
     */
    attach(): void;
    protected _read_raw_key(): Promise<KeyEvent>;
    dispose(): void;
    write(data: string | Uint8Array, callback?: () => void): void;
    writeln(data: string | Uint8Array, callback?: () => void): void;
    clear(): void;
    reset(): void;
    get_selection(): string;
    clear_selection(): void;
    has_selection(): boolean;
    copy(): void;
    paste(): void;
    focus(): void;
    get input_enabled(): boolean;
    set input_enabled(value: boolean);
    pause_input_processing(): void;
    resume_input_processing(): void;
    get cols(): number;
    get rows(): number;
    get cursor_x(): number;
    get cursor_y(): number;
    get_custom_flag(flag: string): any;
    set_custom_flag(flag: string, value: unknown): void;
    supports_custom_flag(flag: string): boolean;
}
