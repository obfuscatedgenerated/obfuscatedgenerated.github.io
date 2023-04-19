import type { SyncProgram } from "../types";

export default {
    name: "unset",
    description: "Unset a variable.",
    usage_suffix: "<variable>",
    flags: {},
    main: (data) => {
        // extract from data to make code less verbose
        const { args, term } = data;

        // if there are no arguments, silently return
        if (args.length === 0) {
            return 0;
        }

        // get the variable name
        const variable = args[0];

        // delete the variable
        term.unset_variable(variable);
        
        return 0;
    }
} as SyncProgram;