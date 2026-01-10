import type { Program } from "../types";
import {ANSI} from "../term_ctl";

export default {
    name: "mkdir",
    description: "Creates a directory.",
    usage_suffix: "[-p] directory",
    arg_descriptions: {
        "Flags:": {
            "-p": "Create parent directories (recursive) if they don't exist."
        },
        "Arguments:": {
            "directory": "The directory to create."
        }
    },
    compat: "2.0.0",
    completion: async () => [],
    main: async (data) => {
        // extract from data to make code less verbose
        const { kernel, args, term } = data;

        // extract from ANSI to make code less verbose
        const { PREFABS, STYLE } = ANSI;

        // get fs
        const fs = kernel.get_fs();


        // check if -p flag was passed
        let recursive = false;
        if (args[0] === "-p") {
            recursive = true;
            args.shift();
        }

        // check if there is only one argument after parsing flag
        if (args.length !== 1) {
            term.writeln(`${PREFABS.error}Invalid arguments.${STYLE.reset_all}`);
            return 1;
        }

        // get directory
        const dir = args[0];
        const abs_dir = fs.absolute(dir);

        // check if directory already exists
        if (await fs.dir_exists(abs_dir)) {
            return 0;
        }

        // create directory
        // make_dir is recursive by default, so just check the directories exist already if NOT recursive
        if (recursive) {
            await fs.make_dir(abs_dir);
        } else {
            // check if the directory exists
            const parent = abs_dir.split("/").slice(0, -1).join("/");
            if (!(await fs.dir_exists(parent))) {
                term.writeln(`${PREFABS.error}No such directory: ${parent}${STYLE.reset_all}`);
                return 1;
            }

            await fs.make_dir(abs_dir);
        }

        return 0;
    }
} as Program;
