import { ANSI, WrappedTerminal, NEWLINE } from "./term_ctl";
import "xterm/css/xterm.css";

import { FitAddon } from "xterm-addon-fit";
import { WebLinksAddon } from "xterm-addon-web-links";
import { ImageAddon } from "xterm-addon-image";

import { ProgramRegistry } from "./prog_registry";
import * as programs from "./programs/@ALL";

import { SoundRegistry } from "./sfx_registry";

import { LocalStorageFS } from "./fs_impl/localstorage";

// create a program registry by importing all programs
const prog_reg = new ProgramRegistry();
for (const prog of Object.values(programs)) {
    prog_reg.registerProgram(prog);
}

// create a sound registry
const sfx_reg = new SoundRegistry();
sfx_reg.register_file("reader_on", "public/sfx/reader_on.mp3");
sfx_reg.register_file("reader_off", "public/sfx/reader_off.mp3");


// create a filesystem
const fs = new LocalStorageFS();


// create etc directory if it doesn't exist
const absolute_etc = fs.absolute("/etc");
if (!fs.dir_exists(absolute_etc)) {
    fs.make_dir(absolute_etc);
}

// create motd file if it doesn't exist
const motd_content = `┌─ Welcome to ${ANSI.STYLE.italic + ANSI.STYLE.bold + ANSI.FG.magenta}OllieOS...${ANSI.STYLE.reset_all} ─────────────────┐
│  ${ANSI.STYLE.bold + ANSI.FG.blue}Type ${ANSI.PREFABS.program_name}help${ANSI.STYLE.no_italic + ANSI.FG.blue} for a list of commands.${ANSI.STYLE.reset_all}      │
│  ${ANSI.STYLE.bold + ANSI.FG.blue}Type ${ANSI.PREFABS.program_name}mefetch${ANSI.STYLE.no_italic + ANSI.FG.blue} for info about me.${ANSI.STYLE.reset_all}        │
│  ${ANSI.STYLE.bold + ANSI.FG.blue}Type ${ANSI.PREFABS.program_name}cd projects${ANSI.STYLE.no_italic + ANSI.FG.blue} to view project info.${ANSI.STYLE.reset_all} │
└─────────────────────────────────────────┘`.replace(/\n/g, NEWLINE);

const absolute_motd = fs.absolute("/etc/motd.txt");
if (!fs.exists(absolute_motd)) {
    fs.write_file(absolute_motd, motd_content);
}

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

The source code is available on GitHub at https://github.com/obfuscatedgenerated/obfuscatedgenerated.github.io and is licensed under the MIT license.
`.replace(/\n/g, NEWLINE);

const absolute_credits = fs.absolute("~/credits.txt");
if (!fs.exists(absolute_credits)) {
    fs.write_file(absolute_credits, credits_content);
}


// create a terminal using the registry and filesystem
const term = new WrappedTerminal(fs, prog_reg, sfx_reg, {
    screenReaderMode: false,
    cursorBlink: true,
});

// load addons
const fit = new FitAddon();
term.loadAddon(fit);

term.loadAddon(new WebLinksAddon());

term.loadAddon(new ImageAddon());

// open the terminal
const render = <HTMLElement>document.querySelector("#terminal");
term.open(render);
fit.fit();

// focus the terminal
term.focus();

// if this is a small screen, show a message
if (window.innerWidth < 600) {
    const wrapped = term.word_wrap(`${ANSI.BG.red + ANSI.FG.white}Warning: The screen that the terminal is running on is rather small!${NEWLINE + NEWLINE}Some programs may not display correctly, consider using a larger screen such as a computer or tablet.${ANSI.STYLE.reset_all}`, term.cols);
    term.writeln(wrapped);
}

term.insert_preline();


// disable F1 help
window.addEventListener("keydown", function (e) {
    if (e.code === "F1") {
        e.preventDefault();
    }
});


// on resize, resize the terminal
window.addEventListener("resize", () => {
    fit.fit();
});