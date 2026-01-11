import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { ImageAddon } from "@xterm/addon-image";

import {ANSI, NEWLINE, WrappedTerminal} from "./term_ctl";

import {Kernel} from "./kernel";

import {ProgramRegistry} from "./prog_registry";
import * as programs from "./programs/@ALL";

import { SoundRegistry } from "./sfx_registry";

import type {AbstractFileSystem} from "./filesystem";
import { LocalStorageFS } from "./fs_impl/localstorage";
import { OPFSFileSystem } from "./fs_impl/opfs";
import { initial_fs_setup } from "./initial_fs_setup";

import {DOMWindowManager} from "./window_impl/dom";

import "./load_global_externals";

export const boot_os = async (on_init_spawned?: (kernel: Kernel) => Promise<void>) => {
    // create a program registry by importing all programs
    const prog_reg = new ProgramRegistry();
    for (const prog of Object.values(programs)) {
        await prog_reg.registerProgram({
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

    // boot the kernel and check for a false return (indicating boot failure). should probably never return true as the os should hopefully always run!
    return await kernel.boot(on_init_spawned);
}
