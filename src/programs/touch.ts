import type {Program} from "../types";
import {ANSI} from "../kernel/term_ctl";

// yes, the actual touch command is used to modify access time and has more flags, but this os doesn't have access times and this is meant to be simple

export default {
    name: "touch",
    description: "Creates a file.",
    usage_suffix: "file",
    arg_descriptions: {
        "Arguments:": {
            "file": "The file to create."
        }
    },
    compat: "2.0.0",
    main: async (data) => {
        // extract from data to make code less verbose
        const {kernel, args, term} = data;

        // extract from ANSI to make code less verbose
        const {STYLE, PREFABS} = ANSI;

        // get filesystem
        const fs = kernel.get_fs();

        // if no arguments, print error
        if (args.length === 0) {
            term.writeln(`${PREFABS.error}Missing file operand.${STYLE.reset_all}`);
            return 1;
        }

        // if more than one argument, print error
        // TODO: i think this is the only program that checks this, the others drop the extra arguments. do something about this!
        if (args.length > 1) {
            term.writeln(`${PREFABS.error}Too many arguments${STYLE.reset_all}`);
            return 1;
        }

        // if the file already exists, do nothing
        const file = args[0];
        const absolute_file = fs.absolute(file);

        if (await fs.exists(absolute_file)) {
            return 0;
        }

        // check if the directory exists
        // TODO: should abstractfilesystem have basename and dirname functions? check other programs for similar code!
        const dir = absolute_file.split("/").slice(0, -1).join("/");
        if (!(await fs.dir_exists(dir))) {
            term.writeln(`${PREFABS.error}No such directory: ${dir}${STYLE.reset_all}`);
            return 1;
        }

        // create the file
        await fs.write_file(absolute_file, "");

        return 0;
    }
} as Program;