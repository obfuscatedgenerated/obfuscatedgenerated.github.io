import type { AsyncProgram } from "../types";
import { NEWLINE, ANSI, ANSI_UNESCAPED_REGEX } from "../term_ctl";

import { default as img2ascii } from "imgToAscii";


const MY_USERNAME = "obfuscatedgenerated";
const GH_USERNAME_REGEX = /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i;

const username_to_avatar_url = (username: string): string => {
    return `https://avatars.githubusercontent.com/${username}`;
}

type GHInfo = { name: string, bio: string, location: string, blog: string, followers: number, following: number, twitter: string };
const get_github_info = async (username: string): Promise<GHInfo> => {
    const url = `https://api.github.com/users/${username}`;
    const res = await fetch(url);

    if (!res.ok) {
        return null;
    }

    const json = await res.json();

    return {
        name: json.name,
        bio: json.bio,
        location: json.location,
        blog: json.blog,
        followers: json.followers,
        following: json.following,
        twitter: json.twitter_username
    };
}

const convert_to_ascii = async (url: string, size: number): Promise<string> => {
    const img = new img2ascii(url, size, Math.round(size / 2));
    await img.loadImage;

    // convert newlines in string
    const ascii = img.stringANSI8BitColor.replace(/\n/g, NEWLINE);
    return ascii;
}


const my_info = (info: GHInfo | null, version_str: string) => {
    // extract from ANSI to make code less verbose
    const { STYLE, FG, PREFABS } = ANSI;

    return `
${STYLE.bold}obfuscatedgenerated
-------------------
${STYLE.bold}OS${STYLE.reset_all + FG.cyan}: OllieOS v${version_str}

${STYLE.bold}Name${STYLE.reset_all + FG.cyan}: Ollie
${STYLE.bold}Pronouns${STYLE.reset_all + FG.cyan}: he/him
${STYLE.bold}Location${STYLE.reset_all + FG.cyan}: UK
${STYLE.bold}Interests${STYLE.reset_all + FG.cyan}: Programming, Music, Photography, 3D Stuff

${STYLE.bold}Website${STYLE.reset_all + FG.cyan}: https://ollieg.codes
${STYLE.bold}Blog${STYLE.reset_all + FG.cyan}: https://blog.ollieg.codes (or use the ${PREFABS.program_name}rss${STYLE.reset_all + FG.cyan} command)

${STYLE.bold}GitHub${STYLE.reset_all + FG.cyan}: https://github.com/obfuscatedgenerated
${STYLE.bold}Mastodon${STYLE.reset_all + FG.cyan}: https://fosstodon.org/@ollieg
${STYLE.bold}PyPI${STYLE.reset_all + FG.cyan}: https://pypi.org/user/obfuscatedgenerated
${STYLE.bold}NPM${STYLE.reset_all + FG.cyan}: https://www.npmjs.com/~obfuscatedgenerated

${STYLE.bold}GitHub Followers${STYLE.reset_all + FG.cyan}: ${info.followers || 0}
${STYLE.bold}GitHub Following${STYLE.reset_all + FG.cyan}: ${info.following || 0}

${STYLE.bold}Current Favourite Language${STYLE.reset_all + FG.cyan}: C
${STYLE.bold}Favourite Project${STYLE.reset_all + FG.cyan}: This website!
        `.replace(/\n/g, NEWLINE);
}

const stranger_info = (username: string, info: GHInfo | null, cols: number, version_str: string) => {
    // extract from ANSI to make code less verbose
    const { STYLE, FG } = ANSI;

    // line wrap the bio and make sure newlines ARE NOT CRLF (to retain columns)
    if (info.bio) {
        info.bio = info.bio.replace(/\r\n/g, "\n").replace(new RegExp(`(.{${Math.floor(cols * 0.25)}})\\s`, "g"), "$1\n");
    }

    // TODO: messy, clean up
    // insert known data or move up a line if not known (to undo the newline added by the ternary operator)
    return `
${STYLE.bold}${username}
${"-".repeat(username.length)}
${STYLE.bold}OS${STYLE.reset_all + FG.cyan}: OllieOS v${version_str}

${info.name ? `${STYLE.bold}Name${STYLE.reset_all + FG.cyan}: ${info.name}` : "\x1b[1A"}
${info.location ? `${STYLE.bold}Location${STYLE.reset_all + FG.cyan}: ${info.location}` : "\x1b[1A"}
${info.bio ? `${STYLE.bold}Bio${STYLE.reset_all + FG.cyan}: ${info.bio}` : "\x1b[1A"}

${info.blog ? `${STYLE.bold}Website${STYLE.reset_all + FG.cyan}: ${info.blog}` : "\x1b[1A"}

${STYLE.bold}GitHub${STYLE.reset_all + FG.cyan}: https://github.com/${username}
${info.twitter ? `${STYLE.bold}Twitter${STYLE.reset_all + FG.cyan}: https://twitter.com/${info.twitter}` : "\x1b[1A"}

${STYLE.bold}GitHub Followers${STYLE.reset_all + FG.cyan}: ${info.followers || 0}
${STYLE.bold}GitHub Following${STYLE.reset_all + FG.cyan}: ${info.following || 0}
    `.replace(/\n/g, NEWLINE);
}

export default {
    name: "mefetch",
    description: "Shows information about me (or you!)",
    usage_suffix: "[username]",
    arg_descriptions: {
        "username": "The GitHub username to show basic info about. Defaults to my username, with the special info shown."
    },
    async_main: async (data) => {
        // extract from data to make code less verbose
        const { term, args } = data;

        // extract from ANSI to make code less verbose
        const { STYLE, FG } = ANSI;

        // get version string
        const version_str = term.get_variable("VERSION");

        // restrict to first 3 quarters of screen
        const max_columns = Math.floor(term.cols * 0.75);

        // set image size
        const asc_width = Math.floor(max_columns / 3);

        // get username
        const username = args[0] || MY_USERNAME;

        // check if username is valid
        if (!username.match(GH_USERNAME_REGEX)) {
            term.write(`${STYLE.bold}${FG.red}Invalid username.${STYLE.reset_all}\n`);
            return;
        }

        // get info from GitHub
        const info = await get_github_info(username);

        // if info is null, then the user doesn't exist
        if (info === null) {
            term.write(`${STYLE.bold}${FG.red}User not found.${STYLE.reset_all}\n`);
            return;
        }

        // use local logo for efficiency if username is mine
        const avatar_url = MY_USERNAME === username ? "public/logo.png" : username_to_avatar_url(username);

        // convert image to ascii
        const ascii_pfp = await convert_to_ascii(avatar_url, asc_width);

        // text is written with \n as newlines for simplicity, replaced with NEWLINE
        const text = MY_USERNAME === username ? my_info(info, version_str) : stranger_info(username, info, term.cols, version_str);

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