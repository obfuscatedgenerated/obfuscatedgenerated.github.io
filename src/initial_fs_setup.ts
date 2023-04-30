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
    // create credits file if it doesn't exist
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

    // always overwrite the credits file
    const absolute_credits = fs.absolute("~/credits.txt");
    fs.write_file(absolute_credits, credits_content, true);
    fs.set_readonly(absolute_credits, true);
};


const setup_projects = (fs: FileSystem) => {
    // create projects directory if it doesn't exist
    const absolute_projects = fs.absolute("~/projects");
    if (!fs.dir_exists(absolute_projects)) {
        fs.make_dir(absolute_projects);
    }

};


export const initial_fs_setup = (fs: FileSystem) => {
    setup_motd(fs);
    setup_rc_profile(fs);
    setup_credits(fs);
    setup_projects(fs);
};
