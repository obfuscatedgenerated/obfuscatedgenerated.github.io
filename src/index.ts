import { ANSI, WrappedTerminal, NEWLINE } from "./term_ctl";
import "xterm/css/xterm.css";

import { FitAddon } from "xterm-addon-fit";
import { WebLinksAddon } from "xterm-addon-web-links";
import { ImageAddon } from "xterm-addon-image";

import { ProgramRegistry } from "./prog_registry";
import * as programs from "./programs/@ALL";

import { SoundRegistry } from "./sfx_registry";

import { LocalStorageFS } from "./fs_impl/localstorage";
import { initial_fs_setup } from "./initial_fs_setup";

import Swal from "sweetalert2";


async function main() {
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

    // create initial files
    initial_fs_setup(fs);


    // create a terminal using the registry and filesystem
    const term_loaded_callback = () => {
        // delete the #loading_hint element
        const loading_hint = document.getElementById("loading_hint");
        if (loading_hint) {
            loading_hint.remove();
        }
    };

    const term = new WrappedTerminal(fs, prog_reg, sfx_reg, term_loaded_callback, {
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


    // if this is a small screen, show a message
    if (window.innerWidth < 600) {
        const wrapped = term.word_wrap(`${ANSI.BG.red + ANSI.FG.white}Warning: The screen that the terminal is running on is rather small!${NEWLINE + NEWLINE}Some programs may not display correctly, consider using a larger screen such as a computer or tablet.${ANSI.STYLE.reset_all}`, term.cols);
        term.writeln(wrapped);
    }


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


    // bind right click to copy/paste
    window.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        term.copy_or_paste();
    });


    // if this is the user's first time, show a popup asking if they want to run the tour
    if (localStorage.getItem("visited") === null) {
        const tour = await Swal.fire({
            title: "Welcome to OllieOS!",
            html: "<p>It looks like it's your first time here!</p><p>Would you like to run the tour?</p><p>If you select no, you can run the tour later by using the <code>tour</code> command.</p>",
            icon: "question",
            showCancelButton: true,
            confirmButtonText: "Yes",
            cancelButtonText: "No",
        });

        const reader = await Swal.fire({
            title: "Screen Reader",
            html: "<p>Would you like to enable the screen reader?</p><p>Due to a technical limitation, on-screen links will not be clickable in screen reader mode.</p><p>You can toggle the screen reader at any time with the <code>reader</code> command.</p>",
            icon: "question",
            showCancelButton: true,
            confirmButtonText: "Yes",
            cancelButtonText: "No",
        });

        if (reader.isConfirmed) {
            await term.execute("reader");
            term.insert_preline();
        }

        if (tour.isConfirmed) {
            await term.execute("tour");
            term.insert_preline();
        }

        localStorage.setItem("visited", "");
    } else {
        term.insert_preline();
    }

    term.focus();
}

main();