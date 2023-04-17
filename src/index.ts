import { Terminal } from "xterm";
import "xterm/css/xterm.css";

import { FitAddon } from "xterm-addon-fit";
import { WebLinksAddon } from "xterm-addon-web-links";

const term = new Terminal();

const fit = new FitAddon();
term.loadAddon(fit);
term.loadAddon(new WebLinksAddon());

const render = <HTMLElement>document.querySelector("#terminal");
term.open(render);
fit.fit();

term.focus();

const newLine = "\r\n";

term.writeln("┌─ Welcome to \x1B[1;3;31mOllieOS...\x1B[0m ──────────────┐");
term.writeln("│  \x1B[35;1mType \x1B[1;3;32mhelp\x1B[0m\x1B[35;1m for a list of commands.\x1B[0m   │");
term.writeln("└──────────────────────────────────────┘");
term.write(newLine);
term.write("$ ");

let history: string[] = [];
let current_line: string = "";
let current_index = 0;

let process_line = (line: string): void => {
    // remove leading and trailing whitespace and split the line into an array of words
    let sub = line.trim().split(" ");

    // the first word is the command, the rest are arguments
    let command = sub[0];
    let args = sub.slice(1);

    // TODO: import this info from a directory of commands and help pages
    switch (command) {
        case "help":
            if (args.length === 0) {
                term.writeln("\x1B[1;3;32mhelp\x1B[0m - List programs or get help for a specific program.");
                term.writeln("\x1B[1;3;32mclear\x1B[0m - Clear the terminal.");
                term.writeln("\x1B[1;3;32mshutdown\x1B[0m - Exit the terminal.");
                term.writeln("\x1B[1;3;32mls\x1B[0m - List files in the current directory.");
                term.writeln("\x1B[1;3;32mcd\x1B[0m - Change the current directory.");
            } else {
                switch (args[0]) {
                    case "help":
                        term.writeln("Usage: \x1B[1;3;32mhelp\x1B[0m [command]");
                        term.writeln("Displays a list of commands or help for a specific command.");
                        break;
                    case "clear":
                        term.writeln("Usage: \x1B[1;3;32mclear\x1B[0m");
                        term.writeln("Clears the terminal.");
                        break;
                    case "shutdown":
                        term.writeln("Usage: \x1B[1;3;32mshutdown\x1B[0m [-r]");
                        term.writeln("Exits the terminal.");
                        term.writeln("  -r  Reboot the terminal.");
                        break;
                    default:
                        term.writeln(`\x1B[1;3;31mCould not resolve help for ${args[0]}.\x1B[0m`);
                }
            }
            break;
        case "clear":
            setTimeout(() => {
                term.clear();
            }, 1); // doesn't clear the input line without this
            break;
        case "shutdown":
            term.writeln("\x1B[1;3;31mShutting down...\x1B[0m");

            setTimeout(() => {
                term.dispose();
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
            term.writeln("\x1B[1;3;31mUnknown command.\x1B[0m");
            break;
    }
}

term.onKey((e) => {
    if (e.key === "\r") {
        term.write("\r\n");
        history.push(current_line);
        process_line(current_line);
        current_line = "";
        current_index = 0;
        term.write("$ ");
    } else if (e.domEvent.code === "Backspace") {
        if (current_line.length > 0) {
            current_line = current_line.slice(0, -1);
            term.write("\b \b");
        }
    } else if (e.domEvent.code === "ArrowUp") {
        if (history.length > 0) {
            term.write("\b \b".repeat(current_line.length));
            current_line = history[history.length - 1];
            term.write(current_line);
        }
    } else if (e.domEvent.code === "ArrowDown") {
        if (history.length > 0) {
            term.write("\b \b".repeat(current_line.length));
            current_line = "";
            current_index = 0;
            term.write(current_line);
        }
    } else if (e.domEvent.code === "ArrowLeft") {
        if (current_index > 0) {
            term.write("\b");
            current_index--;
        }
    } else if (e.domEvent.code === "ArrowRight") {
        if (current_index < current_line.length) {
            term.write(current_line[current_index]);
            current_index++;
        }
    } else {
        current_line += e.key;
        term.write(e.key);
        current_index++;
    }
});