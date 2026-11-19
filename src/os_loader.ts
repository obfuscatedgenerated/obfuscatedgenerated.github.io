import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { ImageAddon } from "@xterm/addon-image";

import {ANSI, NEWLINE, word_wrap} from "./lib/ansi";

import {Kernel, VirtualProgram} from "./kernel";

import type {AbstractFileSystem} from "./kernel/filesystem";
import { LocalStorageFS } from "./fs_impl/localstorage";
import { OPFSFileSystem } from "./fs_impl/opfs";
import { initial_fs_setup } from "./initial_fs_setup";
import {type BuiltinCodeSource, sync_builtin_code} from "./builtin_code";

import {DOMWindowManager} from "./window_impl/dom";

import {PorterBridgeNetworkManager} from "./network_impl/porter";
import {XTermTerminal} from "./term_impl/xterm";

import * as builtin_modules from "./programs/@ALL";
import {WebIsoThreadManager} from "./isothread_impl/web";
import {WebPlatformAPI} from "./platform_impl/web";
import {KernelFuncs, Program, ThreadFuncs} from "./types";

// builtins are built as their own bundles into public/bin, with a manifest of their hashes
const web_builtin_code_source = (version: string): BuiltinCodeSource => ({
    get_manifest: async () => {
        // dev builds don't change the version, so the manifest is always revalidated
        const response = await fetch(`public/bin/manifest.json?v=${version}`, {cache: "no-cache"});
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        return await response.json();
    },
    get_code: async (name, hash, refetch) => {
        const response = await fetch(`public/bin/${name}.js?h=${hash}`, refetch ? {cache: "reload"} : {});
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        return await response.text();
    },
});

export const boot_os = async (on_init_spawned?: (kernel: Kernel) => Promise<void>) => {
    const version = document.body.dataset.version || "unknown";

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

    // construct virtual programs (inline kernel funcs)
    const builtin_programs: Record<string, Program> = {};
    const virtual_programs = new Map<string, VirtualProgram>();

    for (const [name, module] of Object.entries(builtin_modules)) {
        const {kernel_funcs, threads} = module as {kernel_funcs?: KernelFuncs, threads?: ThreadFuncs};

        builtin_programs[name] = module.default;
        virtual_programs.set(name, {...module.default, kernel_funcs, threads});
    }

    // create initial files
    await initial_fs_setup(fs, builtin_programs);

    // put the code of builtins that can run isolated into /bin
    await sync_builtin_code(fs, builtin_programs, web_builtin_code_source(version));

    // move the old localStorage reader setting into the fs
    const old_reader_setting = localStorage.getItem("reader");
    if (old_reader_setting !== null) {
        await fs.write_file("/etc/reader", old_reader_setting, true);
        localStorage.removeItem("reader");
    }

    // create a dom window manager
    const wm = new DOMWindowManager();

    // create network manager
    const net_manager = new PorterBridgeNetworkManager();

    // create isothread manager if workers are available
    const itm = typeof Worker !== "undefined" ? new WebIsoThreadManager(`public/script/isothread_worker.bundle.js?v=${version}`) : undefined;

    // create a terminal using the registry and filesystem
    const term = new XTermTerminal({
        screenReaderMode: false,
        cursorBlink: true,
    });

    // the main terminal's title is the page's title, falling back to the original when cleared
    const page_title = document.title;
    term.on_title_change((title) => {
        document.title = title || page_title;
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
        const wrapped = word_wrap(`${ANSI.BG.red + ANSI.FG.white}Warning: The screen that the terminal is running on is rather small!${NEWLINE + NEWLINE}Some programs may not display correctly, consider using a larger screen such as a computer or tablet.${NEWLINE + NEWLINE}An alternative interface is in the works.${ANSI.STYLE.reset_all}`, term.cols);
        term.writeln(wrapped);
    }

    const f1_disable = (e: KeyboardEvent) => {
        if (e.code === "F1") {
            e.preventDefault();
        }
    }


    // disable F1 help
    window.addEventListener("keydown", f1_disable);

    const resize_terminal = () => {
        fit.fit();
    }

    // on resize, resize the terminal
    window.addEventListener("resize", resize_terminal);

    // create the kernel
    const kernel = new Kernel({
        term,
        fs,
        wm,
        net_manager,
        platform: new WebPlatformAPI(),
        virtual_programs,
        isothread_manager: itm
    });
    kernel.set_env_info(version, "web");

    // boot the kernel and check for a false return (indicating boot failure). should probably never return true as the os should hopefully always run!
    const end_reason = await kernel.boot(on_init_spawned);

    // clear side effects
    window.removeEventListener("keydown", f1_disable);
    window.removeEventListener("resize", resize_terminal);
    term.dispose();

    return end_reason;
}
