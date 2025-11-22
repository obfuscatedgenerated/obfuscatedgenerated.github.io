import type { Program } from "../types";
import { ANSI } from "../term_ctl";

export default {
    name: "cat",
    description: "Reads files and prints their contents to the terminal.",
    usage_suffix: "[filepaths...]",
    arg_descriptions: {
        "Arguments:": {
            "filepaths": "The paths of the files to read."
        }
    },
    main: async (data) => {
        // extract from data to make code less verbose
        const { args, term } = data;

        // extract from ANSI to make code less verbose
        const { PREFABS, STYLE } = ANSI;

        // get filesystem
        const fs = term.get_fs();

        // get each file's content and print it to the terminal
        for (const filepath of args) {
            const abs_path = fs.absolute(filepath);

            // check if the file exists and is a file
            if (await fs.dir_exists(abs_path)) {
                term.writeln(`${PREFABS.error}Cannot read a directory: ${abs_path}${STYLE.reset_all}`);
                return 1;
            }

            if (!(await fs.exists(abs_path))) {
                term.writeln(`${PREFABS.error}File not found: ${abs_path}${STYLE.reset_all}`);
                return 1;
            }

            // get file
            const content = await fs.read_file(abs_path);

            // print file content to terminal
            term.writeln(content);
        }

        return 0;
    }
} as Program;