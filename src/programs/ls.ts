import { ANSI, ANSI_ESCAPE_REGEX } from "../term_ctl";
import type { SyncProgram } from "../types";

export default {
    name: "ls",
    description: "List files in the current or another directory.",
    usage_suffix: "[-h] [-a] [path]",
    flags: {
        "-h": "Show this help message.",
        "-a": "Show hidden files."
    },
    main: (data) => {
        // extract from data to make code less verbose
        const { args, term } = data;

        // extract from ANSI to make code less verbose
        const { STYLE, PREFABS } = ANSI;

        // get filesystem
        const fs = term.get_fs();

        // parse arguments
        let show_hidden = false;
        let path = fs.get_cwd();

        for (const arg of args) {
            switch (arg) {
                case "-a":
                    show_hidden = true;
                    break;
                case "-h":
                    term.execute("help ls");
                    return 0;
                default:
                    path = fs.absolute(arg);
            }
        }

        // check if path is a directory and exists
        if (!fs.dir_exists(path)) {
            term.writeln(`${PREFABS.error}No such directory: ${path}${STYLE.reset_all}`);
            return 1;
        }

        // list dir
        let dir = fs.list_dir(path);
        
        // sort alphabetically (usually already sorted by Object.keys but just in case)
        dir.sort();

        // filter out hidden files
        if (!show_hidden) {
            dir = dir.filter((file) => !file.startsWith("."));
        }

        // fit as many files as possible on one line, with a space between each, otherwise wrap
        const max_width = term.cols;
        let line = "";

        for (const file of dir) {
            // check if file will fit on current line
            const real_length = line.replace(ANSI_ESCAPE_REGEX, "").length;
            if (real_length + file.length + 1 > max_width) {
                // write line and reset
                term.writeln(line);
                line = "";
            }

            // add to line
            if (fs.dir_exists(fs.join(path, file))) {
                line += `${PREFABS.dir_name}${file}${STYLE.reset_all} `;
            } else {
                line += `${PREFABS.file_path}${file}${STYLE.reset_all} `;
            }
        }

        // write last line
        term.writeln(line);
        
        return 0;
    }
} as SyncProgram;