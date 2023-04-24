import type { AsyncProgram } from "../types";
import { ANSI, NEWLINE, URL_REGEX } from "../term_ctl";

export default {
    name: "webget",
    description: "Downloads a file from the World Wide Web.",
    usage_suffix: "<url> <filepath> [-k] [-n] [-X <method>] [-H <header>] [-B <body>]",
    arg_descriptions: {
        "Arguments:": {
            "url": "The URL to download from.",
            "filepath": "The path to save the file to."
        },
        "System flags:": {
            "-h": "Print this help message.",
            "-k": "Do not overwrite existing files.",
            "-n": "Do not replace newlines with the current system's newline character (binary mode).",
            "-a": "Save the file as base64 encoded data (binary mode)."
        },
        "Request flags:": {
            "-X": "Specify a custom HTTP method. (default: GET)",
            "-H": "Add a custom header to the request.",
            "-B": "Specify a custom request body. (only works with POST and PUT methods)"
        }
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
        const url = args.shift();

        // validate url
        if (!URL_REGEX.test(url)) {
            term.writeln(`${PREFABS.error}Invalid URL. Expected a valid HTTP or HTTPS protocol URL.${STYLE.reset_all}`);
            return 1;
        }

        let file_path = "";
        let overwrite = true;
        let binary = false;
        let method = "GET";
        const headers: Record<string, string> = {};
        let body = null;
        let b64 = false;

        for (let arg_idx = 0; arg_idx < args.length; arg_idx++) {
            const arg = args[arg_idx];

            switch (arg) {
                case "-X": {
                    // consume next argument
                    const next_arg = args[arg_idx + 1];

                    if (next_arg === undefined) {
                        term.writeln(`${PREFABS.error}Expected a method after -X.${STYLE.reset_all}`);
                        return 1;
                    }

                    method = next_arg;
                    args.splice(arg_idx + 1, 1);
                }
                    break;
                case "-H": {
                    // consume next argument
                    const header = args[arg_idx + 1];

                    if (header === undefined) {
                        term.writeln(`${PREFABS.error}Expected a header after -H.${STYLE.reset_all}`);
                        return 1;
                    }

                    const split = header.split(": ");

                    if (split.length !== 2 || split[0].includes(" ")) {
                        term.writeln(`${PREFABS.error}Invalid header. Expected a header in the format "Header-Name: Header-Value".${STYLE.reset_all}`);
                        return 1;
                    }

                    headers[split[0]] = split[1];
                    args.splice(arg_idx + 1, 1);
                }
                    break;
                case "-B": {
                    // consume next argument
                    const next_arg = args[arg_idx + 1];

                    if (next_arg === undefined) {
                        term.writeln(`${PREFABS.error}Expected a body after -B.${STYLE.reset_all}`);
                        return 1;
                    }

                    body = next_arg;
                    args.splice(arg_idx + 1, 1);
                }
                    break;
                case "-k":
                    overwrite = false;
                    break;
                case "-n":
                    binary = true;
                    break;
                case "-a":
                    b64 = true;
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
        fs.write_file(abs_path, binary ? text : text.replace(/\r?\n/g, NEWLINE), b64);

        term.writeln(`${FG.green}File downloaded successfully.${STYLE.reset_all}`);

        return 0;
    }
} as AsyncProgram;