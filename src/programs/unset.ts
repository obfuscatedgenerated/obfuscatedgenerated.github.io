import type { Program } from "../types";

export default {
    name: "unset",
    description: "Unsets a list of variables.",
    usage_suffix: "[names...]",
    arg_descriptions: {
        "Arguments:": {
            "names": "The names of each variable to unset."
        }
    },
    compat: "2.0.0",
    completion: async (data) => {
        if (!data.shell) {
            return [];
        }

        const var_names = [...data.shell.memory.list_variables().keys()];
        // TODO: check type to see why helper_completion_options wont work here
        return var_names.filter(name => name.startsWith(data.current_partial));
    },
    main: async (data) => {
        // extract from data to make code less verbose
        const { shell, args, term } = data;

        if (!shell) {
            term.writeln("No shell available");
            return 1;
        }

        // TODO: move to shell builtin, not actual program

        // for each variable name, unset it, with no regards to whether it exists or not
        for (const name of args) {
            shell.memory.unset_variable(name);
        }
        
        return 0;
    }
} as Program;