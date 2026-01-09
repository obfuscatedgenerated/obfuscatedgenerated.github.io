import type { Program } from "../types";
import {helper_completion_options} from "./core/ash/tab_completion";

export default {
    name: "unalias",
    description: "Remove defined aliases.",
    usage_suffix: "name [name ...]",
    arg_descriptions: {
        name: "The name of the alias to remove. Multiple alias names can be provided."
    },
    completion: async (data) => {
        if (!data.shell) {
            return [];
        }

        const alias_names = [...data.shell.memory.list_aliases().keys()];
        // TODO: check type to see why helper_completion_options wont work here
        return alias_names.filter(name => name.startsWith(data.current_partial));
    },
    main: async (data) => {
        // extract from data to make code less verbose
        const { shell, term } = data;

        if (!shell) {
            term.writeln("No shell available");
            return 1;
        }

        // TODO: move to shell builtin, not actual program

        // extract from ANSI to make code less verbose
        const { STYLE, PREFABS } = term.ansi;

        if (data.args.length === 0) {
            term.writeln(`${PREFABS.error}unalias: usage: unalias name [name ...]${STYLE.reset_all}`);
            return 1;
        }

        for (const arg of data.args) {
            const success = shell.memory.unset_alias(arg);
            if (!success) {
                term.writeln(`${PREFABS.error}unalias: ${arg}: not found${STYLE.reset_all}`);
            }
        }

        return 0;
    }
} as Program;