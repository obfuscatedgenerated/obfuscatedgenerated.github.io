import { ANSI } from "../term_ctl";
import type { Program } from "../types";
import {helper_completion_options} from "./core/ash/tab_completion";

export default {
    name: "clear",
    description: "Clears the screen, and/or the scrollback.",
    usage_suffix: "[-h | -s | -so]",
    arg_descriptions: {
        "Flags:": {
            "-h": "Show this help message.",
            "-s": "Clear the screen and the scrollback.",
            "-so": "Only clear the scrollback."
        }
    },
    completion: helper_completion_options(["-h", "-s", "-so"]),
    main: async (data) => {
        // extract from data to make code less verbose
        const { kernel, shell, args, term } = data;

        // extract from ANSI to make code less verbose
        const { FG, STYLE, PREFABS } = ANSI;

        switch (args[0]) {
            case undefined:
                term.reset();
                break;
            case "-s":
                term.reset();

                if (shell) {
                    shell.memory.clear_history();
                } else {
                    term.writeln(`${PREFABS.error}Cannot clear scrollback: no shell available.${STYLE.reset_all}`);
                    return 1;
                }

                break;
            case "-so":
                if (!shell) {
                    term.writeln(`${PREFABS.error}Cannot clear scrollback: no shell available.${STYLE.reset_all}`);
                    return 1;
                }

                shell.memory.clear_history();
                term.writeln(`${STYLE.bold + FG.gray}Scrollback cleared.${STYLE.reset_all}`);
                break;
            case "-h":
                return await kernel.spawn("help", ["clear"], shell).completion;
            default:
                term.writeln(`${FG.red}Invalid argument: ${args[0]}${STYLE.reset_all}`);
                return 1;
        }

        return 0;
    }
} as Program;