import type { SyncProgram } from "../types";
import { ANSI } from "../term_ctl";

import { image2sixel } from "sixel";


// TODO: implement indexeddb fs to allow saving binary files properly

export default {
    name: "imagine",
    description: "Views images natively in the terminal.",
    usage_suffix: "<path> [-w <width>] [-h <height>] [-u]",
    arg_descriptions: {
        "Arguments:": {
            "path": "The path to the image to view."
        },
        "Options:": {
            "-w": "The width of the image in columns. Defaults to the terminal width.",
            "-h": "The height of the image in rows. Defaults to the terminal height.",
            "-u": "Path is an web URL instead of a local filesystem path."
        }
    },
    main: (data) => {
        // extract from data to make code less verbose
        const { args, term } = data;

        // extract from ANSI to make code less verbose
        const { STYLE, PREFABS } = ANSI;

        // get fs
        const fs = term.get_fs();

        // get the path to the image
        const path = args[0];

        if (!path) {
            term.write(`${PREFABS.error}No path specified.${STYLE.reset_all}`);
            return 1;
        }

        // get the width of the image specified or the terminal width
        const width = args.includes("-w") ? parseInt(args[args.indexOf("-w") + 1]) : term.cols;
        const height = args.includes("-h") ? parseInt(args[args.indexOf("-h") + 1]) : term.rows;
        const is_web_url = args.includes("-u");

        let abs_path: string;
        if (!is_web_url) {
            // process the path
            abs_path = fs.absolute(path);
            if (!fs.exists(abs_path)) {
                term.write(`${PREFABS.error}No such file or directory: ${path}${STYLE.reset_all}`);
                return 1;
            }

        } else {
            // check path is a valid URL
            try {
                new URL(path);
                abs_path = path;
            } catch (e) {
                term.write(`${PREFABS.error}Invalid URL: ${path}${STYLE.reset_all}`);
                return 1;
            }
        }

        // check path is a .png or .jpg
        const ext = abs_path.slice(-4);
        if (ext !== ".png" && ext !== ".jpg") {
            term.write(`${PREFABS.error}File is not a .png or .jpg: ${path}${STYLE.reset_all}`);
            return 1;
        }

        const mime = ext === ".png" ? "image/png" : "image/jpeg";

        // get the image data
        const content = fs.read_file(abs_path, true) as Uint8Array;
        console.log(content);

        // scale the height to fit the width
        const scale = width / height;
        const new_height = Math.floor(width / scale);

        // convert the Uint8Array to a sixel image
        const sixel = image2sixel(content, width, new_height);

        // write the sixel image to the terminal
        term.write(sixel);

        return 0;
    }
} as SyncProgram;