import { ANSI, WrappedTerminal, NEWLINE } from "./term_ctl";
import "xterm/css/xterm.css";

import { FitAddon } from "xterm-addon-fit";
import { WebLinksAddon } from "xterm-addon-web-links";

import { ProgramRegistry } from "./prog_registry";
import * as programs from "./programs/@ALL";

import { LocalStorageFS } from "./filesystem";

// create a program registry by importing all programs
const prog_reg = new ProgramRegistry();
for (const prog of Object.values(programs)) {
    prog_reg.registerProgram(prog);
}

// create a local storage filesystem
const fs = new LocalStorageFS();

// create .ollierc file if it doesn't exist
const rc_content = `# OllieOS configuration file${NEWLINE}# This file is run when the shell starts.${NEWLINE}${NEWLINE}`
const absolute_rc = fs.absolute("~/.ollierc");
if (!fs.exists(absolute_rc)) {
    fs.write_file(absolute_rc, rc_content);
}

// create a terminal using the registry and filesystem
const term = new WrappedTerminal(fs, prog_reg, {
    screenReaderMode: true,
});

// load addons
const fit = new FitAddon();
term.loadAddon(fit);
term.loadAddon(new WebLinksAddon());

// open the terminal
const render = <HTMLElement>document.querySelector("#terminal");
term.open(render);
fit.fit();

// focus the terminal
term.focus();

// draw splash screen
term.writeln(`┌─ Welcome to ${ANSI.STYLE.italic + ANSI.STYLE.bold + ANSI.FG.magenta}OllieOS...${ANSI.STYLE.reset_all} ──────────────┐`);
term.writeln(`│  ${ANSI.STYLE.bold + ANSI.FG.blue}Type ${ANSI.PREFABS.program_name}help${ANSI.STYLE.no_italic + ANSI.FG.blue} for a list of commands.${ANSI.STYLE.reset_all}   │`);
term.writeln("└──────────────────────────────────────┘");
term.insert_preline();


// disable F1 help
window.addEventListener("keydown",function (e) {
    if (e.code === "F1") {
        e.preventDefault();
    }
});


// on resize, resize the terminal
window.addEventListener("resize", () => {
    fit.fit();
});