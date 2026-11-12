import type { Program } from "../types";
import { ANSI, NEWLINE, AbstractTerminal, NON_PRINTABLE_REGEX } from "../kernel/term_ctl";

const TAB_WIDTH = 4;

// rows used by the header (top), status line and footer (bottom)
const TOP_RESERVED_ROWS = 1;
const BOTTOM_RESERVED_ROWS = 2;

// key sequences as sent by xterm (and most terminal clients, for telnet/ssh sessions)
const KEYS = {
    up: ["\x1b[A", "\x1bOA"],
    down: ["\x1b[B", "\x1bOB"],
    right: ["\x1b[C", "\x1bOC"],
    left: ["\x1b[D", "\x1bOD"],
    home: ["\x1b[H", "\x1bOH", "\x1b[1~", "\x1b[7~"],
    end: ["\x1b[F", "\x1bOF", "\x1b[4~", "\x1b[8~"],
    page_up: ["\x1b[5~"],
    page_down: ["\x1b[6~"],
    delete: ["\x1b[3~"],
    f1: ["\x1bOP", "\x1b[11~"],
    f2: ["\x1bOQ", "\x1b[12~"],
    escape: ["\x1b"],
    enter: ["\r", "\n", "\r\n"],
    backspace: ["\x7f", "\b"],
    tab: ["\t"],
    ctrl_s: ["\x13"],
};

// NON_PRINTABLE_REGEX has the global flag, so .test() is stateful (lastIndex) and gives inconsistent results.
// use a non-global copy instead
const NON_PRINTABLE = new RegExp(NON_PRINTABLE_REGEX.source);

const is_high_surrogate = (code: number) => code >= 0xd800 && code <= 0xdbff;
const is_low_surrogate = (code: number) => code >= 0xdc00 && code <= 0xdfff;

// step over surrogate pairs so emoji etc. aren't split in half
const previous_index = (line: string, index: number) => {
    if (index <= 0) {
        return 0;
    }

    if (index >= 2 && is_low_surrogate(line.charCodeAt(index - 1)) && is_high_surrogate(line.charCodeAt(index - 2))) {
        return index - 2;
    }

    return index - 1;
}

const next_index = (line: string, index: number) => {
    if (index >= line.length) {
        return line.length;
    }

    if (is_high_surrogate(line.charCodeAt(index)) && is_low_surrogate(line.charCodeAt(index + 1))) {
        return index + 2;
    }

    return index + 1;
}

// the on-screen column of a string index, accounting for tabs
const index_to_visual = (line: string, index: number) => {
    let visual = 0;

    for (let char_index = 0; char_index < index && char_index < line.length; char_index = next_index(line, char_index)) {
        if (line[char_index] === "\t") {
            visual += TAB_WIDTH - (visual % TAB_WIDTH);
        } else {
            visual++;
        }
    }

    return visual;
}

// the string index closest to (but not past) an on-screen column
const visual_to_index = (line: string, target_visual: number) => {
    let visual = 0;
    let char_index = 0;

    while (char_index < line.length) {
        const width = line[char_index] === "\t" ? TAB_WIDTH - (visual % TAB_WIDTH) : 1;

        if (visual + width > target_visual) {
            break;
        }

        visual += width;
        char_index = next_index(line, char_index);
    }

    return char_index;
}

const expand_tabs = (line: string) => {
    let result = "";

    for (const char of line) {
        if (char === "\t") {
            result += " ".repeat(TAB_WIDTH - (result.length % TAB_WIDTH));
        } else {
            result += char;
        }
    }

    return result;
}

// pad or truncate text so it fills exactly the given width, centred
const centre_bar = (text: string, width: number) => {
    const clipped = text.slice(0, width);
    const padding_total = width - clipped.length;
    const padding_left = Math.ceil(padding_total / 2);
    const padding_right = padding_total - padding_left;

    return " ".repeat(padding_left) + clipped + " ".repeat(padding_right);
}

// ANSI cursor positioning is 1-indexed
const move_to = (row: number, col: number) => `\x1b[${row};${col}H`;

const CLEAR_LINE = "\x1b[2K";
const HIDE_CURSOR = "\x1b[?25l";
const SHOW_CURSOR = "\x1b[?25h";
const ENTER_ALT_BUFFER = "\x1b[?1049h";
const LEAVE_ALT_BUFFER = "\x1b[?1049l";

class Editor {
    lines: string[];

    // cursor position within the file (row = line index, col = string index within the line)
    row = 0;
    col = 0;

    // the visual column the cursor wants to be at when moving vertically (like nano/vim)
    preferred_visual_col = 0;

    // scroll offsets of the viewport
    scroll_top = 0;
    scroll_left = 0;

    modified = false;
    status_message = "";

    // set after the first escape press with unsaved changes, so a second press confirms discarding
    confirming_discard = false;

    readonly #term: AbstractTerminal;
    readonly #filename: string;
    readonly #readonly: boolean;

    constructor(term: AbstractTerminal, content: string, filename: string, readonly: boolean) {
        this.#term = term;
        this.#filename = filename;
        this.#readonly = readonly;

        // accept either line ending when loading, files are saved with the system NEWLINE
        this.lines = content.split(/\r?\n/);
    }

    get readonly() {
        return this.#readonly;
    }

    get content() {
        return this.lines.join(NEWLINE);
    }

    get #text_height() {
        return Math.max(1, this.#term.rows - TOP_RESERVED_ROWS - BOTTOM_RESERVED_ROWS);
    }

    get #current_line() {
        return this.lines[this.row];
    }

    #set_col(new_col: number) {
        this.col = new_col;
        this.preferred_visual_col = index_to_visual(this.#current_line, this.col);
    }

    #set_row_keeping_column(new_row: number) {
        this.row = Math.max(0, Math.min(this.lines.length - 1, new_row));
        this.col = visual_to_index(this.#current_line, this.preferred_visual_col);
    }

    #mark_modified() {
        this.modified = true;
        this.confirming_discard = false;
    }

    move_up() {
        if (this.row === 0) {
            this.#set_col(0);
            return;
        }

        this.#set_row_keeping_column(this.row - 1);
    }

    move_down() {
        if (this.row === this.lines.length - 1) {
            this.#set_col(this.#current_line.length);
            return;
        }

        this.#set_row_keeping_column(this.row + 1);
    }

    move_left() {
        if (this.col > 0) {
            this.#set_col(previous_index(this.#current_line, this.col));
        } else if (this.row > 0) {
            // wrap to the end of the previous line
            this.row--;
            this.#set_col(this.#current_line.length);
        }
    }

    move_right() {
        if (this.col < this.#current_line.length) {
            this.#set_col(next_index(this.#current_line, this.col));
        } else if (this.row < this.lines.length - 1) {
            // wrap to the start of the next line
            this.row++;
            this.#set_col(0);
        }
    }

    move_home() {
        this.#set_col(0);
    }

    move_end() {
        this.#set_col(this.#current_line.length);
    }

    page_up() {
        this.#set_row_keeping_column(this.row - this.#text_height);
    }

    page_down() {
        this.#set_row_keeping_column(this.row + this.#text_height);
    }

    insert_text(text: string) {
        if (this.#readonly || text.length === 0) {
            return;
        }

        // inserted text may contain newlines (e.g. multiple characters arriving at once over telnet)
        const inserted_lines = text.split(/\r\n|\r|\n/);

        const line = this.#current_line;
        const before_cursor = line.slice(0, this.col);
        const after_cursor = line.slice(this.col);

        if (inserted_lines.length === 1) {
            this.lines[this.row] = before_cursor + text + after_cursor;
            this.#set_col(this.col + text.length);
        } else {
            const last_inserted = inserted_lines[inserted_lines.length - 1];

            const new_lines = [
                before_cursor + inserted_lines[0],
                ...inserted_lines.slice(1, -1),
                last_inserted + after_cursor,
            ];

            this.lines.splice(this.row, 1, ...new_lines);
            this.row += new_lines.length - 1;
            this.#set_col(last_inserted.length);
        }

        this.#mark_modified();
    }

    insert_newline() {
        this.insert_text("\n");
    }

    backspace() {
        if (this.#readonly) {
            return;
        }

        if (this.col > 0) {
            const line = this.#current_line;
            const new_col = previous_index(line, this.col);

            this.lines[this.row] = line.slice(0, new_col) + line.slice(this.col);
            this.#set_col(new_col);
            this.#mark_modified();
            return;
        }

        if (this.row === 0) {
            return;
        }

        // at the start of a line, so join it onto the end of the previous line
        const removed_line = this.lines[this.row];
        this.lines.splice(this.row, 1);
        this.row--;

        const join_point = this.#current_line.length;
        this.lines[this.row] += removed_line;
        this.#set_col(join_point);
        this.#mark_modified();
    }

    delete_forward() {
        if (this.#readonly) {
            return;
        }

        const line = this.#current_line;

        if (this.col < line.length) {
            this.lines[this.row] = line.slice(0, this.col) + line.slice(next_index(line, this.col));
            this.#mark_modified();
            return;
        }

        if (this.row === this.lines.length - 1) {
            return;
        }

        // at the end of a line, so pull the next line up onto this one
        this.lines[this.row] += this.lines[this.row + 1];
        this.lines.splice(this.row + 1, 1);
        this.#mark_modified();
    }

    // adjust the scroll offsets so the cursor is on screen
    #scroll_to_cursor() {
        const text_height = this.#text_height;
        const cols = this.#term.cols;

        if (this.row < this.scroll_top) {
            this.scroll_top = this.row;
        } else if (this.row >= this.scroll_top + text_height) {
            this.scroll_top = this.row - text_height + 1;
        }

        const cursor_visual = index_to_visual(this.#current_line, this.col);

        if (cursor_visual < this.scroll_left) {
            this.scroll_left = cursor_visual;
        } else if (cursor_visual >= this.scroll_left + cols) {
            this.scroll_left = cursor_visual - cols + 1;
        }
    }

    // redraw the whole screen in a single write, with the cursor placed from our own state rather than read back from the terminal
    render() {
        const { STYLE, BG, FG } = ANSI;
        const term = this.#term;
        const cols = term.cols;
        const rows = term.rows;
        const text_height = this.#text_height;

        this.#scroll_to_cursor();

        let output = HIDE_CURSOR;

        // header
        const header_prefix = this.#readonly ? "Viewing read-only file" : "Editing file";
        const header = `${header_prefix}: ${this.#filename}${this.modified ? " (modified)" : ""}`;
        output += move_to(1, 1) + BG.white + FG.black + STYLE.bold + centre_bar(header, cols) + STYLE.reset_all;

        // file content
        for (let screen_row = 0; screen_row < text_height; screen_row++) {
            const line_index = this.scroll_top + screen_row;
            output += move_to(TOP_RESERVED_ROWS + screen_row + 1, 1) + CLEAR_LINE;

            if (line_index < this.lines.length) {
                output += expand_tabs(this.lines[line_index]).slice(this.scroll_left, this.scroll_left + cols);
            }
        }

        // status line
        const position = `Ln ${this.row + 1}, Col ${index_to_visual(this.#current_line, this.col) + 1}`;
        const status = this.status_message ? `${this.status_message}  |  ${position}` : position;
        output += move_to(rows - 1, 1) + CLEAR_LINE + FG.yellow + status.slice(0, cols) + STYLE.reset_all;

        // footer
        const footer = `${this.#readonly ? "" : "F1: Save & Exit | Ctrl+S: Save | "}ESC: Exit`;
        output += move_to(rows, 1) + BG.white + FG.black + STYLE.bold + centre_bar(footer, cols) + STYLE.reset_all;

        // place the cursor
        const cursor_screen_row = TOP_RESERVED_ROWS + (this.row - this.scroll_top) + 1;
        const cursor_screen_col = index_to_visual(this.#current_line, this.col) - this.scroll_left + 1;
        output += move_to(cursor_screen_row, cursor_screen_col) + SHOW_CURSOR;

        term.write(output);
    }
}

const key_matches = (key: string, sequences: string[]) => sequences.includes(key);

export default {
    name: "edit",
    description: "Edits the specified file.",
    usage_suffix: "path",
    arg_descriptions: {},
    compat: "2.0.0",
    main: async (data) => {
        // extract from data to make code less verbose
        const { kernel, args, term } = data;

        // extract from ANSI to make code less verbose
        const { STYLE, PREFABS, FG } = ANSI;

        // get filesystem
        const fs = kernel.get_fs();

        // parse argument
        if (args.length !== 1) {
            term.writeln(`${PREFABS.error}A single argument, the path, is required.${STYLE.reset_all}`);
            return 1;
        }

        const path = fs.absolute(args[0]);

        if (await fs.dir_exists(path)) {
            term.writeln(`${PREFABS.error}Cannot edit a directory: ${path}${STYLE.reset_all}`);
            return 1;
        }

        // if the file exists, load it in. otherwise, keep the content empty
        let content = "";
        let readonly = false;
        if (await fs.exists(path)) {
            content = await fs.read_file(path) as string;
            readonly = await fs.is_readonly(path);
        }

        const filename = path.split("/").pop() || path;
        const editor = new Editor(term, content, filename, readonly);

        if (readonly) {
            editor.status_message = "File is read-only, changes cannot be made.";
        }

        const save = async () => {
            try {
                await fs.write_file(path, editor.content);
                editor.modified = false;
                editor.status_message = "Saved.";
                return true;
            } catch (error) {
                editor.status_message = `Failed to save: ${error instanceof Error ? error.message : String(error)}`;
                return false;
            }
        }

        term.write(ENTER_ALT_BUFFER);
        editor.render();

        let saved = false;
        let running = true;

        try {
            while (running) {
                const { key } = await term.wait_for_keypress();

                // clear the status message on any keypress, actions below may set a new one
                const was_confirming_discard = editor.confirming_discard;
                editor.confirming_discard = false;
                editor.status_message = "";

                if (key_matches(key, KEYS.escape)) {
                    if (editor.modified && !was_confirming_discard) {
                        editor.confirming_discard = true;
                        editor.status_message = "Unsaved changes! Press ESC again to discard, or F1 to save & exit.";
                    } else {
                        running = false;
                    }
                } else if (key_matches(key, KEYS.f1)) {
                    if (readonly) {
                        editor.status_message = "File is read-only, cannot save.";
                    } else if (await save()) {
                        saved = true;
                        running = false;
                    }
                } else if (key_matches(key, KEYS.ctrl_s)) {
                    if (readonly) {
                        editor.status_message = "File is read-only, cannot save.";
                    } else if (await save()) {
                        saved = true;
                    }
                } else if (key_matches(key, KEYS.up)) {
                    editor.move_up();
                } else if (key_matches(key, KEYS.down)) {
                    editor.move_down();
                } else if (key_matches(key, KEYS.left)) {
                    editor.move_left();
                } else if (key_matches(key, KEYS.right)) {
                    editor.move_right();
                } else if (key_matches(key, KEYS.home)) {
                    editor.move_home();
                } else if (key_matches(key, KEYS.end)) {
                    editor.move_end();
                } else if (key_matches(key, KEYS.page_up)) {
                    editor.page_up();
                } else if (key_matches(key, KEYS.page_down)) {
                    editor.page_down();
                } else if (key_matches(key, KEYS.enter)) {
                    editor.insert_newline();
                } else if (key_matches(key, KEYS.backspace)) {
                    editor.backspace();
                } else if (key_matches(key, KEYS.delete)) {
                    editor.delete_forward();
                } else if (key_matches(key, KEYS.tab)) {
                    editor.insert_text("\t");
                } else if (!key.startsWith("\x1b")) {
                    // printable text (can be several characters at once over telnet/ssh). drop any control characters, keeping newlines
                    const printable = Array.from(key)
                        .filter((char) => char === "\r" || char === "\n" || !NON_PRINTABLE.test(char))
                        .join("");

                    editor.insert_text(printable);
                }

                if (running) {
                    editor.render();
                }
            }
        } finally {
            // always restore the main screen, even if something throws
            term.write(LEAVE_ALT_BUFFER + SHOW_CURSOR);
        }

        if (saved) {
            term.writeln(`${FG.green}File saved!${STYLE.reset_all}`);
        } else {
            term.writeln(`${FG.red}Exited without saving!${STYLE.reset_all}`);
        }

        return 0;
    }
} as Program;
