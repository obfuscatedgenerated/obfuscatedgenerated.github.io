import { ANSI, WrappedTerminal, NEWLINE } from "./term_ctl";
import "@xterm/xterm/css/xterm.css";

import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { ImageAddon } from "@xterm/addon-image";

import "./load_global_externals";
import {ProgramRegistry} from "./prog_registry";
import * as programs from "./programs/@ALL";

import { SoundRegistry } from "./sfx_registry";

import type {AbstractFileSystem} from "./filesystem";
import { LocalStorageFS } from "./fs_impl/localstorage";
import { OPFSFileSystem } from "./fs_impl/opfs";
import { initial_fs_setup } from "./initial_fs_setup";

import {DOMWindowManager} from "./window_impl/dom";
import {Kernel} from "./kernel";


const boot_screen = document.getElementById("boot_screen");

// insert boot loader bars depending on screen size (each bar should take 1/15th of the loader's width, ignoring margins)
const loader = document.getElementById("boot_loader") as HTMLDivElement;
const bar_count = Math.floor(loader.getBoundingClientRect().width / 15);
for (let i = 0; i < bar_count; i++) {
    const bar = document.createElement("div");
    bar.classList.add("boot_loader_bar");

    // make first 3 bars visible
    if (i < 3) {
        bar.style.visibility = "visible";
    }

    loader.appendChild(bar);
}

// animate the loader bars (3 block width, scrolling across the loader with wraparound)
let tail_bar_idx = 0;
const loader_interval = setInterval(() => {
    const bars = document.querySelectorAll(".boot_loader_bar") as NodeListOf<HTMLDivElement>;

    // hide the tail bar
    bars[tail_bar_idx].style.visibility = "hidden";

    // show the next bar
    bars[(tail_bar_idx + 3) % bars.length].style.visibility = "visible";

    // increment the tail bar index, wrapping around if necessary
    tail_bar_idx = (tail_bar_idx + 1) % bars.length;

    // if the boot screen is hidden, stop the animation
    if (boot_screen.style.opacity === "0") {
        clearInterval(loader_interval);
    }
}, 100);

async function check_first_time(term: WrappedTerminal) {
    // TODO: update implementation
    // TODO: use windows rather than sweetalert2
    //// if this is the user's first time, show a popup asking if they want to run the tour
    //if (localStorage.getItem("visited") === null) {
    //    const tour = await Swal.fire({
    //        title: "Welcome to OllieOS!",
    //        html: "<p>It looks like it's your first time here!</p><p>Would you like to run the tour?</p><p>If you select no, you can run the tour later by using the <code>tour</code> command.</p>",
    //        icon: "question",
    //        showCancelButton: true,
    //        confirmButtonText: "Yes",
    //        cancelButtonText: "No",
    //    });
//
    //    const reader = await Swal.fire({
    //        title: "Screen Reader",
    //        html: "<p>Would you like to enable the screen reader?</p><p>Due to a technical limitation, on-screen links will not be clickable in screen reader mode.</p><p>You can toggle the screen reader at any time with the <code>reader</code> command.</p>",
    //        icon: "question",
    //        showCancelButton: true,
    //        confirmButtonText: "Yes",
    //        cancelButtonText: "No",
    //    });
//
    //    term.focus();
//
    //    if (reader.isConfirmed) {
    //        await term.execute("reader");
    //    }
//
    //    if (tour.isConfirmed) {
    //        await term.execute("tour");
    //    }
//
    //    localStorage.setItem("visited", "");
    //} else {
    //    term.focus();
    //}
//
    //term.insert_preline();
}

function loaded(term: WrappedTerminal) {
    // fade out the boot screen
    boot_screen.style.opacity = "0";

    if (localStorage.getItem("nointro") === "true") {
        // skip any pauses for transitions
        boot_screen.style.display = "none";
        check_first_time(term);
        return;
    }

    // after faded, keep it like that for 500 ms before shrinking it to 0% height
    // then, run the tour if it's the user's first time
    setTimeout(() => {
        boot_screen.style.height = "0";
        setTimeout(() => {
            boot_screen.style.display = "none";
            check_first_time(term);
        }, 500);
    }, 1000);
}

async function main() {
    // create a program registry by importing all programs
    const prog_reg = new ProgramRegistry();
    for (const prog of Object.values(programs)) {
        prog_reg.registerProgram({
            program: prog,
            built_in: true,
        });
    }


    // create a sound registry
    const sfx_reg = new SoundRegistry();
    sfx_reg.register_file("reader_on", "public/sfx/reader_on.mp3");
    sfx_reg.register_file("reader_off", "public/sfx/reader_off.mp3");


    // create a filesystem
    // try opfs but use localstorage if not available, or already in use
    // TODO migrate from localstorage to opfs automatically
    let fs: AbstractFileSystem;
    if (!localStorage.getItem("fs") && navigator.storage && "getDirectory" in navigator.storage) {
        fs = new OPFSFileSystem();
    } else {
        fs = new LocalStorageFS();
    }

    if (!(await fs.is_ready())) {
        // poll every 10ms until ready
        await new Promise<void>((resolve) => {
            const interval = setInterval(async () => {
                if (await fs.is_ready()) {
                    clearInterval(interval);
                    resolve();
                }
            }, 10);
        });
    }

    // create initial files
    await initial_fs_setup(fs);

    // create a dom window manager
    const wm = new DOMWindowManager();

    // create a terminal using the registry and filesystem
    const term = new WrappedTerminal({
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
        const wrapped = term.word_wrap(`${ANSI.BG.red + ANSI.FG.white}Warning: The screen that the terminal is running on is rather small!${NEWLINE + NEWLINE}Some programs may not display correctly, consider using a larger screen such as a computer or tablet.${NEWLINE + NEWLINE}An alternative interface is in the works. You can also use the command "legacy" to view the old (outdated) site.${ANSI.STYLE.reset_all}`, term.cols);
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

    // create the kernel
    const kernel = new Kernel(term, fs, prog_reg, sfx_reg, wm);
    kernel.set_env_info(document.body.dataset.version, "web");

    loaded(term);

    // boot the kernel and check for a false return (indicating boot failure). should probably never return true as the os should hopefully always run!
    const successful_finish = await kernel.boot();
    if (!successful_finish) {
        boot_screen.style.display = "none";
        return;
    }
}

if (localStorage.getItem("nointro") === "true") {
    // disable transition on #boot_screen to make it usable faster
    boot_screen.style.transition = "none";

    // the boot screen will show only for as long as it takes to load the terminal
    main();
} else {
// add artificial delay to allow the boot screen to show for a bit
    setTimeout(main, 3000);
}

// TODO: better mobile experience
