import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { ImageAddon } from "@xterm/addon-image";

import {ANSI, NEWLINE, word_wrap} from "./lib/ansi";

import {Kernel} from "./kernel";

import type {AbstractFileSystem} from "./kernel/filesystem";
import { LocalStorageFS } from "./fs_impl/localstorage";
import { OPFSFileSystem } from "./fs_impl/opfs";
import { initial_fs_setup } from "./initial_fs_setup";

import {DOMWindowManager} from "./window_impl/dom";

import "./load_global_externals";
import {PorterBridgeNetworkManager} from "./network_impl/porter";
import {XTermTerminal} from "./term_impl/xterm";

import * as builtin_programs from "./programs/@ALL";
import {LoopbackIsoThreadManager} from "./isothread_impl/loopback";
import {WebWorkerIsoThreadManager} from "./isothread_impl/web_worker";

export const boot_os = async (on_init_spawned?: (kernel: Kernel) => Promise<void>) => {
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
    await initial_fs_setup(fs, builtin_programs);

    // create a dom window manager
    const wm = new DOMWindowManager();

    // create network manager
    const net_manager = new PorterBridgeNetworkManager();

    // create isothread manager if workers are available
    const version = document.body.dataset.version || "unknown";
    const itm = typeof Worker !== "undefined" ? new WebWorkerIsoThreadManager(`public/script/isothread_worker.bundle.js?v=${version}`) : undefined;

    // create a terminal using the registry and filesystem
    const term = new XTermTerminal({
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
        const wrapped = word_wrap(`${ANSI.BG.red + ANSI.FG.white}Warning: The screen that the terminal is running on is rather small!${NEWLINE + NEWLINE}Some programs may not display correctly, consider using a larger screen such as a computer or tablet.${NEWLINE + NEWLINE}An alternative interface is in the works. You can also use the command "legacy" to view the old (outdated) site.${ANSI.STYLE.reset_all}`, term.cols);
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

    // create the kernel
    const kernel = new Kernel({
        term,
        fs,
        wm,
        net_manager,
        virtual_programs: new Map(Object.entries(builtin_programs)),
        isothread_manager: itm
    });
    kernel.set_env_info(version, "web");

    // boot the kernel and check for a false return (indicating boot failure). should probably never return true as the os should hopefully always run!
    return await kernel.boot(on_init_spawned);
}
