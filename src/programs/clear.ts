import type { Program } from "../types";

export default {
    name: "clear",
    description: "Clears the screen, and/or the history/scrollback.",
    usage_suffix: " [-h | -ho]",
    flags: {
        "-h": "Additionally clear the history/scrollback.",
        "-ho": "Only clear the history/scrollback."
    },
    main: (data) => {
        // extract from data to make code less verbose
        const { ANSI, args, term } = data;

        // extract from ANSI to make code less verbose
        const { FG, STYLE } = ANSI;

        switch (args[0]) {
            case undefined:
                setTimeout(() => {
                    term.clear();
                }, 1); // delay needed to clear the command's line
                break;
            case "-h":
                setTimeout(() => {
                    term.clear();
                }, 1); // doesn't clear the input line without this

                term.clear_history();
                break;
            case "-ho":
                term.clear_history();
                term.writeln("History cleared.");
                break;
            default:
                term.writeln(`${FG.red}Invalid argument: ${args[0]}${STYLE.reset_all}`);
                return 1;
        }

        return 0;
    }
} as Program;