import { Terminal } from "xterm";
import { ProgramRegistry } from "./prog_registry";

const NEWLINE = "\r\n";

const FG = {
    reset: "\x1B[39m",
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
}

const ANSI = {
    FG,
    BG,
    STYLE,
    PREFABS
}

interface IxTermKeyEvent {
    key: string;
    domEvent: KeyboardEvent;
}

export class WrappedTerminal extends Terminal {
    history: string[] = [];
    current_line = "";
    current_index = 0;

    registry: ProgramRegistry;

    get_registry(): ProgramRegistry {
        return this.registry;
    }

    clear_history(): void {
        this.history = [];
    }

    reset_current_vars(): void {
        this.current_line = "";
        this.current_index = 0;
    }

    insert_preline(newline = true): void {
        if (newline) {
            this.write(NEWLINE);
        }

        this.write("$ ");
    }

    next_line(): void {
        this.reset_current_vars();
        this.insert_preline();
    }


    splash(): void {
        this.writeln(`┌─ Welcome to ${STYLE.italic + STYLE.bold + FG.magenta}OllieOS...${STYLE.reset_all} ──────────────┐`);
        this.writeln(`│  ${STYLE.bold + FG.blue}Type ${PREFABS.program_name}help${STYLE.no_italic + FG.blue} for a list of commands.${STYLE.reset_all}   │`);
        this.writeln(`└──────────────────────────────────────┘`);
        this.insert_preline();
    }

    execute = (line: string): void => {
        // remove leading and trailing whitespace and split the line into an array of words
        let sub = line.trim().split(" ");

        // the first word is the command, the rest are arguments
        let command = sub[0];
        let args = sub.slice(1);

        // search for the command in the registry
        let program = this.registry.getProgram(command);

        // if the command is not found, print an error message
        if (program === undefined) {
            this.writeln(`${PREFABS.error}Command not found: ${FG.white + STYLE.italic}${command}${STYLE.reset_all}`);
            return;
        }

        // if the command is found, run it
        program.main({
            term: this,
            args,
            ANSI,
            NEWLINE,
            registry: this.registry
        });
    }

    key_event_handler = (e: IxTermKeyEvent): void => {
        // TODO: cleanup with dedicated functions for handling each key
        if (e.key === "\r") {
            this.write(NEWLINE);
            this.history.push(this.current_line);
            this.execute(this.current_line);
            this.next_line();
        } else if (e.domEvent.code === "Backspace") {
            if (this.current_line.length > 0) {
                this.current_line = this.current_line.slice(0, -1);
                this.write("\b \b");
                this.current_index--;
            }
        } else if (e.domEvent.code === "ArrowUp") {
            if (history.length > 0) {
                this.write("\b \b".repeat(this.current_line.length));
                this.current_line = history[history.length - 1];
                this.write(this.current_line);
            }
        } else if (e.domEvent.code === "ArrowDown") {
            if (history.length > 0) {
                this.write("\b \b".repeat(this.current_line.length));
                this.reset_current_vars();
                this.write(this.current_line);
            }
        } else if (e.domEvent.code === "ArrowLeft") {
            if (this.current_index > 0) {
                this.write("\b");
                this.current_index--;
            }
        } else if (e.domEvent.code === "ArrowRight") {
            if (this.current_index < this.current_line.length) {
                this.write(this.current_line[this.current_index]);
                this.current_index++;
            }
        } else {
            this.current_line += e.key;
            this.write(e.key);
            this.current_index++;
        }
    }

    constructor(registry?: ProgramRegistry) {
        super();

        this.registry = registry || new ProgramRegistry();

        this.onKey(this.key_event_handler);
        this.splash();
    }
}