import { IDisposable, ITerminalOptions, Terminal } from "xterm";

import { ProgramRegistry } from "./prog_registry";
import type { FileSystem } from "./filesystem";

import type { KeyEvent, KeyEventHandler, RegisteredKeyEventIdentifier, SyncProgram, AsyncProgram } from "./types";
import { register_builtin_key_handlers, change_prompt as change_prompt, register_builtin_fs_handlers } from "./event_handlers";

export const NEWLINE = "\r\n";
/* eslint-disable-next-line no-control-regex, no-misleading-character-class */
export const NON_PRINTABLE_REGEX = /[\0-\x1F\x7F-\x9F\xAD\u0378\u0379\u037F-\u0383\u038B\u038D\u03A2\u0528-\u0530\u0557\u0558\u0560\u0588\u058B-\u058E\u0590\u05C8-\u05CF\u05EB-\u05EF\u05F5-\u0605\u061C\u061D\u06DD\u070E\u070F\u074B\u074C\u07B2-\u07BF\u07FB-\u07FF\u082E\u082F\u083F\u085C\u085D\u085F-\u089F\u08A1\u08AD-\u08E3\u08FF\u0978\u0980\u0984\u098D\u098E\u0991\u0992\u09A9\u09B1\u09B3-\u09B5\u09BA\u09BB\u09C5\u09C6\u09C9\u09CA\u09CF-\u09D6\u09D8-\u09DB\u09DE\u09E4\u09E5\u09FC-\u0A00\u0A04\u0A0B-\u0A0E\u0A11\u0A12\u0A29\u0A31\u0A34\u0A37\u0A3A\u0A3B\u0A3D\u0A43-\u0A46\u0A49\u0A4A\u0A4E-\u0A50\u0A52-\u0A58\u0A5D\u0A5F-\u0A65\u0A76-\u0A80\u0A84\u0A8E\u0A92\u0AA9\u0AB1\u0AB4\u0ABA\u0ABB\u0AC6\u0ACA\u0ACE\u0ACF\u0AD1-\u0ADF\u0AE4\u0AE5\u0AF2-\u0B00\u0B04\u0B0D\u0B0E\u0B11\u0B12\u0B29\u0B31\u0B34\u0B3A\u0B3B\u0B45\u0B46\u0B49\u0B4A\u0B4E-\u0B55\u0B58-\u0B5B\u0B5E\u0B64\u0B65\u0B78-\u0B81\u0B84\u0B8B-\u0B8D\u0B91\u0B96-\u0B98\u0B9B\u0B9D\u0BA0-\u0BA2\u0BA5-\u0BA7\u0BAB-\u0BAD\u0BBA-\u0BBD\u0BC3-\u0BC5\u0BC9\u0BCE\u0BCF\u0BD1-\u0BD6\u0BD8-\u0BE5\u0BFB-\u0C00\u0C04\u0C0D\u0C11\u0C29\u0C34\u0C3A-\u0C3C\u0C45\u0C49\u0C4E-\u0C54\u0C57\u0C5A-\u0C5F\u0C64\u0C65\u0C70-\u0C77\u0C80\u0C81\u0C84\u0C8D\u0C91\u0CA9\u0CB4\u0CBA\u0CBB\u0CC5\u0CC9\u0CCE-\u0CD4\u0CD7-\u0CDD\u0CDF\u0CE4\u0CE5\u0CF0\u0CF3-\u0D01\u0D04\u0D0D\u0D11\u0D3B\u0D3C\u0D45\u0D49\u0D4F-\u0D56\u0D58-\u0D5F\u0D64\u0D65\u0D76-\u0D78\u0D80\u0D81\u0D84\u0D97-\u0D99\u0DB2\u0DBC\u0DBE\u0DBF\u0DC7-\u0DC9\u0DCB-\u0DCE\u0DD5\u0DD7\u0DE0-\u0DF1\u0DF5-\u0E00\u0E3B-\u0E3E\u0E5C-\u0E80\u0E83\u0E85\u0E86\u0E89\u0E8B\u0E8C\u0E8E-\u0E93\u0E98\u0EA0\u0EA4\u0EA6\u0EA8\u0EA9\u0EAC\u0EBA\u0EBE\u0EBF\u0EC5\u0EC7\u0ECE\u0ECF\u0EDA\u0EDB\u0EE0-\u0EFF\u0F48\u0F6D-\u0F70\u0F98\u0FBD\u0FCD\u0FDB-\u0FFF\u10C6\u10C8-\u10CC\u10CE\u10CF\u1249\u124E\u124F\u1257\u1259\u125E\u125F\u1289\u128E\u128F\u12B1\u12B6\u12B7\u12BF\u12C1\u12C6\u12C7\u12D7\u1311\u1316\u1317\u135B\u135C\u137D-\u137F\u139A-\u139F\u13F5-\u13FF\u169D-\u169F\u16F1-\u16FF\u170D\u1715-\u171F\u1737-\u173F\u1754-\u175F\u176D\u1771\u1774-\u177F\u17DE\u17DF\u17EA-\u17EF\u17FA-\u17FF\u180F\u181A-\u181F\u1878-\u187F\u18AB-\u18AF\u18F6-\u18FF\u191D-\u191F\u192C-\u192F\u193C-\u193F\u1941-\u1943\u196E\u196F\u1975-\u197F\u19AC-\u19AF\u19CA-\u19CF\u19DB-\u19DD\u1A1C\u1A1D\u1A5F\u1A7D\u1A7E\u1A8A-\u1A8F\u1A9A-\u1A9F\u1AAE-\u1AFF\u1B4C-\u1B4F\u1B7D-\u1B7F\u1BF4-\u1BFB\u1C38-\u1C3A\u1C4A-\u1C4C\u1C80-\u1CBF\u1CC8-\u1CCF\u1CF7-\u1CFF\u1DE7-\u1DFB\u1F16\u1F17\u1F1E\u1F1F\u1F46\u1F47\u1F4E\u1F4F\u1F58\u1F5A\u1F5C\u1F5E\u1F7E\u1F7F\u1FB5\u1FC5\u1FD4\u1FD5\u1FDC\u1FF0\u1FF1\u1FF5\u1FFF\u200B-\u200F\u202A-\u202E\u2060-\u206F\u2072\u2073\u208F\u209D-\u209F\u20BB-\u20CF\u20F1-\u20FF\u218A-\u218F\u23F4-\u23FF\u2427-\u243F\u244B-\u245F\u2700\u2B4D-\u2B4F\u2B5A-\u2BFF\u2C2F\u2C5F\u2CF4-\u2CF8\u2D26\u2D28-\u2D2C\u2D2E\u2D2F\u2D68-\u2D6E\u2D71-\u2D7E\u2D97-\u2D9F\u2DA7\u2DAF\u2DB7\u2DBF\u2DC7\u2DCF\u2DD7\u2DDF\u2E3C-\u2E7F\u2E9A\u2EF4-\u2EFF\u2FD6-\u2FEF\u2FFC-\u2FFF\u3040\u3097\u3098\u3100-\u3104\u312E-\u3130\u318F\u31BB-\u31BF\u31E4-\u31EF\u321F\u32FF\u4DB6-\u4DBF\u9FCD-\u9FFF\uA48D-\uA48F\uA4C7-\uA4CF\uA62C-\uA63F\uA698-\uA69E\uA6F8-\uA6FF\uA78F\uA794-\uA79F\uA7AB-\uA7F7\uA82C-\uA82F\uA83A-\uA83F\uA878-\uA87F\uA8C5-\uA8CD\uA8DA-\uA8DF\uA8FC-\uA8FF\uA954-\uA95E\uA97D-\uA97F\uA9CE\uA9DA-\uA9DD\uA9E0-\uA9FF\uAA37-\uAA3F\uAA4E\uAA4F\uAA5A\uAA5B\uAA7C-\uAA7F\uAAC3-\uAADA\uAAF7-\uAB00\uAB07\uAB08\uAB0F\uAB10\uAB17-\uAB1F\uAB27\uAB2F-\uABBF\uABEE\uABEF\uABFA-\uABFF\uD7A4-\uD7AF\uD7C7-\uD7CA\uD7FC-\uF8FF\uFA6E\uFA6F\uFADA-\uFAFF\uFB07-\uFB12\uFB18-\uFB1C\uFB37\uFB3D\uFB3F\uFB42\uFB45\uFBC2-\uFBD2\uFD40-\uFD4F\uFD90\uFD91\uFDC8-\uFDEF\uFDFE\uFDFF\uFE1A-\uFE1F\uFE27-\uFE2F\uFE53\uFE67\uFE6C-\uFE6F\uFE75\uFEFD-\uFF00\uFFBF-\uFFC1\uFFC8\uFFC9\uFFD0\uFFD1\uFFD8\uFFD9\uFFDD-\uFFDF\uFFE7\uFFEF-\uFFFB\uFFFE\uFFFF]/g;
export const VAR_ASSIGNMENT_REGEX = /^([a-zA-Z0-9_]+)=(.+)$/;
export const ANSI_ESCAPE_REGEX = /(\\u001b|\\x1b)(8|7|H|>|\[(\?\d+(h|l)|[0-2]?(K|J)|\d*(A|B|C|D\D|E|F|G|g|i|m|n|S|s|T|u)|1000D\d+|\d*;\d*(f|H|r|m)|\d+;\d+;\d+m))/g;

const FG = {
    reset: "\x1B[39m",
    black: "\x1B[30m",
    red: "\x1B[31m",
    green: "\x1B[32m",
    yellow: "\x1B[33m",
    blue: "\x1B[34m",
    magenta: "\x1B[35m",
    cyan: "\x1B[36m",
    white: "\x1B[37m",
    gray: "\x1B[90m"
};

const BG = {
    reset: "\x1B[49m",
    black: "\x1B[40m",
    red: "\x1B[41m",
    green: "\x1B[42m",
    yellow: "\x1B[44m",
    blue: "\x1B[44m",
    magenta: "\x1B[45m",
    cyan: "\x1B[46m",
    white: "\x1B[47m",
    gray: "\x1B[100m"
}

const STYLE = {
    reset_all: "\x1B[0m",
    bold: "\x1B[1m",
    no_bold: "\x1B[21m",
    dim: "\x1B[2m",
    no_dim: "\x1B[22m",
    italic: "\x1B[3m",
    no_italic: "\x1B[23m",
    underline: "\x1B[4m",
    no_underline: "\x1B[24m",
    inverse: "\x1B[7m",
    no_inverse: "\x1B[27m",
    hidden: "\x1B[8m",
    no_hidden: "\x1B[28m",
    strikethrough: "\x1B[9m",
    no_strikethrough: "\x1B[29m",
    negative: "\x1B[7m",
    positive: "\x1B[27m"
}

const PREFABS = {
    program_name: FG.cyan + STYLE.italic + STYLE.bold,
    error: FG.red + STYLE.bold,
    variable_name: FG.yellow + STYLE.bold,
    file_path: FG.green + STYLE.bold,
    dir_name: FG.blue + STYLE.bold,
}

export const ANSI = {
    FG,
    BG,
    STYLE,
    PREFABS
}


// TODO: virtual directories and CWD handling
// TODO: docstrings everywhere

export class WrappedTerminal extends Terminal {
    _disposable_onkey: IDisposable;

    _history: string[] = [];

    _current_line = "";
    _current_index = 0;
    _current_history_index = 0;

    _preline = "";
    _prompt_suffix = "$ ";

    _registry: ProgramRegistry;
    _fs: FileSystem;

    _key_handlers: Map<RegisteredKeyEventIdentifier, { handler: KeyEventHandler, block: boolean }[]> = new Map();
    _vars: { [key: string]: string } = {};


    get_registry(): ProgramRegistry {
        return this._registry;
    }

    get_fs(): FileSystem {
        return this._fs;
    }


    get_variable(name: string): string {
        return this._vars[name];
    }

    set_variable(name: string, value: string): void {
        this._vars[name] = value;
    }

    unset_variable(name: string): void {
        delete this._vars[name];
    }


    clear_history(): void {
        this._history = [];
        this._current_history_index = 0;
    }


    reset_current_vars(reset_history_index = false): void {
        this._current_line = "";
        this._current_index = 0;

        if (reset_history_index) {
            this._current_history_index = 0;
        }
    }


    insert_preline(newline = true): void {
        if (newline) {
            this.write(NEWLINE);
        }

        this.write(this._preline);
    }

    // raw access to the preline vs setting just the prompt and having the suffix added
    set_preline(preline: string): void {
        this._preline = preline;
    }

    set_prompt(prompt: string): void {
        this.set_preline(prompt + this._prompt_suffix);
    }

    get_prompt_suffix(): string {
        return this._prompt_suffix;
    }

    set_prompt_suffix(suffix: string): void {
        this._prompt_suffix = suffix;
    }


    next_line(): void {
        this.reset_current_vars();
        this.insert_preline();
    }


    execute = async (line: string): Promise<void> => {
        // TODO: screen multiplexing

        if (line.length === 0) {
            // if the line is empty, just move to the next line (additional check if called from external source)
            return;
        }

        // remove leading and trailing whitespace and split the line into an array of words
        const sub = line.trim().split(" ");

        // the first word is the command, the rest are arguments
        const command = sub[0];

        // determine if the line is a variable assignment with regex
        if (command.includes("=")) {
            const match = line.match(VAR_ASSIGNMENT_REGEX);

            if (match) {
                const var_name = match[1];
                let var_value = match[2];

                // remove single or double quotes from the value
                // TODO: make this more unixy when we add semicolons
                if (var_value.startsWith("'") || var_value.startsWith('"')) {
                    var_value = var_value.slice(1, -1);
                }

                this.set_variable(var_name, var_value);
                
                return;
            }
        }

        const args = sub.slice(1);

        const unsubbed_args = args.slice();

        // substitute args with variables
        for (const arg_idx in args) {
            const arg = args[arg_idx];

            if (arg.startsWith("$")) {
                const var_name = arg.slice(1);
                const var_value = this.get_variable(var_name);

                if (var_value) {
                    args[arg_idx] = var_value;
                } else {
                    args[arg_idx] = "";
                }
            }
        }

        // search for the command in the registry
        const program = this._registry.getProgram(command);

        // if the command is not found, print an error message
        if (program === undefined) {
            this.writeln(`${PREFABS.error}Command not found: ${FG.white + STYLE.italic}${command}${STYLE.reset_all}`);
            return;
        }

        // if the command is found, run it
        const data = {
            term: this,
            args,
            unsubbed_args,
            registry: this._registry,
        }

        let exit_code = 0;
        if ("main" in program) {
            exit_code = (<SyncProgram>program).main(data);
        } else if ("async_main" in program) {
            // TODO: use callbacks
            await (<AsyncProgram>program).async_main(data);
        } else {
            throw new Error("Invalid program type");
        }
        

        // set the exit code
        this.set_variable("?", exit_code.toString());

        // set the history index to 0
        this._current_history_index = 0;
    }


    _search_handlers = (key: string, domEventCode: string): { handler: KeyEventHandler, block: boolean }[] => {
        for (const pair of this._key_handlers.entries()) {
            const identfier = pair[0] as RegisteredKeyEventIdentifier;

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
     *
     * @param {KeyEventHandler} handler The handler to register
     * @param {{ keyString?: string, domEventCode?: string, block: boolean, high_priority: boolean }} props The properties of the handler. Key is the key as a string, domEventCode is the DOM event code. Block determines whether the event should be blocked from bubbling up to following handlers and/or the terminal display. High priority determines whether the handler should be placed at the beginning of the handler list.
     * @returns {() => () => void} A function to unregister the handler
     */
    register_key_event_handler = (handler: KeyEventHandler, props: { keyString?: string, domEventCode?: string, block?: boolean, high_priority?: boolean }) => {
        if (props.keyString === undefined && props.domEventCode === undefined) {
            throw new TypeError("Must specify at least one of key or domEventCode");
        }

        // build the identifier
        const identifier: RegisteredKeyEventIdentifier = {
            key: props.keyString,
            domEventCode: props.domEventCode
        };

        const entry = { handler, block: props.block ?? false };

        // if the identifier has not already been registered, create a new array for it
        if (!this._key_handlers.has(identifier)) {
            this._key_handlers.set(identifier, [entry]);
        } else {
            // otherwise, add the handler to the existing array
            // NOTE: reference is retained so no need to search
            if (props.high_priority) {
                this._key_handlers.get(identifier)!.unshift(entry);
            } else {
                this._key_handlers.get(identifier)!.push(entry);
            }
        }

        // return a function to unregister the handler
        // NOTE: reference is retained so no need to search
        return () => {
            this._key_handlers.get(identifier)!.splice(this._key_handlers.get(identifier)!.indexOf(entry), 1);
        }
    }

    _handle_key_event = async (e: KeyEvent): Promise<void> => {
        // TODO: supress builtin key events when program is running, create ctrl+c handler

        // search the handlers for the key
        const entries = this._search_handlers(e.key, e.domEvent.code);

        // if there are any handlers, run them
        for (const entry of entries) {
            entry.handler(e, this);

            if (entry.block) {
                // if the handler is blocking, don't go to next handler or display logic
                return;
            }
        }

        // if the key is a printable character, write it to the terminal
        if (e.key.match(NON_PRINTABLE_REGEX) === null) {
            this._current_line += e.key;
            this.write(e.key);
            this._current_index++;
        } else {
            console.warn("Ignored key event:", e);
            // TODO: handle more special keys and sequences
        }
    }

    wait_for_keypress = async (): Promise<KeyEvent> => {
        // dispose of the current key handler (block bubbling)
        this._disposable_onkey.dispose();

        return new Promise((resolve) => {
            this._disposable_onkey = this.onKey((e) => {
                // dispose of this handler
                this._disposable_onkey.dispose();

                // re-register the original handler
                this._disposable_onkey = this.onKey(this._handle_key_event);

                // resolve the promise
                resolve(e);
            });
        });
    }


    constructor(fs: FileSystem, registry?: ProgramRegistry, xterm_opts?: ITerminalOptions, register_builtin_handlers = true) {
        super(xterm_opts);

        this._fs = fs;
        this._registry = registry || new ProgramRegistry();

        if (register_builtin_handlers) {
            register_builtin_key_handlers(this);
            register_builtin_fs_handlers(this);
        }

        this._disposable_onkey = this.onKey(this._handle_key_event);
        
        // set prompt to initial cwd
        change_prompt(fs.get_cwd(), fs, this);
    }
}