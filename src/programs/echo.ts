import type { Program } from "../types";

export default {
    name: "echo",
    description: "Echos a string to the terminal.",
    usage_suffix: "string",
    arg_descriptions: {
        "Arguments:": {
            "string": "The string to echo."
        }
    },
    compat: "2.0.0",
    completion: async () => [],
    main: async (data) => {
        // extract from data to make code less verbose
        const { args, term } = data;

        const content = args.join(" ");
        term.writeln(content);

        return 0;
    }
} as Program;