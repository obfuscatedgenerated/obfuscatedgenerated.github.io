import type { Program } from "../types";
import {XTermTerminal} from "../term_impl/xterm";

import xterm_css from "@xterm/xterm/css/xterm.css?raw";

export default {
    name: "windowed_terminal",
    description: "",
    usage_suffix: "[command]",
    arg_descriptions: {
        "command": "The command to run in the terminal. If not provided, defaults to the user's shell."
    },
    compat: "2.0.0",
    hide_from_help: true,
    gui: {
        display_name: "Terminal"
    },
    completion: async () => [],
    main: async (data) => {
        // extract from data to make code less verbose
        const { kernel: userspace_kernel, term, process, args } = data;

        if (!userspace_kernel.has_window_manager()) {
            term.writeln("This program requires a window manager.");
            return 1;
        }

        const kernel = await userspace_kernel.request_privilege("Spawn a new terminal");
        if (!kernel) {
            term.writeln("Privilege request denied.");
            return 1;
        }

        const wind = process.create_window();

        wind.title = "Terminal";

        const terminal_root = document.createElement("div");
        terminal_root.style.width = "100%";
        terminal_root.style.height = "100%";
        terminal_root.style.boxSizing = "border-box";
        terminal_root.style.padding = "0.5em";
        terminal_root.style.background = "black";
        wind.dom.appendChild(terminal_root);

        // add xterm stylesheet
        const xterm_style = document.createElement("style");
        xterm_style.textContent = xterm_css;
        wind.dom.appendChild(xterm_style);

        // add custom stylesheet
        const style = document.createElement("style");
        style.textContent = `
        .xterm .xterm-viewport {
            overflow: hidden !important;
        }
        `;
        wind.dom.appendChild(style);

        const subterm = new XTermTerminal();
        subterm.open(terminal_root);

        // spawn ash/command in the subterm
        // TODO: spawn the preferred shell instead of hardcoding ash
        // TODO: should it be wrapped in ash regardless if custom command
        const command = args[0] || "ash";
        const command_args = args.slice(1) || [];

        let close_exit_code = 0;
        const subproc = kernel.spawn(command, command_args, undefined, false, subterm);
        subproc.completion.then((code) => {
            close_exit_code = code;
            subproc.process.kill(code);
            wind.close();
        });

        process.add_exit_listener((code) => {
            subproc.process.kill(code);
        });

        wind.add_event_listener("close", () => {
            process.kill(close_exit_code);
        });

        wind.show();
        subterm.focus();

        process.detach();
        return 0;
    }
} as Program;

// TODO: worth moving to skylight?
