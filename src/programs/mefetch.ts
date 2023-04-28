import type { AsyncProgram } from "../types";
import { NEWLINE, ANSI, ANSI_UNESCAPED_REGEX } from "../term_ctl";

import { default as img2ascii } from "imgToAscii";


const convert_to_ascii = async (url: string, size: number): Promise<string> => {
    const img = new img2ascii(url, size, Math.round(size / 2));
    await img.loadImage;

    // convert newlines in string
    const ascii = img.stringANSI8BitColor.replace(/\n/g, NEWLINE);
    return ascii;
}


export default {
    name: "mefetch",
    description: "Shows information about me.",
    usage_suffix: "",
    arg_descriptions: {},
    async_main: async (data) => {
        // extract from data to make code less verbose
        const { term } = data;

        // extract from ANSI to make code less verbose
        const { STYLE, FG, PREFABS } = ANSI;

        // restrict to first 3 quarters of screen
        const max_columns = Math.floor(term.cols * 0.75);

        // set image size
        const asc_width = Math.floor(max_columns / 3);

        // convert image to ascii
        const ascii_pfp = await convert_to_ascii("public/logo.png", asc_width);

        // text is written with \n as newlines for simplicity, replace with NEWLINE
        const text = `
        ${STYLE.bold}obfuscatedgenerated
        -------------------
        ${STYLE.bold}OS${STYLE.reset_all + FG.cyan}: OllieOS

        ${STYLE.bold}Pronouns${STYLE.reset_all + FG.cyan}: he/him
        ${STYLE.bold}Location${STYLE.reset_all + FG.cyan}: UK
        ${STYLE.bold}Interests${STYLE.reset_all + FG.cyan}: Programming, Music, Photography, 3D Stuff

        ${STYLE.bold}Website${STYLE.reset_all + FG.cyan}: https://ollieg.codes
        ${STYLE.bold}Blog${STYLE.reset_all + FG.cyan}: https://blog.ollieg.codes (or use the ${PREFABS.program_name}rss${STYLE.reset_all + FG.cyan} command)

        ${STYLE.bold}GitHub${STYLE.reset_all + FG.cyan}: https://github.com/obfuscatedgenerated
        ${STYLE.bold}Mastodon${STYLE.reset_all + FG.cyan}: https://fosstodon.org/@ollieg
        ${STYLE.bold}PyPI${STYLE.reset_all + FG.cyan}: https://pypi.org/user/obfuscatedgenerated
        ${STYLE.bold}NPM${STYLE.reset_all + FG.cyan}: https://www.npmjs.com/~obfuscatedgenerated

        ${STYLE.bold}Current Favourite Language${STYLE.reset_all + FG.cyan}: C
        ${STYLE.bold}Favourite Project${STYLE.reset_all + FG.cyan}: This website!
        `.replace(/\n/g, NEWLINE);

        // reapply style each line as image will override it
        const txt_line_prefix = FG.cyan;
        const txt_line_suffix = STYLE.reset_all;

        // go line by line through both text and ascii
        const asc_lines = ascii_pfp.split(NEWLINE);
        const txt_lines = text.split(NEWLINE);

        // get the greater of the two lengths
        const max_lines = Math.max(asc_lines.length, txt_lines.length);

        // get the longest length of a line of ascii ignoring ansi characters, and the longest length of a line of text
        const max_asc_line_length = Math.max(...asc_lines.map(line => line.replace(ANSI_UNESCAPED_REGEX, "").length));
        const max_txt_line_length = Math.max(...txt_lines.map(line => line.length));

        // determine padding around and between text and ascii
        const center_padding_size = Math.floor(max_columns / 15);
        const side_padding_size = Math.floor((max_columns - max_txt_line_length - (max_asc_line_length / 2) - center_padding_size) / 2);

        // generate padding strings, if positive
        const center_padding = " ".repeat(center_padding_size > 0 ? center_padding_size : 0);
        const side_padding = " ".repeat(side_padding_size > 0 ? side_padding_size : 0);

        // print each line
        for (let i = 0; i < max_lines; i++) {
            const asc_line = asc_lines[i] || "";
            const txt_line = txt_lines[i] || "";

            // add additional padding so the width of the ascii line is always the same
            const asc_line_padding = " ".repeat(max_asc_line_length - asc_line.replace(ANSI_UNESCAPED_REGEX, "").length);

            // print side by side with padding
            term.writeln(side_padding + asc_line + asc_line_padding + center_padding + txt_line_prefix + txt_line + txt_line_suffix);
        }

        return 0;
    }
} as AsyncProgram;