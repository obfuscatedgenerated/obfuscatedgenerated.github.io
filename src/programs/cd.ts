import { ANSI } from "../term_ctl";
import type { Program } from "../types";

export default {
    name: "cd",
    description: "Change directory.",
    usage_suffix: "[path]",
    arg_descriptions: {
        path: "Path to directory to change to. If no path is given, change to home directory."
    },
    main: async (data) => {
        // extract from data to make code less verbose
        const { args, term } = data;

        // extract from ANSI to make code less verbose
        const { STYLE, PREFABS } = ANSI;
        
        // get filesystem
        const fs = term.get_fs();

        
        // if no arguments, go to home directory
        if (args.length === 0) {
            fs.set_cwd(fs.get_home());
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