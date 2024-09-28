import type { AsyncProgram } from "../types";
import { ANSI, NEWLINE, WrappedTerminal, NON_PRINTABLE_REGEX } from "../term_ctl";

const HEADER = 2;

const setup = (term: WrappedTerminal, content: string, path: string, readonly: boolean) => {
    // extract from ANSI to make code less verbose
    const { STYLE, BG, FG } = ANSI;

    // clear the screen
    term.clear();

    // write the file name centered in the header, showing the read-only status if the file is read-only
    const filename = path.split("/").pop() || "";
    const header = readonly ? `Viewing read-only file: ${filename}` : `Editing file: ${filename}`;
    const h_padding_l = " ".repeat(Math.ceil((term.cols - header.length) / 2));
    const h_padding_r = " ".repeat(Math.floor((term.cols - header.length) / 2));

    term.write(BG.white + FG.black + STYLE.bold);
    term.write(h_padding_l);
    term.write(header);
    term.write(h_padding_r);
    term.write(STYLE.reset_all)

    // go to the bottom of the screen with ansi
    term.write(`\x1b[${term.rows - 1};0H`);

    // write the footer, showing the save and exit key if the file is not read-only
    const footer = `${readonly ? "" : "F1: Save & Exit | "}ESC: Exit without saving | F2: Debug Redraw`;
    const f_padding_l = " ".repeat(Math.ceil((term.cols - footer.length) / 2));
    const f_padding_r = " ".repeat(Math.floor((term.cols - footer.length) / 2));

    term.write(BG.white + FG.black + STYLE.bold);
    term.write(f_padding_l);
    term.write(footer);
    term.write(f_padding_r);
    term.write(STYLE.reset_all)

    // reset the cursor position to under the header
    term.write("\x1b[2;0H");
    term.write(NEWLINE);

    // write the content
    term.write(content);

    // reset the cursor position to under the header
    term.write("\x1b[2;0H");
    term.write(NEWLINE);
}


// TODO: expose ANSI cursor control codes as functions in term_ctl
// TODO: consider instead using a hidden textarea to store the character buffer, or using a queue and reimplementing the terminal's keypress handler
// TODO: provide method in terminal to set up the above ^^^
// TODO: none of this accounts for scrolling!! use of cursorPos will not function properly if the terminal is scrolled
// TODO: it would be nice to not "cheat" at enter and backspace, but to actually handle them properly. this is fine for now i guess

export default {
    name: "edit",
    description: "Edits the specified file.",
    usage_suffix: "path",
    arg_descriptions: {},
    async_main: async (data) => {
        // extract from data to make code less verbose
        const { args, term } = data;

        // extract from ANSI to make code less verbose
        const { STYLE, PREFABS, FG } = ANSI;

        // get filesystem
        const fs = term.get_fs();

        // parse argument
        if (args.length !== 1) {
            term.writeln(`${PREFABS.error}A single argument, the path, is required.${STYLE.reset_all}`);
            return 1;
        }

        const path = fs.absolute(args[0]);


        let content = "";

        // if the file exists, load it in. otherwise, keep the content empty
        let readonly = false;
        if (fs.exists(path)) {
            content = fs.read_file(path) as string;
            readonly = fs.is_readonly(path);

            // lock the file by making it read-only
            fs.set_readonly(path, true);
        }

        // temporary note
        // TODO: remove
        term.writeln(`${FG.yellow}Note: This program is still in development and is very broken!${NEWLINE}If you just need to read a file, use ${PREFABS.program_name}cat${STYLE.reset_all + FG.yellow}.${NEWLINE}If you need to edit a file, use the ${PREFABS.program_name}fsedit${STYLE.reset_all + FG.yellow} UI.${NEWLINE}Press any key to proceed.${STYLE.reset_all}`);
        await term.wait_for_keypress();

        // setup the screen
        setup(term, content, path, readonly);

        const split_content = content.split(NEWLINE);

        // wait for keypresses
        let exit_code: number | null = null;
        let saved = false;
        while (exit_code === null) {
            const key = await term.wait_for_keypress();

            switch (key.domEvent.code) {
                case "Escape":
                    // revert the file to its original read-only status
                    fs.set_readonly(path, readonly);

                    exit_code = 0;
                    break;
                case "F1":
                    // if readonly, don't allow saving
                    if (readonly) {
                        break;
                    }

                    fs.write_file(path, split_content.join(NEWLINE));
                    saved = true;

                    // revert the file to its original read-only status
                    fs.set_readonly(path, readonly);

                    exit_code = 0;
                    break;
                case "F2":
                    term.reset();
                    setup(term, split_content.join(NEWLINE), path, readonly);
                    console.log(split_content.join("\n"));
                    break;
                case "ArrowUp": {
                    // determine the current cursor position
                    const cursor_y = term.buffer.normal.cursorY;

                    if (cursor_y === 2) {
                        // TODO: scroll file
                        // we're at the top of the file, so we can't move up
                        break;
                    }

                    // pass through to the terminal
                    term.write(key.key);

                    // determine the current line's length (sub 2 for header, sub 1 for moving up)
                    const line_length = split_content[cursor_y - HEADER - 1].length;

                    // determine the cursor's x position
                    const cursor_x = term.buffer.normal.cursorX;

                    // move cursor to the end of the line, typing backspaces if it is past the end or the right arrow code if it is not
                    if (cursor_x >= line_length) {
                        term.write("\b".repeat(cursor_x - line_length));
                    } else {
                        term.write("\x1b[C".repeat(line_length - cursor_x));
                    }
                }
                    break;
                case "ArrowDown": {
                    // determine the current cursor position
                    const cursor_y = term.buffer.normal.cursorY;

                    if (cursor_y === term.rows - 4) {
                        // TODO: scroll file
                        // we're at the bottom of the screen, so we can't move down
                        break;
                    }

                    if (cursor_y === split_content.length + HEADER - 1) { // (add 2 for header, sub 1 for 0-indexing)
                        // we're at the bottom of the file, so we can't move down
                        break;
                    }

                    // pass through to the terminal
                    term.write(key.key);

                    // determine the current line's length (sub 2 for header, add 1 for moving down)
                    const line_length = split_content[cursor_y - HEADER + 1].length;

                    // determine the cursor's x position
                    const cursor_x = term.buffer.normal.cursorX;

                    // move cursor to the end of the line, typing backspaces if it is past the end or the right arrow code if it is not
                    if (cursor_x >= line_length) {
                        term.write("\b".repeat(cursor_x - line_length));
                    } else {
                        term.write("\x1b[C".repeat(line_length - cursor_x));
                    }
                }
                    break;
                case "ArrowLeft":
                    // left arrow can always be passed through to the terminal as the terminal will handle the left margin
                    term.write(key.key);
                    break;
                case "ArrowRight": {
                    // determine cursor position
                    const cursor_x = term.buffer.normal.cursorX;
                    const cursor_y = term.buffer.normal.cursorY;

                    // determine the current line's length (sub 2 for header)
                    const line_length = split_content[cursor_y - HEADER].length;

                    if (cursor_x < line_length) {
                        // pass through to the terminal
                        // NOTE: no need to check right margin, because the terminal will handle that
                        term.write(key.key);
                    }
                }
                    break;
                case "Enter": {
                    // if readonly, don't allow editing
                    if (readonly) {
                        break;
                    }


                    // determine cursor position
                    const cursor_x = term.buffer.normal.cursorX;
                    let cursor_y = term.buffer.normal.cursorY;

                    // split the current line at the cursor position
                    const line = split_content[cursor_y - HEADER];

                    const before_newline = line.slice(0, cursor_x);
                    const after_newline = line.slice(cursor_x);

                    const old_split_content = split_content.slice();

                    // insert the new line into the content, between the before_newline and after_newline
                    split_content.splice(cursor_y - HEADER, 1, before_newline, after_newline);

                    // the code below to redraw selectively is a mess and doesn't work properly for all cases, but is improving
                    // for now, just to get edit in a somewhat working state, we'll just clear the screen and redraw everything (debug redraw but restoring cursor position)

                    // debug redraw
                    term.reset();
                    setup(term, split_content.join(NEWLINE), path, readonly);

                    // move the cursor to the start of the new line
                    term.write(`\x1b[${cursor_y + 2};1H`);

                    break;

                    // clear text past the cursor
                    term.write(" ".repeat(line.length - cursor_x));

                    // move the cursor down one line and to the beginning of the line
                    term.write("\x1b[1B\x1b[1G");

                    // we are now on the new line. clear it using the old line length and write the new content from after_newline
                    // TODO: could just clear what overruns the new content, but the logic is more confusing. clearing everything is simpler but less efficient
                    term.write(" ".repeat(old_split_content[cursor_y - HEADER].length)); // doesnt work for all cases, sometime leaves longer line stray
                    term.write("\x1b[1G")
                    term.write(after_newline);

                    // adjust cursor y to reflect the real newline being handled
                    cursor_y++;

                    // clear all the lines below the new cursor position, then write the new content into them
                    // TODO: could just clear what overruns the new content, but the logic is more confusing. clearing everything is simpler but less efficient
                    let lines_redrawn = 0;
                    for (let i = cursor_y - HEADER + 1; i < split_content.length; i++) {
                        term.write("\x1b[1B\x1b[1G");
                        if (old_split_content[i]) {
                            term.write(" ".repeat(old_split_content[i].length));
                            term.write("\x1b[1G");
                        }
                        term.write(split_content[i]);
                        lines_redrawn++;
                    }

                    // move the cursor back to the original line at the start of the new line
                    term.write("\x1b[1G");
                    if (lines_redrawn > 0) {
                        term.write(`\x1b[${lines_redrawn}A`);
                    }
                }
                    break;
                case "Backspace": {
                    // if readonly, don't allow editing
                    if (readonly) {
                        break;
                    }

                    // get the current cursor position
                    const cursor_x = term.buffer.normal.cursorX;
                    const cursor_y = term.buffer.normal.cursorY;

                    // do nothing at the start of the file
                    if (cursor_x === 0 && cursor_y === 2) {
                        break;
                    }

                    // if at the beginning of the line, remove the newline
                    if (cursor_x === 0) {
                        // move previous line's content to the end of the current line
                        const newline_content = split_content[cursor_y - HEADER];
                        split_content[cursor_y - HEADER - 1] += newline_content;

                        split_content.splice(cursor_y - HEADER, 1);

                        // the code below to handle backspacing a newline ever only partly worked
                        // for now, just to get edit in a somewhat working state, we'll just clear the screen and redraw everything (debug redraw but restoring cursor position)

                        // debug redraw
                        term.reset();
                        setup(term, split_content.join(NEWLINE), path, readonly);

                        // move the cursor to the previous line to the right length across (N from the end where N is the length of the line we just merged, newline_content)
                        term.write(`\x1b[${cursor_y};${split_content[cursor_y - 3].length - newline_content.length + 1}G`);

                        break;

                        // move the cursor up one line
                        term.write("\x1b[1A");

                        // move the cursor to the end of the line
                        term.write(`\x1b[${split_content[cursor_y - 3].length + 1}G`);

                        // write the rest of the line
                        term.write(split_content[cursor_y - HEADER]);

                        // move the cursor back to the original position
                        term.write(`\x1b[${split_content[cursor_y - HEADER].length + 1}D`);

                        // TODO: redraw following lines properly

                        break;
                    }


                    // otherwise, remove the character to the left of the cursor
                    const left = split_content[cursor_y - HEADER].slice(0, cursor_x - 1);
                    const right = split_content[cursor_y - HEADER].slice(cursor_x);

                    split_content[cursor_y - HEADER] = left + right;

                    // move the cursor back one space
                    term.write("\b");

                    // write the rest of the line
                    term.write(right + " ");

                    // move the cursor back to the original position
                    term.write(`\x1b[${right.length + 1}D`);

                    // if the line is now empty, remove it, unless it's the first line
                    if (cursor_y !== 2 && split_content[cursor_y - HEADER] === "") {
                        split_content.splice(cursor_y - HEADER, 1);
                        term.write("\x1b[1M");
                        break;
                    }

                    // if the cursor is now past the end of the line, move it to the end of the line
                    if (cursor_x > split_content[cursor_y - HEADER].length) {
                        term.write(`\x1b[${split_content[cursor_y - HEADER].length + 1}G`);
                    }
                }
                    break;
                default: {
                    // if readonly, don't allow editing
                    if (readonly) {
                        break;
                    }

                    // get the current cursor position
                    const cursor_x = term.buffer.normal.cursorX;
                    const cursor_y = term.buffer.normal.cursorY;

                    // if the key is a printable character, write it in
                    if (!NON_PRINTABLE_REGEX.test(key.key)) {
                        // if at the end of the line, append to the line
                        if (cursor_x === split_content[cursor_y - HEADER].length + 1) {
                            split_content[cursor_y - HEADER] += key.key;
                            term.write(key.key);
                        } else {
                            // otherwise, insert it and shift the rest of the line
                            const left = split_content[cursor_y - HEADER].slice(0, cursor_x);
                            const right = split_content[cursor_y - HEADER].slice(cursor_x);

                            split_content[cursor_y - HEADER] = left + key.key + right;

                            // overwrite the line
                            term.write(key.key + right);

                            // move the cursor back to the correct position + 1
                            term.write(`\x1b[${cursor_x + 2}G`);
                        }
                    }
                }
            }
        }

        term.reset();

        if (saved) {
            term.writeln(`${FG.green}File saved!${STYLE.reset_all}`);
        } else {
            // TODO: cant exit without saving, crashes the program when trying to set readonly status
            term.writeln(`${FG.red}Exited without saving!${STYLE.reset_all}`);
        }

        return exit_code;
    }
} as AsyncProgram;