import {ANSI} from "../../term_ctl";
import type {Program} from "../../types";

import {info_subcommand} from "./info";
import {list_subcommand} from "./list";
import {show_subcommand} from "./show";
import {hide_subcommand} from "./hide";
import {close_subcommand} from "./close";
import {center_subcommand} from "./center";

// extract from ANSI to make code less verbose
const {STYLE, PREFABS} = ANSI;

// TODO: maximise restore command, respecting maximisable property but providing a -f force flag

export default {
    name: "window",
    description: "Interact with program windows.",
    usage_suffix: "[-h] [subcommand] [arguments]",
    arg_descriptions: {
        "Subcommands:": {
            "info": `Displays information about the window manager and open windows: ${PREFABS.program_name}window${STYLE.reset_all + STYLE.italic} info${STYLE.reset_all}`,
            "list": `Lists all open windows: ${PREFABS.program_name}window${STYLE.reset_all + STYLE.italic} list [-vi]${STYLE.reset_all}`,
            "show": `Shows a window by its ID: ${PREFABS.program_name}window${STYLE.reset_all + STYLE.italic} show <window_id>${STYLE.reset_all}`,
            "hide": `Hides a window by its ID: ${PREFABS.program_name}window${STYLE.reset_all + STYLE.italic} hide <window_id>${STYLE.reset_all}`,
            "close": `Closes a window by its ID: ${PREFABS.program_name}window${STYLE.reset_all + STYLE.italic} close <window_id>${STYLE.reset_all}. Note that this does not terminate the process that opened the window.`,
            "center": `Centers a window by its ID: ${PREFABS.program_name}window${STYLE.reset_all + STYLE.italic} show <window_id>${STYLE.reset_all}`,
        },
        "Arguments:": {
            "-h": "Displays this help message.",
            "For list:": {
                "-v": "List only visible windows.",
                "-i": "List only invisible (minimised/hidden) windows.",
            },
            "For show, hide, close, and center:": {
                "<window_id>": "The ID of the window.",
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

        if (!term.get_window_manager()) {
            term.writeln(`${PREFABS.error}No window manager found.${STYLE.reset_all}`);
            return 1;
        }

        switch (args[0]) {
            case "info":
                return await info_subcommand(data);
            case "list":
                return await list_subcommand(data);
            case "show":
                return await show_subcommand(data);
            case "hide":
                return await hide_subcommand(data);
            case "close":
                return await close_subcommand(data);
            case "center":
                return await center_subcommand(data);
            default:
                term.writeln(`${PREFABS.error}Invalid subcommand.`);
                term.writeln(`Try 'window -h' for more information.${STYLE.reset_all}`);
                return 1;
        }
    }
} as Program;
