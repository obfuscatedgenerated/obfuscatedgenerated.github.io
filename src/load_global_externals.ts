// provides expected externals of pkgbuild programs into global

import * as howler from "howler";
import * as htmlToText from "html-to-text";
import * as sixel from "sixel";
import * as sweetalert2 from "sweetalert2";
import * as xterm from "@xterm/xterm";

globalThis.ollieos = {};
globalThis.howler = howler;
globalThis["html-to-text"] = htmlToText;
globalThis.sixel = sixel;
globalThis.sweetalert2 = sweetalert2;
globalThis["@xterm/xterm"] = xterm;

// support old xterm names
globalThis["xterm"] = xterm;


console.log("Common global externals loaded successfully.");

if (typeof window !== "undefined") {
    console.log("Loading browser-specific global externals...");

    (async() => {
        const fitAddon = await import("@xterm/addon-fit");
        const webLinksAddon = await import("@xterm/addon-web-links");
        const imageAddon = await import("@xterm/addon-image");
        const xtermLinkProvider = await import("xterm-link-provider");

        globalThis["@xterm/addon-fit"] = fitAddon;
        globalThis["@xterm/addon-web-links"] = webLinksAddon;
        globalThis["@xterm/addon-image"] = imageAddon;
        globalThis["xterm-link-provider"] = xtermLinkProvider;

        globalThis["xterm-addon-fit"] = fitAddon;
        globalThis["xterm-addon-web-links"] = webLinksAddon;
        globalThis["xterm-addon-image"] = imageAddon;

        console.log("Browser-specific global externals loaded successfully.");
    })();
}