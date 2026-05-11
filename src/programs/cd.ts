import { ANSI } from "../kernel/term_ctl";
import type { Program } from "../types";

export default {
    name: "cd",
    description: "Change directory.",
    usage_suffix: "[path]",
    arg_descriptions: {
        path: "Path to directory to change to. If no path is given, change to home directory."
    },
    compat: "2.0.0",
    main: async (data) => {
        // extract from data to make code less verbose
        const { term } = data;

        term.writeln(`${ANSI.PREFABS.error}cd should be handled by the shell instead! This is a stand-in to list on help.${ANSI.STYLE.reset_all}`);
        return 1;
    }
} as Program;