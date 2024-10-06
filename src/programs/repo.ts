import type { Program } from "../types";

export default {
    name: "repo",
    description: "Opens the GitHub repository for OllieOS.",
    usage_suffix: "",
    arg_descriptions: {
    },
    main: async (data) => {
        // extract from data to make code less verbose
        const { term } = data;

        window.open("https://github.com/obfuscatedgenerated/obfuscatedgenerated.github.io", "_blank", "");

        term.writeln("Opened repo in a new tab.");

        return 0;
    }
} as Program;
