import type { AsyncProgram } from "../types";
import { ANSI, NEWLINE, WrappedTerminal } from "../term_ctl";

const setup = (term: WrappedTerminal, content: string, path: string) => {
    // extract from ANSI to make code less verbose
    const { STYLE, BG, FG } = ANSI;

    // clear the screen
    term.clear();

    // write the file name centered in the header
    const filename = path.split("/").pop() || "";
    const header = `Editing ${filename} | F1: Save & Exit | ESC: Exit without saving`;

    term.write(BG.white + FG.black + STYLE.bold);
    term.write(" ".repeat((term.cols - header.length) / 2));
    term.write(header);
    term.write(" ".repeat((term.cols - header.length) / 2));
    term.write(STYLE.reset_all)
    term.write(NEWLINE);
    term.write(NEWLINE);

    // write the content
    term.write(content);
}


export default {
    name: "edit",
    description: "Edits the specified file.",
    usage_suffix: "<path>",
    flags: {},
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
        if (fs.exists(path)) {
            content = fs.read_file(path);
        }

        // setup the screen
        setup(term, content, path);

        // wait for keypresses
        let exit_code: number | null = null;
        let saved = false;
        while (exit_code === null) {
            const key = await term.wait_for_keypress();

            switch (key.domEvent.code) {
                case "Escape":
                    exit_code = 0;
                    break;
                case "F1":
                    fs.write_file(path, content);
                    saved = true;
                    exit_code = 0;
                    break;
            }
        }

        term.clear();

        if (saved) {
            term.writeln(`${FG.green}File saved!${STYLE.reset_all}`);
        } else {
            term.writeln(`${FG.red}Exited without saving!${STYLE.reset_all}`);
        }

        return exit_code;
    }
} as AsyncProgram;