import type { Program } from "../types";

export default {
    name: "repo",
    description: "Opens the GitHub repository for OllieOS.",
    usage_suffix: "",
    arg_descriptions: {},
    compat: "3.0.0",
    gui: {
        display_name: "GitHub Repo",
    },
    completion: async () => [],
    main: async (data) => {
        // extract from data to make code less verbose
        const { term, kernel } = data;

        const platform = kernel.get_platform();
        if (!platform) {
            term.writeln("Opening URLs isn't supported on this platform. The repo is at https://github.com/obfuscatedgenerated/obfuscatedgenerated.github.io");
            return 1;
        }

        await platform.open_url("https://github.com/obfuscatedgenerated/obfuscatedgenerated.github.io");

        term.writeln("Opened repo in a new tab.");

        return 0;
    }
} as Program;
