import type { AsyncProgram } from "../types";
import { ANSI, NEWLINE } from "../term_ctl";

import { default as img2ascii } from "imgToAscii";


// TODO: DRY with mefetch
const convert_to_ascii = async (url: string, size: number): Promise<string> => {
    const img = new img2ascii(url, size, Math.round(size / 2));
    await img.loadImage;

    // convert newlines in string
    const ascii = img.stringANSI8BitColor.replace(/\n/g, NEWLINE);
    return ascii;
}

export default {
    name: "ascmagine",
    description: "Views images as ANSI/ASCII art.",
    usage_suffix: "<path> [-w <width>] [-u]",
    arg_descriptions: {
        "Arguments:": {
            "path": "The path to the image to view."
        },
        "Options:": {
            "-w": "The width of the image in COLUMNS. Defaults to the width of the terminal.",
            "-u": "Path is an web URL instead of a local filesystem path."
        }
    },
    async_main: async (data) => {
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
        const width_arg = args.includes("-w") ? parseInt(args[args.indexOf("-w") + 1]) : undefined;
        const is_web_url = args.includes("-u");

        let url: string;
        if (!is_web_url) {
            // process the path
            url = fs.absolute(path);
            if (!fs.exists(url)) {
                term.write(`${PREFABS.error}No such file or directory: ${path}${STYLE.reset_all}`);
                return 1;
            }

            // convert to base64 data URL
            const content = fs.read_file(url, true) as Uint8Array;
            url = URL.createObjectURL(new Blob([content]));

        } else {
            // check path is a valid URL
            try {
                new URL(path);
                url = path;
            } catch (e) {
                term.write(`${PREFABS.error}Invalid URL: ${path}${STYLE.reset_all}`);
                return 1;
            }
        }

        // get the image
        const img = await convert_to_ascii(url, width_arg || term.cols - 2);

        // write the image
        term.write(img);

        return 0;
    }
} as AsyncProgram;