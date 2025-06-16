// provides expected externals of pkgbuild programs into global

import * as ollieos from ".";
import * as howler from "howler";
import * as htmlToText from "html-to-text";
import * as sixel from "sixel";
import * as sweetalert2 from "sweetalert2";
import * as xterm from "@xterm/xterm";
import * as fitAddon from "@xterm/addon-fit";
import * as webLinksAddon from "@xterm/addon-web-links";
import * as imageAddon from "@xterm/addon-image";
import * as xtermLinkProvider from "xterm-link-provider";

globalThis.ollieos = ollieos;
globalThis.howler = howler;
globalThis["html-to-text"] = htmlToText;
globalThis.sixel = sixel;
globalThis.sweetalert2 = sweetalert2;
globalThis["@xterm/xterm"] = xterm;
globalThis["@xterm/addon-fit"] = fitAddon;
globalThis["@xterm/addon-web-links"] = webLinksAddon;
globalThis["@xterm/addon-image"] = imageAddon;
globalThis["xterm-link-provider"] = xtermLinkProvider;

// support old xterm names
globalThis["xterm"] = xterm;
globalThis["xterm-addon-fit"] = fitAddon;
globalThis["xterm-addon-web-links"] = webLinksAddon;
globalThis["xterm-addon-image"] = imageAddon;

console.log("Global externals loaded successfully.");
