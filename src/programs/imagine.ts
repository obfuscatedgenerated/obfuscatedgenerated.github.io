import type { AsyncProgram } from "../types";
import { NEWLINE, ANSI } from "../term_ctl";

import { default as img2ascii } from "imgToAscii";


// TODO: extract to module to DRY
const convert_to_ascii = async (url: string, size: number): Promise<string> => {
    const img = new img2ascii(url, size, Math.round(size / 2));
    await img.loadImage;

    // convert newlines in string
    const ascii = img.stringANSI8BitColor.replace(/\n/g, NEWLINE);
    return ascii;
}

const convert_to_b64_url =  async (data: string, mime_type: string): Promise<string> => {
    const b64 = Buffer.from(data).toString("base64");
    const url = `data:${mime_type};base64,${b64}`; // nice sanitation ;(
    return url;
}

export default {
    name: "imagine",
    description: "View images as ASCII art.",
    usage_suffix: "<path>",
    arg_descriptions: {
        "Arguments:": {
            "path": "The path to the image."
        }
    },
    async_main: async (data) => {
        // extract from data to make code less verbose
        const { args, term } = data;

        // extract from ANSI to make code less verbose
        const { STYLE, PREFABS } = ANSI;

        // get fs
        const fs = term.get_fs();

        // check if path is specified
        const path = args[0];
        if (!path) {
            term.writeln(`${PREFABS.error}No path specified.${STYLE.reset_all}`);
            return 1;
        }

        // check if path exists
        const abs_path = fs.absolute(path);
        if (!fs.exists(abs_path)) {
            term.writeln(`${PREFABS.error}File does not exist.${STYLE.reset_all}`);
            return 1;
        }

        // check if file is a .png or .jpg
        const ext = abs_path.slice(-4).toLowerCase();
        if (ext !== ".png" && ext !== ".jpg") {
            term.writeln(`${PREFABS.error}File is not a .png or .jpg.${STYLE.reset_all}`);
            return 1;
        }

        const mime = ext === ".png" ? "image/png" : "image/jpeg";

        // read file
        const content = fs.read_file(abs_path);

        // convert to base64 url
        const url = await convert_to_b64_url(content, mime);

        // convert image to ascii
        const ascii = await convert_to_ascii(url, term.cols - 2);

        // write image
        term.writeln(ascii);

        return 0;
    }
} as AsyncProgram;