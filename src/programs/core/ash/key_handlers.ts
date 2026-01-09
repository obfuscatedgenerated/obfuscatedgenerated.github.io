import type {ReadLineKeyHandler} from "../../../term_ctl";

import type {AshShell} from "./core";
import {tab_complete} from "./tab_completion";

export const make_read_line_key_handlers = (shell: AshShell): { [key: string]: ReadLineKeyHandler } => ({
    // arrow up - previous history
    "\x1b[A": (_e, term, buffer) => {
        const command = shell.memory.get_previous_history_entry();

        if (command) {
            shell._discard_cached_matches = true;

            // bring cursor to end of line
            term.write(" ".repeat(buffer.current_line.length - buffer.current_index));

            // clear current line (and move cursor back to start)
            term.write("\b \b".repeat(buffer.current_line.length));

            // write command
            term.write(command);

            // update current line and index
            buffer.set_current_line(command);
            buffer.set_current_index(command.length);
        }
    },

    // arrow down - next history
    "\x1b[B": (_e, term, buffer) => {
        const command = shell.memory.get_next_history_entry();

        shell._discard_cached_matches = true;

        // bring cursor to end of line
        term.write(" ".repeat(buffer.current_line.length - buffer.current_index));

        // clear current line (and move cursor back to start)
        term.write("\b \b".repeat(buffer.current_line.length));

        if (command) {
            // write command
            term.write(command);

            // update current line and index
            buffer.set_current_line(command);
            buffer.set_current_index(command.length);
        } else {
            // end of history, just clear line
            buffer.set_current_line("");
            buffer.set_current_index(0);
        }
    },

    // tab - tab completion
    "\t": async (_e, term, buffer) => {
        shell._discard_cached_matches = await tab_complete(term, buffer, shell._discard_cached_matches);
    },

    // backspace - discard cached matches
    "\x7f": () => {
        // TODO: doesnt work quite the same, if they tab with nothing and hit backspace it will reset. need a way to check current line discipline
        shell._discard_cached_matches = true;
    }
});

export const make_read_line_printable_handler = (shell: AshShell) => () => {
    shell._discard_cached_matches = true;
};
