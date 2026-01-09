import type { KeyEventHandler } from "../../../types";
import type { WrappedTerminal } from "../../../term_ctl";

import {tab_complete} from "./tab_completion";

// TODO: replace private access with functions

let discard_cached_matches = false;

// arrow up
export const previous_history: KeyEventHandler = (_e, term) => {
    if (term._history.length > 0 && term._current_history_index < term._history.length) {
        discard_cached_matches = true;

        // bring cursor to end of line
        term.write(" ".repeat(term._current_line.length - term._current_index));

        // clear current line (and move cursor back to start)
        term.write("\b \b".repeat(term._current_line.length));

        // increment history index and get command
        const command = term._history[term._history.length - ++term._current_history_index];

        // write command
        term.write(command);

        // update current line and index
        term._current_line = command;
        term._current_index = command.length;
    }
}

// arrow down
export const next_history: KeyEventHandler = (_e, term) => {
    if (term._history.length > 0 && term._current_history_index > 0) {
        discard_cached_matches = true;

        // bring cursor to end of line
        term.write(" ".repeat(term._current_line.length - term._current_index));

        // clear current line (and move cursor back to start)
        term.write("\b \b".repeat(term._current_line.length));

        // decrement history index and get command
        let command = term._history[term._history.length - --term._current_history_index];

        // if we're at the end of the history, clear the line
        if (term._current_history_index === 0) {
            command = "";
        }

        // write command
        term.write(command);

        // update current line and index
        term._current_line = command;
        term._current_index = command.length;
    }
}

// printables
export const mark_modified: KeyEventHandler = (_e, _term) => {
    discard_cached_matches = true;
}

// tab
export const tab_completion: KeyEventHandler = async (_e, term) => {
    discard_cached_matches = await tab_complete(term, discard_cached_matches);
}

export const register_builtin_key_handlers = (term: WrappedTerminal) => {
    term.register_key_event_handler(
        previous_history,
        {
            domEventCode: "ArrowUp",
            block: true,
        }
    );

    term.register_key_event_handler(
        next_history,
        {
            domEventCode: "ArrowDown",
            block: true,
        }
    );

    term.register_key_event_handler(
        tab_completion,
        {
            keyString: "\t",
            block: true,
        }
    );

    term.register_on_printable_key_event_handler(
        mark_modified,
    );
}
