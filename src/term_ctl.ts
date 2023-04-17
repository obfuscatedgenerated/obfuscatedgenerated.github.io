import { Terminal } from "xterm";

const NEWLINE = "\r\n";

interface IxTermKeyEvent {
    key: string;
    domEvent: KeyboardEvent;
}

export class WrappedTerminal extends Terminal {
    history: string[] = [];
    current_line = "";
    current_index = 0;

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
        this.writeln("┌─ Welcome to \x1B[1;3;31mOllieOS...\x1B[0m ──────────────┐");
        this.writeln("│  \x1B[35;1mType \x1B[1;3;32mhelp\x1B[0m\x1B[35;1m for a list of commands.\x1B[0m   │");
        this.writeln("└──────────────────────────────────────┘");
        this.insert_preline();
    }

    process_line = (line: string): void => {
        // remove leading and trailing whitespace and split the line into an array of words
        let sub = line.trim().split(" ");

        // the first word is the command, the rest are arguments
        let command = sub[0];
        let args = sub.slice(1);

        // TODO: import this info from a directory of commands and help pages
        switch (command) {
            case "help":
                if (args.length === 0) {
                    this.writeln("\x1B[1;3;32mhelp\x1B[0m - List programs or get help for a specific program.");
                    this.writeln("\x1B[1;3;32mclear\x1B[0m - Clear the terminal.");
                    this.writeln("\x1B[1;3;32mshutdown\x1B[0m - Exit the terminal.");
                    this.writeln("\x1B[1;3;32mls\x1B[0m - List files in the current directory.");
                    this.writeln("\x1B[1;3;32mcd\x1B[0m - Change the current directory.");
                } else {
                    switch (args[0]) {
                        case "help":
                            this.writeln("Usage: \x1B[1;3;32mhelp\x1B[0m [command]");
                            this.writeln("Displays a list of commands or help for a specific command.");
                            break;
                        case "clear":
                            this.writeln("Usage: \x1B[1;3;32mclear\x1B[0m");
                            this.writeln("Clears the terminal.");
                            break;
                        case "shutdown":
                            this.writeln("Usage: \x1B[1;3;32mshutdown\x1B[0m [-r]");
                            this.writeln("Exits the terminal.");
                            this.writeln("  -r  Reboot the terminal.");
                            break;
                        default:
                            this.writeln(`\x1B[1;3;31mCould not resolve help for ${args[0]}.\x1B[0m`);
                    }
                }
                break;
            case "clear":
                setTimeout(() => {
                    this.clear();
                }, 1); // doesn't clear the input line without this
                break;
            case "shutdown":
                this.writeln("\x1B[1;3;31mShutting down...\x1B[0m");

                setTimeout(() => {
                    this.dispose();
                }, 1000);

                if (args.length > 0) {
                    if (args[0] === "-r") {
                        setTimeout(() => {
                            location.reload();
                        }, 1500);
                    }
                }
                break;
            default:
                this.writeln("\x1B[1;3;31mUnknown command.\x1B[0m");
                break;
        }
    }

    key_event_handler = (e: IxTermKeyEvent): void => {
        if (e.key === "\r") {
            this.write(NEWLINE);
            this.history.push(this.current_line);
            this.process_line(this.current_line);
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

    constructor() {
        super();
        this.onKey(this.key_event_handler);
        this.splash();
    }
}