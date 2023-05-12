import { FileSystem } from "./filesystem";
import { ANSI, NEWLINE } from "./term_ctl";

const setup_motd = (fs: FileSystem) => {
    // create etc directory if it doesn't exist
    const absolute_etc = fs.absolute("/etc");
    if (!fs.dir_exists(absolute_etc)) {
        fs.make_dir(absolute_etc);
    }

    // create motd file if it doesn't exist
    const motd_content = `┌─ Welcome to ${ANSI.STYLE.italic + ANSI.STYLE.bold + ANSI.FG.magenta}OllieOS...${ANSI.STYLE.reset_all} ───────────────────┐
│  ${ANSI.STYLE.bold + ANSI.FG.blue}Type ${ANSI.PREFABS.program_name}help${ANSI.STYLE.no_italic + ANSI.FG.blue} for a list of commands.${ANSI.STYLE.reset_all}        │
│  ${ANSI.STYLE.bold + ANSI.FG.blue}Type ${ANSI.PREFABS.program_name}mefetch${ANSI.STYLE.no_italic + ANSI.FG.blue} for info about me.${ANSI.STYLE.reset_all}          │
│  ${ANSI.STYLE.bold + ANSI.FG.blue}Type ${ANSI.PREFABS.program_name}cd projects${ANSI.STYLE.no_italic + ANSI.FG.blue} to view project info.${ANSI.STYLE.reset_all}   │
│  ${ANSI.STYLE.bold + ANSI.FG.blue}Type ${ANSI.PREFABS.program_name}bugreport${ANSI.STYLE.no_italic + ANSI.FG.blue} to open the bug reporter.${ANSI.STYLE.reset_all} │
└───────────────────────────────────────────┘`.replace(/\n/g, NEWLINE);

    const absolute_motd = fs.absolute("/etc/motd.txt");
    if (!fs.exists(absolute_motd)) {
        fs.write_file(absolute_motd, motd_content);
    }
};

const setup_rc_profile = (fs: FileSystem) => {
    // create .ollie_profile file if it doesn't exist
    const profile_content = `# OllieOS configuration file${NEWLINE}# This file is run when the OS starts.${NEWLINE}${NEWLINE}cat /etc/motd.txt${NEWLINE}`;
    const absolute_profile = fs.absolute("~/.ollie_profile");
    if (!fs.exists(absolute_profile)) {
        fs.write_file(absolute_profile, profile_content);
    }

    // create .ollierc file if it doesn't exist
    const rc_content = `# OllieOS configuration file${NEWLINE}# This file is run when a shell is created.${NEWLINE}${NEWLINE}`;
    const absolute_rc = fs.absolute("~/.ollierc");
    if (!fs.exists(absolute_rc)) {
        fs.write_file(absolute_rc, rc_content);
    }
};

const setup_credits = (fs: FileSystem) => {
    // create credits file
    const credits_content = `
Credits
=======

This website was made by obfuscatedgenerated using the following technologies:

- TypeScript
- xterm.js
- Handlebars.js
- Webpack

As well as the following libraries:

- imgToAscii (modified)
- node-sixel
- xterm-addon-fit
- xterm-addon-web-links
- xterm-addon-image
- howler.js
- html-to-text
- some code from rss-parser (modified)

Additionally, fsedit uses:

- Font Awesome

The source code is available on GitHub at https://github.com/obfuscatedgenerated/obfuscatedgenerated.github.io and is licensed under the MIT license.
`.replace(/\n/g, NEWLINE);

    // only overwrite the file if it doesn't exist or the content is different
    const absolute_credits = fs.absolute("~/credits.txt");
    if (!fs.exists(absolute_credits) || fs.read_file(absolute_credits) !== credits_content) {
        fs.write_file(absolute_credits, credits_content, true);
        fs.set_readonly(absolute_credits, true);
    }
};


const fetch_file = async (url: string, skip_cache: boolean) => {
    // check if url exists in TTL cache
    const ttl_cache = localStorage.getItem("fetch_ttl_cache");
    const ttl_cache_obj = ttl_cache ? JSON.parse(ttl_cache) : {};

    // if the url's TTL hasn't expired, don't fetch the file
    // saves time acquiring heavy files at startup whilst still allowing for updates at some point
    if (!skip_cache && ttl_cache_obj[url]) {
        if (ttl_cache_obj[url] > Date.now()) {
            return null;
        }
    }

    // fetch the file and convert it to a Uint8Array
    const response = await fetch(url);
    const array_buffer = await response.arrayBuffer();

    // add the url to the TTL cache
    ttl_cache_obj[url] = Date.now() + 1000 * 60 * 60 * 24 * 7; // 1 week
    localStorage.setItem("fetch_ttl_cache", JSON.stringify(ttl_cache_obj));

    return new Uint8Array(array_buffer);
};


// this is messy since the multi-line string has specific formatting, could extract the strings or do some sort of strip
const projects = {
    "OllieOS": {
        "info.txt": {
            fetch: false, content: `

OllieOS is the rebuild of my personal website. I chose to create an interactive terminal with a feature rich operating system.
The terminal is built using xterm.js and the OS is built using TypeScript. The OS is designed to be modular, so that it can be easily extended.

Project URL: https://ollieg.codes
Repo URL: https://github.com/obfuscatedgenerated/obfuscatedgenerated.github.io
`},
    },
    "mewsic": {
        "icon.png": { fetch: true, content: "https://raw.githubusercontent.com/obfuscatedgenerated/mewsic/main/public/logo.png" },
        "info.txt": {
            fetch: false, content: `

A PAW (purring audio workstation)

Project URL: https://mewsic.ollieg.codes
Repo URL: https://github.com/obfuscatedgenerated/mewsic
        `},
    },
    "ClickbaitDetector": {
        "info.txt": {
            fetch: false, content: `

An AI written in Python with Tensorflow that detects clickbait.

Repo URL: https://github.com/obfuscatedgenerated/ClickbaitDetector
        `},
    },
    "ytWordCloud": {
        "info.txt": {
            fetch: false, content: `

A Python program that generates a word cloud from the titles of a YouTube channel's videos.

Repo URL: https://github.com/obfuscatedgenerated/ytWordCloud
        `},
        "example.png": {
            fetch: true, content: "https://raw.githubusercontent.com/obfuscatedgenerated/ytWordCloud/main/example.png"
        },
    },
    "workitmakeit": {
        "info.txt": {
            fetch: false, content: `

A collection of Cloudflare Workers for common tasks.

Org URL: https://github.com/workitmakeit
        `},
        "logo.png": {
            fetch: true, content: "https://avatars.githubusercontent.com/workitmakeit"
        },
        "email-validator.txt": {
            fetch: false, content: `

A Cloudflare Worker that sits as middleware before a form submission to validate the email address, with Mailgun as the email service.

Repo URL: https://github.com/workitmakeit/email-validator
        `},
        "rss-update.txt": {
            fetch: false, content: `

A Cloudflare Worker (demo) to show posting blog updates to Mastodon.

Repo URL: https://github.com/workitmakeit/rss-update
        `},
    },
    "Virtuoso": {
        "info.txt": {
            fetch: false, content: `

A virtual machine host for Discord powered by VMware.

The bot manages a VMware instance to allow users to boot, view, and list virtual machines.
With the Conductor component installed in the VM, users can control the VM from Discord.

(URLs not public yet)
        `},
        "logo.png": {
            fetch: true, content: "https://avatars.githubusercontent.com/VirtuosoVM"
        },
    },
    "vscode-aura": {
        "info.txt": {
            fetch: false, content: `

A VSCode extension to blink the lights of ASUS Aura Sync compatible devices depending on the problems in the project.

Extension URL: https://marketplace.visualstudio.com/items?itemName=obfuscatedgenerated.vscode-aura
Repo URL: https://github.com/obfuscatedgenerated/vscode-aura

You may also be interested in https://github.com/obfuscatedgenerated/asus-aura-control
        `},
    },
};

const setup_projects = async (fs: FileSystem) => {
    // create projects directory if it doesn't exist
    const absolute_projects = fs.absolute("~/projects");
    if (!fs.dir_exists(absolute_projects)) {
        fs.make_dir(absolute_projects);
    }

    // for each key in projects, create a directory if it doesn't exist and write each file described in the nested object (key=filename, value=content)
    for (const project_name in projects) {
        const absolute_project = fs.absolute(`~/projects/${project_name}`);
        if (!fs.dir_exists(absolute_project)) {
            fs.make_dir(absolute_project);
        }

        const project = projects[project_name];
        for (const file_name in project) {
            const absolute_file = fs.absolute(`~/projects/${project_name}/${file_name}`);
            let content = project[file_name].content;

            // if the content is a fetchable URL, fetch it
            if (project[file_name].fetch) {
                try {
                    // if the file doesn't exist, skip the TTL cache
                    const skip_cache = !fs.exists(absolute_file);

                    // fetch the file if TTL cache is expired or doesn't exist
                    content = await fetch_file(content, skip_cache);

                    if (!content) {
                        // skip this file
                        continue;
                    }
                } catch (e) {
                    console.error(`Failed to fetch ${file_name} for ${project_name}`);
                    console.error(e);

                    // skip this file
                    continue;
                }
            } else {
                content = content.replace(/\n/g, NEWLINE);
            }

            // only overwrite the file if it doesn't exist or the content is different
            if (!fs.exists(absolute_file) || fs.read_file(absolute_file) !== content) {
                fs.write_file(absolute_file, content, true);
                fs.set_readonly(absolute_file, true);
            }
        }
    }
};


export const initial_fs_setup = (fs: FileSystem) => {
    setup_motd(fs);
    setup_rc_profile(fs);
    setup_credits(fs);
    setup_projects(fs);
};
