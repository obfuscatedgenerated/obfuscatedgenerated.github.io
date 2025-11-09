import {ANSI} from "../../term_ctl";
import type {Program} from "../../types";

import {list_subcommand} from "./list";

// extract from ANSI to make code less verbose
const {STYLE, PREFABS} = ANSI;

export default {
    name: "window",
    description: "Interact with program windows.",
    usage_suffix: "[-h] [subcommand] [arguments]",
    arg_descriptions: {
        "Subcommands:": {
            "list": `Lists all open windows: ${PREFABS.program_name}window${STYLE.reset_all + STYLE.italic} list [-vi]${STYLE.reset_all}`,
        },
        "Arguments:": {
            "-h": "Displays this help message.",
            "For list:": {
                "-v": "List only visible windows.",
                "-i": "List only invisible (minimised/hidden) windows.",
            },
        }
    },
    main: async (data) => {
        // extract from data to make code less verbose
        const {args, term} = data;

        if (args.length === 0) {
            term.writeln(`${PREFABS.error}Missing subcommand.`)
            term.writeln(`Try 'window -h' for more information.${STYLE.reset_all}`);
            return 1;
        }

        if (args.includes("-h")) {
            term.execute("help window");
            return 0;
        }

        switch (args[0]) {
            case "list":
                return await list_subcommand(data);
            default:
                term.writeln(`${PREFABS.error}Invalid subcommand.`);
                term.writeln(`Try 'window -h' for more information.${STYLE.reset_all}`);
                return 1;
        }
    }
} as Program;
