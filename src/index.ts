import { WrappedTerminal } from "./term_ctl";
import "xterm/css/xterm.css";

import { FitAddon } from "xterm-addon-fit";
import { WebLinksAddon } from "xterm-addon-web-links";

const term = new WrappedTerminal();

const fit = new FitAddon();
term.loadAddon(fit);
term.loadAddon(new WebLinksAddon());

const render = <HTMLElement>document.querySelector("#terminal");
term.open(render);
fit.fit();

term.focus();
