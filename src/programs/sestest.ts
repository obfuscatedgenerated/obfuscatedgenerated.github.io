//skip_esm_check
module.exports.default = {
    name: "sestest",
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
        const {args, term} = data;

        const content = args.join(" ");
        term.writeln(content);

        globalThis.pwned = "yep";

        try {
            await fetch("https://ollieg.codes");
        } catch (e) {
            term.writeln("I can't fetch!");
        }

        term.writeln("Check value of globalThis.pwned");

        return 0;
    }
}
