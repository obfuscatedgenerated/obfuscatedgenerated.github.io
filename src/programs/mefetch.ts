import type { AsyncProgram } from "../types";
import { NEWLINE } from "../term_ctl";

import { default as img2ascii } from "imgToAscii";


const convert_to_ascii = async (url: string, size: number): Promise<string> => {
    const img = new img2ascii(url, size, size / 2);
    await img.loadImage;

    // convert newlines in string
    const ascii = img.stringANSI8BitColor.replace(/\n/g, NEWLINE);
    return ascii;
}


export default {
    name: "mefetch",
    description: "Shows information about me.",
    usage_suffix: "",
    flags: {},
    async_main: async (data) => {
        // extract from data to make code less verbose
        const { term } = data;

        // restrict to first two thirds of screen
        const max_columns = Math.floor(term.cols * 0.66);

        // set image size
        const asc_width = Math.floor(max_columns / 3);

        // convert image to ascii
        const ascii_pfp = await convert_to_ascii("public/logo.png", asc_width);

        const text = `obfuscatedgenerated${NEWLINE}-------------------${NEWLINE}OS: OllieOS${NEWLINE}Website: https://ollieg.codes${NEWLINE}GitHub: https://github.com/obfuscatedgenerated`;

        // go line by line through both text and ascii
        const asc_lines = ascii_pfp.split(NEWLINE);
        const txt_lines = text.split(NEWLINE);

        // get the greater of the two lengths
        const max_lines = Math.max(asc_lines.length, txt_lines.length);

        // get the longest length of a line of text
        const max_line_length = Math.max(...txt_lines.map(line => line.length));

        // determine padding around and between text and ascii
        const center_padding_size = Math.floor(max_columns * 0.1);
        const side_padding_size = Math.floor((max_columns - max_line_length - asc_width - center_padding_size) / 2);

        // generate padding strings
        const center_padding = " ".repeat(center_padding_size);
        const side_padding = " ".repeat(side_padding_size);

        // print each line
        for (let i = 0; i < max_lines; i++) {
            const asc_line = asc_lines[i] || "";
            const txt_line = txt_lines[i] || "";

            // print side by side with padding
            term.writeln(side_padding + asc_line + center_padding + txt_line);
        }

        return 0;
    }
} as AsyncProgram;