import type { SyncProgram } from "../types";

export default {
    name: "rss",
    description: "Reads from an RSS feed.",
    usage_suffix: "[-h] [url]",
    arg_descriptions: {
        "Arguments:": {
            "url": "The URL to the XML feed. Defaults to https://blog.ollieg.codes/rss/feed.xml (my blog)."
        },
        "Flags:": {
            "-h": "Print this help message."
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