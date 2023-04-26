import type { SyncProgram } from "../types";
import { ANSI } from "../term_ctl";
import { NonRecursiveDirectoryError, PathNotFoundError } from "../filesystem";

export default {
    name: "rm",
    description: "Deletes a file or directory.",
    usage_suffix: "[-rf | -f] <path>",
    arg_descriptions: {
        "Arguments:": {
            "path": "The path to the file or directory to delete."
        },
        "Flags:": {
            "-rf": "Recursively and forcibly delete directories (ignoring if directory has content, treated as -f if a file is passed).",
            "-f": "Forcibly delete files (ignoring readonly state, NOT treated as -rf if a directory is passed)."
        }
    },
    main: (data) => {
        // extract from data to make code less verbose
        const { args, term } = data;

        // extract from ANSI to make code less verbose
        const { PREFABS, STYLE } = ANSI;

        // get fs
        const fs = term.get_fs();

        // determine if -rf OR -f was passed
        let rimraf = false;
        let force = false;

        if (args[0] === "-rf") {
            rimraf = true;
            force = true;
            args.shift();
        } else if (args[0] === "-f") {
            force = true;
            args.shift();
        }

        // check if there is only one argument after parsing flag
        if (args.length !== 1) {
            term.writeln(`${PREFABS.error}Invalid arguments.${STYLE.reset_all}`);
            return 1;
        }

        // get path
        const path = args[0];
        const abs_path = fs.absolute(path);

        // check if path exists
        if (!fs.exists(abs_path)) {
            term.writeln(`${PREFABS.error}Path does not exist.${STYLE.reset_all}`);
            return 1;
        }

        // check if path is a directory
        const is_dir = fs.dir_exists(abs_path);

        // perform deletion
        if (is_dir) {
            try {
                fs.delete_dir(abs_path, rimraf);
            } catch (e) {
                if (e instanceof NonRecursiveDirectoryError) {
                    term.writeln(`${PREFABS.error}Directory is not empty. Refusing to delete without -rf flag.${STYLE.reset_all}`);
                    return 1;
                }

                if (e instanceof PathNotFoundError) {
                    term.writeln(`${PREFABS.error}Path no longer exists.${STYLE.reset_all}`);
                    return 1;
                }

                throw e;
            }
        } else {
            // if not forcing, check if file is readonly
            if (!force && fs.is_readonly(abs_path)) {
                term.writeln(`${PREFABS.error}File is readonly. Refusing to delete without -f flag.${STYLE.reset_all}`);
                return 1;
            }

            fs.delete_file(abs_path);
        }

        return 0;
    }
} as SyncProgram;