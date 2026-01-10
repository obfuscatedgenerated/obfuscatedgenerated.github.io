import type { Program } from "../types";

export default {
    name: "alias",
    description: "Define or display aliases. (Use .ollierc to persist aliases)",
    usage_suffix: "[name[=value] ...]",
    arg_descriptions: {
        name: "The name of the alias to define or display. If no arguments are given, all aliases are displayed. Multiple alias arguments can be provided.",
        "name=value": "Defines an alias with the given name and value. End the value with a space to allow chaining."
    },
    compat: "2.0.0",
    completion: async () => [],
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
            // display all aliases
            const aliases = shell.memory.list_aliases();
            for (const [name, value] of aliases.entries()) {
                term.writeln(`alias ${name}='${value}'`);
            }

            return 0;
        }

        for (const arg of data.args) {
            if (arg.includes("=")) {
                // define alias
                const [name, ...value_parts] = arg.split("=");
                const value = value_parts.join("=");

                // remove surrounding quotes if present
                let final_value = value;
                if ((final_value.startsWith("'") && final_value.endsWith("'")) ||
                    (final_value.startsWith("\"") && final_value.endsWith("\""))) {
                    final_value = final_value.slice(1, -1);
                }

                shell.memory.set_alias(name, final_value);
            } else {
                // display alias
                const value = shell.memory.get_alias(arg);
                if (value) {
                    term.writeln(`alias ${arg}='${value}'`);
                } else {
                    term.writeln(`${PREFABS.error}alias: ${arg}: not found${STYLE.reset_all}`);
                }
            }
        }

        return 0;
    }
} as Program;