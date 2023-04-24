import type { SyncProgram } from "../types";
import { ANSI } from "../term_ctl";

// TODO: when edit is done, add a flag to edit the file in the editor

export default {
    name: "hex",
    description: "Reads a file as hexadecimal.",
    usage_suffix: "[-h] <path> [-i]",
    arg_descriptions: {
        "Arguments:": {
            "path": "The path to the file to read."
        },
        "Flags:": {
            "-h": "Print this help message.",
            "-i": "Print indexes."
        }
    },
    main: (data) => {
        // extract from data to make code less verbose
        const { args, term } = data;

        // extract from ANSI to make code less verbose
        const { PREFABS, STYLE, FG } = ANSI;

        // get filesystem
        const fs = term.get_fs();

        // check if the user provided a filepath
        if (args.length === 0) {
            term.writeln(`${PREFABS.error}A file path is required.${STYLE.reset_all}`);
            return 1;
        }

        if (args[0] === "-h") {
            term.execute("help hex");
            return 0;
        }

        // get filepath
        const filepath = args[0];

        // get absolute path
        const abs_path = fs.absolute(filepath);

        // check if the file exists and is a file
        if (abs_path.endsWith("/")) {
            term.writeln(`${PREFABS.error}Cannot read a directory: ${abs_path}${STYLE.reset_all}`);
            return 1;
        }

        if (!fs.exists(abs_path)) {
            term.writeln(`${PREFABS.error}File not found: ${abs_path}${STYLE.reset_all}`);
            return 1;
        }

        // get file
        const content = fs.read_file(abs_path, true) as Uint8Array;

        // convert uint8array to hex string
        const hex = Array.from(content).map((byte) => byte.toString(16).toUpperCase().padStart(2, "0"));

        // if printing indexes, print the header
        if (args[1] === "-i") {
            term.writeln(`         ${FG.blue}00 01 02 03 04 05 06 07 08 09 0A 0B 0C 0D 0E 0F${STYLE.reset_all}`);
        }

        // print hex bytes to terminal up to 16 bytes per line, padding the end with .. in place of the missing bytes
        // if printing indexes, print the index of the first byte on the line, in hexadecimal up to 8 bytes
        for (let i = 0; i < hex.length; i += 16) {
            const line = hex.slice(i, i + 16);

            if (args[1] === "-i") {
                const idx = i <= 0xffffffff ? i.toString(16).toUpperCase() : "........";


                term.write(`${FG.blue}${idx.padStart(8, "0")}${STYLE.reset_all} `);
            }

            const padded = line.concat(Array(16 - line.length).fill(`${FG.gray}..${STYLE.reset_all}`));
            term.writeln(padded.join(" "));
        }

        return 0;
    }
} as SyncProgram;