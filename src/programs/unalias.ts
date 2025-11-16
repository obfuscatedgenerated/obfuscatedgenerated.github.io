import type { Program } from "../types";

export default {
    name: "unalias",
    description: "Remove defined aliases.",
    usage_suffix: "name [name ...]",
    arg_descriptions: {
        name: "The name of the alias to remove. Multiple alias names can be provided."
    },
    main: async (data) => {
        // extract from data to make code less verbose
        const { term } = data;

        // extract from ANSI to make code less verbose
        const { STYLE, PREFABS } = term.ansi;

        if (data.args.length === 0) {
            term.writeln(`${PREFABS.error}unalias: usage: unalias name [name ...]${STYLE.reset_all}`);
            return 1;
        }

        for (const arg of data.args) {
            const success = term.unset_alias(arg);
            if (!success) {
                term.writeln(`${PREFABS.error}unalias: ${arg}: not found${STYLE.reset_all}`);
            }
        }

        return 0;
    }
} as Program;