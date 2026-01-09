import type { KeyEventHandler } from "../../../types";
import { NEWLINE, ANSI } from "../../../term_ctl";
import type { WrappedTerminal } from "../../../term_ctl";

import { AbstractFileSystem, FSEventType } from "../../../filesystem";
import {tab_complete} from "./tab_completion";

//const { STYLE, PREFABS } = ANSI; // doesn't work for some reason

// TODO: replace private access with functions

let discard_cached_matches = false;

// enter
export const execute_next_line: KeyEventHandler = async (_e, term) => {
    discard_cached_matches = true;

    // pause handling key events
    const was_handling_key_events = term._is_handling_key_events;
    term._is_handling_key_events = false;

    if (term._current_line.length === 0) {
        // if the line is empty, just move to the next line
        await term.next_line();
        return;
    }

    term.write(NEWLINE);
    term._history.push(term._current_line);
    await term.execute(term._current_line);
    await term.next_line();

    // resume handling key events
    if (was_handling_key_events) {
        term._is_handling_key_events = true;
        term._handle_key_event_queue();
    }
}

// backspace
export const delete_character: KeyEventHandler = (_e, term) => {
    if (term._current_line.length > 0 && term._current_index > 0) {
        discard_cached_matches = true;

        // get everything before the cursor
        const before = term._current_line.slice(0, term._current_index - 1);

        // get everything after the cursor
        const after = term._current_line.slice(term._current_index);

        // update current line
        term._current_line = before + after;

        // move cursor back one
        term.write("\b");

        // overwrite with after content and a space (remove last character)
        term.write(after + " ");

        // move cursor back to original position
        term.write("\b".repeat(after.length + 1));
        term._current_index--;
    }
}

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

// arrow left
export const move_cursor_left: KeyEventHandler = (_e, term) => {
    if (term._current_index > 0) {
        term.write("\b");
        term._current_index--;
    }
}

// arrow right
export const move_cursor_right: KeyEventHandler = (_e, term) => {
    if (term._current_index < term._current_line.length) {
        term.write(term._current_line[term._current_index]);
        term._current_index++;
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
        execute_next_line,
        {
            keyString: "\r",
            block: true,
        }
    );

    term.register_key_event_handler(
        delete_character,
        {
            domEventCode: "Backspace",
            block: true,
        }
    );

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
        move_cursor_left,
        {
            domEventCode: "ArrowLeft",
            block: true,
        }
    );

    term.register_key_event_handler(
        move_cursor_right,
        {
            domEventCode: "ArrowRight",
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

// on set cwd
export const change_prompt = (path: string, fs: AbstractFileSystem, term: WrappedTerminal) => {
    const { PREFABS, STYLE } = ANSI;

    if (path.startsWith(fs.get_home())) {
        // replace home with ~ at start of path only
        path = path.replace(new RegExp(`^${fs.get_home()}`), "~");
    }

    // build result e.g. ~$ 
    const new_prompt = `${PREFABS.dir_name}${path}${STYLE.reset_all}`;
    term.set_prompt(new_prompt);
}


export const register_builtin_fs_handlers = (term: WrappedTerminal) => {
    const fs = term.get_fs();

    fs.register_callback(FSEventType.SET_CWD, (data: string): void => {
        change_prompt(data, fs, term);
    });
}