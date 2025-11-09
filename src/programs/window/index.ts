import {ANSI} from "../../term_ctl";
import type {Program} from "../../types";

import {list_subcommand} from "./list";
import {show_subcommand} from "./show";
import {hide_subcommand} from "./hide";
import {close_subcommand} from "./close";

// extract from ANSI to make code less verbose
const {STYLE, PREFABS} = ANSI;

export default {
    name: "window",
    description: "Interact with program windows.",
    usage_suffix: "[-h] [subcommand] [arguments]",
    arg_descriptions: {
        "Subcommands:": {
            "list": `Lists all open windows: ${PREFABS.program_name}window${STYLE.reset_all + STYLE.italic} list [-vi]${STYLE.reset_all}`,
            "show": `Shows a window by its ID: ${PREFABS.program_name}window${STYLE.reset_all + STYLE.italic} show <window_id>${STYLE.reset_all}`,
            "hide": `Hides a window by its ID: ${PREFABS.program_name}window${STYLE.reset_all + STYLE.italic} hide <window_id>${STYLE.reset_all}`,
            "close": `Closes a window by its ID: ${PREFABS.program_name}window${STYLE.reset_all + STYLE.italic} close <window_id>${STYLE.reset_all}. Note that this does not terminate the process that opened the window.`,
        },
        "Arguments:": {
            "-h": "Displays this help message.",
            "For list:": {
                "-v": "List only visible windows.",
                "-i": "List only invisible (minimised/hidden) windows.",
            },
            "For show, hide, and close:": {
                "<window_id>": "The ID of the window to show, hide, or close.",
            }
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
            case "show":
                return await show_subcommand(data);
            case "hide":
                return await hide_subcommand(data);
            case "close":
                return await close_subcommand(data);
            default:
                term.writeln(`${PREFABS.error}Invalid subcommand.`);
                term.writeln(`Try 'window -h' for more information.${STYLE.reset_all}`);
                return 1;
        }
    }
} as Program;
