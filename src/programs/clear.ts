import { ANSI } from "../term_ctl";
import type { SyncProgram } from "../types";

export default {
    name: "clear",
    description: "Clears the screen, and/or the scrollback.",
    usage_suffix: "[-h | -s | -so]",
    flags: {
        "-h": "Show this help message.",
        "-s": "Clear the screen and the scrollback.",
        "-so": "Only clear the scrollback."
    },
    main: (data) => {
        // extract from data to make code less verbose
        const { args, term } = data;

        // extract from ANSI to make code less verbose
        const { FG, STYLE } = ANSI;

        switch (args[0]) {
            case undefined:
                term.reset();
                break;
            case "-s":
                term.reset();
                term.clear_history();
                break;
            case "-so":
                term.clear_history();
                term.writeln(`${STYLE.bold + FG.gray}Scrollback cleared.${STYLE.reset_all}`);
                break;
            case "-h":
                term.execute("help clear");
                return 0;
            default:
                term.writeln(`${FG.red}Invalid argument: ${args[0]}${STYLE.reset_all}`);
                return 1;
        }

        return 0;
    }
} as SyncProgram;