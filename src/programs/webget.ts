import type { AsyncProgram } from "../types";
import { ANSI, NEWLINE } from "../term_ctl";

const URL_REGEX = /^https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_\+.~#?&\/=]*)$/gi;

export default {
    name: "webget",
    description: "Downloads a file from the World Wide Web.",
    usage_suffix: "<url> <filepath> [-k] [-n] [-X <method>] [-H <header>] [-B <body>]",
    flags: {
        "-h": "Print this help message.",
        "-k": "Do not overwrite existing files.",
        "-n": "Do not replace newlines with the current system's newline character (binary mode).",
        "-X": "Specify a custom HTTP method. (default: GET)",
        "-H": "Add a custom header to the request.",
        "-B": "Specify a custom request body. (only works with POST and PUT methods)"
    },
    async_main: async (data) => {
        // TODO: replace filename with using piping and send content to stdout

        // extract from data to make code less verbose
        const { args, term } = data;

        // extract from ANSI to make code less verbose
        const { PREFABS, STYLE, FG } = ANSI;

        // get filesystem
        const fs = term.get_fs();

        // check if the user provided a URL
        if (args.length === 0) {
            term.writeln(`${PREFABS.error}A URL is required.${STYLE.reset_all}`);
            return 1;
        }

        if (args[0] === "-h") {
            term.execute("help hex");
            return 0;
        }

        // parse url
        const url = args[0];
        args.shift();

        // validate url
        if (!URL_REGEX.test(url)) {
            term.writeln(`${PREFABS.error}Invalid URL. Expected a valid HTTP or HTTPS protocol URL.${STYLE.reset_all}`);
            return 1;
        }

        // if an arg starts with a double quote, join args until an arg ends with a double quote and remove the double quotes
        for (let i = 0; i < args.length; i++) {
            if (args[i].startsWith('"')) {
                let j = i + 1;

                while (j < args.length && !args[j].endsWith('"')) {
                    j++;
                }

                if (j === args.length) {
                    term.writeln(`${PREFABS.error}Invalid string argument. Expected a string argument to end with a double quote.${STYLE.reset_all}`);
                    return 1;
                }

                args[i] = args[i].slice(1);
                args[j] = args[j].slice(0, -1);

                args.splice(i + 1, j - i);
            }
        }

        let file_path = "";
        let overwrite = true;
        let binary = false;
        let method = "GET";
        const headers: Record<string, string> = {};
        let body = null;

        for (const arg of args) {
            if (arg.startsWith("-X ")) {
                method = arg.slice(3);
                continue;
            }

            if (arg.startsWith("-H ")) {
                const header = arg.slice(3);
                const split = header.split(": ");

                if (split.length !== 2 || split[0].includes(" ")) {
                    term.writeln(`${PREFABS.error}Invalid header. Expected a header in the format "Header-Name: Header-Value".${STYLE.reset_all}`);
                    return 1;
                }

                headers[split[0]] = split[1];
                continue;
            }

            if (arg.startsWith("-B ")) {
                body = arg.slice(3);
                continue;
            }

            switch (arg) {
                case "-k":
                    overwrite = false;
                    break;
                case "-n":
                    binary = true;
                    break;
                default:
                    if (file_path === "") {
                        file_path = arg;
                    } else {
                        term.writeln(`${PREFABS.error}Unexpected string argument.${STYLE.reset_all}`);
                        return 1;
                    }
            }
        }

        // check if the user provided a filename and i it is not a directory
        if (file_path === "") {
            term.writeln(`${PREFABS.error}A file path is required.${STYLE.reset_all}`);
            return 1;
        }

        if (file_path.endsWith("/")) {
            term.writeln(`${PREFABS.error}Cannot write to a directory.${STYLE.reset_all}`);
            return 1;
        }

        // check if the file already exists
        const abs_path = fs.absolute(file_path);

        if (fs.exists(abs_path) && !overwrite) {
            term.writeln(`${PREFABS.error}File already exists.${STYLE.reset_all}`);
            return 1;
        }

        // fetch the file
        let response: Response;

        term.writeln(`${FG.green}Downloading file...${STYLE.reset_all}`);

        try {
            response = await fetch(url, { method, headers, body });
        } catch (e) {
            term.writeln(`${PREFABS.error}Failed to fetch file.${STYLE.reset_all}`);
            term.writeln(`${PREFABS.error}${"message" in e ? e.message : e}${STYLE.reset_all}`);
            console.error(e);
            return 1;
        }

        if (!response.ok) {
            term.writeln(`${PREFABS.error}Request not OK.${STYLE.reset_all}`);

            // get the error message
            const text = await response.text();

            if (text !== "") {
                term.writeln(`${PREFABS.error}${text}${STYLE.reset_all}`);
            }

            return 1;
        }

        // get the file contents
        const text = await response.text();

        // write the file
        fs.write_file(abs_path, binary ? text : text.replace(/\r?\n/g, NEWLINE));

        term.writeln(`${FG.green}File downloaded successfully.${STYLE.reset_all}`);

        return 0;
    }
} as AsyncProgram;