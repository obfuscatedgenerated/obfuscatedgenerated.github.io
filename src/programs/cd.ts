import { ANSI, NEWLINE, ANSI_ESCAPE_REGEX } from "../term_ctl";
import type { Program } from "../types";

export default {
    name: "cd",
    description: "Change directory or print current directory.",
    usage_suffix: "[path]",
    flags: {},
    main: (data) => {
        // extract from data to make code less verbose
        const { args, term } = data;

        // extract from ANSI to make code less verbose
        const { STYLE, PREFABS } = ANSI;
        
        // get filesystem
        const fs = term.get_fs();

        
        // if no arguments, print current directory
        if (args.length === 0) {
            term.writeln(PREFABS.dir_name + fs.get_cwd() + STYLE.reset_all);
            return 0;
        }

        // if more than one argument, print error
        if (args.length > 1) {
            term.writeln(`${PREFABS.error}Too many arguments${STYLE.reset_all}`);
            return 1;
        }

        // check if path is a directory and exists
        const path = args[0];
        const absolute_path = fs.absolute(path);

        if (!fs.dir_exists(absolute_path)) {
            term.writeln(`${PREFABS.error}No such directory: ${path}${STYLE.reset_all}`);
            return 1;
        }

        // change directory
        fs.set_cwd(absolute_path);

        return 0;
    }
} as Program;