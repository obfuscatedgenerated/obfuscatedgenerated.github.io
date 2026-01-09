import type {KeyEventHandler} from "../../../types";

import type {AshShell} from "./core";
import {tab_complete} from "./tab_completion";

export const make_shell_key_handlers = (shell: AshShell): { [key: string]: KeyEventHandler } => ({
    // arrow up
    previous_history(_e, term) {
        const command = shell.memory.get_previous_history_entry();

        if (command) {
            shell._discard_cached_matches = true;

            // bring cursor to end of line
            term.write(" ".repeat(term._current_line.length - term._current_index));

            // clear current line (and move cursor back to start)
            term.write("\b \b".repeat(term._current_line.length));

            // write command
            term.write(command);

            // update current line and index
            term._current_line = command;
            term._current_index = command.length;
        }
    },

    // arrow down
    next_history(_e, term) {
        const command = shell.memory.get_next_history_entry();

        shell._discard_cached_matches = true;

        // bring cursor to end of line
        term.write(" ".repeat(term._current_line.length - term._current_index));

        // clear current line (and move cursor back to start)
        term.write("\b \b".repeat(term._current_line.length));

        if (command) {
            // write command
            term.write(command);

            // update current line and index
            term._current_line = command;
            term._current_index = command.length;
        } else {
            // end of history, just clear line
            term._current_line = "";
            term._current_index = 0;
        }
    },

    // printables
    mark_modified(_e, _term) {
        shell._discard_cached_matches = true;
    },

    // tab
    async tab_completion(_e, term) {
        shell._discard_cached_matches = await tab_complete(term, shell._discard_cached_matches);
    },

    // backspace
    character_deleted(_e, term) {
        // TODO: doesnt work quite the same, if they tab with nothing and hit backspace it will reset. need a way to check current line discipline
        shell._discard_cached_matches = true;
    }
});
