import type { Program } from "../types";
import { ANSI, NEWLINE } from "../term_ctl";

export default {
    name: "webget",
    description: "Downloads a file from the World Wide Web.",
    usage_suffix: "url filepath [-o] [-n] [-X method] [-H header] [-B body]",
    arg_descriptions: {
        "Arguments:": {
            "url": "The URL to download from.",
            "filepath": "The path to save the file to."
        },
        "Flags:": {
            "System flags:": {
                "-h": "Print this help message.",
                "-o": "Overwrite existing files.",
                "-n": "Do not replace newlines with the current system's newline character, store as a binary (binary mode).",
            },
            "Request flags:": {
                "-X": "Specify a custom HTTP method. (default: GET)",
                "-H": "Add a custom header to the request.",
                "-B": "Specify a custom request body. (only works with POST and PUT methods)"
            }
        }
    },
    // TODO: completion
    main: async (data) => {
        // TODO: replace filename with using piping and send content to stdout
        // TODO: automatically guess binary mode based on file extension or recieved header

        // extract from data to make code less verbose
        const { args, term } = data;

        // extract from ANSI to make code less verbose
        const { PREFABS, STYLE, FG } = ANSI;

        // get filesystem
        const fs = term.get_fs();

        if (args[0] === "-h") {
            term.execute("help webget");
            return 0;
        }

        // check if the user provided a URL
        if (args.length === 0) {
            term.writeln(`${PREFABS.error}A URL is required.${STYLE.reset_all}`);
            return 1;
        }

        // parse url
        const url = args.shift();

        // validate url
        try {
            const proc_url = new URL(url);

            if (proc_url.protocol !== "http:" && proc_url.protocol !== "https:") {
                throw new Error("Invalid protocol");
            }
        } catch (e) {
            term.writeln(`${PREFABS.error}Invalid URL. Expected a valid HTTP or HTTPS protocol URL.${STYLE.reset_all}`);
            return 1;
        }

        let file_path = "";
        let overwrite = false;
        let binary = false;
        let method = "GET";
        const headers: Map<string, string> = new Map();
        let body = null;

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

                    headers.set(split[0], split[1]);
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
                case "-o":
                    overwrite = true;
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

        if (await fs.exists(abs_path) && !overwrite) {
            term.writeln(`${PREFABS.error}File already exists.${STYLE.reset_all}`);
            return 1;
        }

        // if overwriting, run initial check of readonly status
        if (overwrite) {
            if (await fs.is_readonly(abs_path)) {
                term.writeln(`${PREFABS.error}File is readonly.${STYLE.reset_all}`);
                return 1;
            }
        }

        // lock the file, creating it if it does not exist
        if (!(await fs.exists(abs_path))) {
            await fs.write_file(abs_path, "");
        }
        await fs.set_readonly(abs_path, true);

        // fetch the file
        let response: Response;

        term.writeln(`${FG.green}Downloading file...${STYLE.reset_all}`);

        try {
            // convert headers to object
            const headers_obj: Record<string, string> = {};
            headers.forEach((value, key) => {
                headers_obj[key] = value;
            });

            response = await fetch(url, { method, headers: headers_obj, body });
        } catch (e) {
            term.writeln(`${PREFABS.error}Failed to fetch file.${STYLE.reset_all}`);
            term.writeln(`${PREFABS.error}${"message" in e ? e.message : e}${STYLE.reset_all}`);
            console.error(e);

            // reset readonly state
            await fs.set_readonly(abs_path, false);

            //  if this wasn't an overwrite, delete the file that was created
            if (!overwrite) {
                await fs.delete_file(abs_path);
            }

            return 1;
        }

        if (!response.ok) {
            term.writeln(`${PREFABS.error}Request not OK.${STYLE.reset_all}`);

            // get the error message
            const text = await response.text();

            if (text !== "") {
                term.writeln(`${PREFABS.error}${text}${STYLE.reset_all}`);
            }

            // reset readonly state
            await fs.set_readonly(abs_path, false);

            //  if this wasn't an overwrite, delete the file that was created
            if (!overwrite) {
                await fs.delete_file(abs_path);
            }

            return 1;
        }

        if (binary) {
            // write the file as binary
            const buffer = await response.arrayBuffer();

            await fs.write_file(abs_path, new Uint8Array(buffer), true);
        } else {
            // write the file as text
            const text = await response.text();

            await fs.write_file(abs_path, text.replace(/\r?\n/g, NEWLINE), true);
        }

        // reset readonly state (must've be writable or else this wouldn't be reached)
        await fs.set_readonly(abs_path, false);

        term.writeln(`${FG.green}File downloaded successfully.${STYLE.reset_all}`);

        return 0;
    }
} as Program;