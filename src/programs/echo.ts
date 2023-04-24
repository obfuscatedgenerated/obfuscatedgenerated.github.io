import type { SyncProgram } from "../types";

export default {
    name: "echo",
    description: "Echos a string to the terminal.",
    usage_suffix: "<string>",
    arg_descriptions: {
        "Arguments:": {
            "string": "The string to echo."
        }
    },
    main: (data) => {
        // extract from data to make code less verbose
        const { args, term } = data;

        const content = args.join(" ");
        term.writeln(content);

        return 0;
    }
} as SyncProgram;