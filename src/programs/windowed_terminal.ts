import type {KernelFuncs, Program} from "../types";
import {XTermTerminal} from "../term_impl/xterm";

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
        display_name: "Terminal",
        icon_path: "/var/lib/icons/windowed_terminal.svg"
    },
    completion: async () => [],
    main: async (data) => {
        // TODO: eventually this wont need privilege

        // extract from data to make code less verbose
        const { kernel, term, process, args } = data;

        if (!kernel.has_window_manager()) {
            term.writeln("This program requires a window manager.");
            return 1;
        }

        // TODO: spawn the preferred shell instead of hardcoding ash
        // TODO: should it be wrapped in ash regardless if custom command
        const command = args[0] || "ash";
        const command_args = args.slice(1);

        try {
            await kernel.request_kernel_func("open_terminal", "Spawn a new terminal", {command, command_args});
        } catch (e) {
            if (e.name !== "NotAllowedError") {
                throw e;
            }

            term.writeln("Privilege request denied.");
            return 1;
        }

        process.detach();
        return 0;
    }
} satisfies Program<typeof kernel_funcs>;

export const kernel_funcs = {
    // the terminal needs the real kernel to spawn a process attached to a terminal of its own
    open_terminal: async ({kernel, process}, input: {command: string, command_args: string[]}) => {
        // input comes from userspace, so nothing about it is assumed
        if (typeof input?.command !== "string" || !Array.isArray(input.command_args) || !input.command_args.every((arg) => typeof arg === "string")) {
            throw new TypeError("open_terminal expects a command and its string arguments");
        }

        const {command, command_args} = input;

        const wind = process.create_window();

        wind.title = "Terminal";

        wind.x = "10vw";
        wind.y = "10vh";

        const terminal_root = document.createElement("div");
        terminal_root.style.width = "100%";
        terminal_root.style.height = "100%";
        terminal_root.style.boxSizing = "border-box";
        terminal_root.style.padding = "0.5em";
        terminal_root.style.background = "black";
        wind.dom.appendChild(terminal_root);

        // add custom stylesheet
        const style = document.createElement("style");
        style.textContent = `
        .xterm .xterm-viewport {
            overflow: hidden !important;
        }
        `;
        wind.dom.appendChild(style);

        const subterm = new XTermTerminal();

        // add xterm stylesheet
        const xterm_style = document.createElement("style");
        xterm_style.textContent = subterm.css;
        wind.dom.appendChild(xterm_style);

        subterm.open(terminal_root);

        // TODO: update title to reflect live command rather than just initial (maybe some custom shell hooking?)

        // spawn the command in the subterm
        wind.title = `Terminal - ${command}`;

        let close_exit_code = 0;
        const subproc = await kernel.spawn(process, command, command_args, undefined, false, subterm);
        subproc.completion.then(async (code) => {
            close_exit_code = code;
            subproc.process.kill(code);

            // get the gui props of the command
            const program_search = await kernel.find_program(command);
            if (!program_search) {
                // program no longer exists, just close the window
                wind.close();
                return;
            }

            const program = program_search.metadata;

            // determine whether to keep the terminal open based on the program's gui props and exit code (default: on_error)
            const keep_open_value = program?.gui?.keep_terminal_open_after_run || "on_error";
            const stay_open = keep_open_value === "always" || (keep_open_value === "on_error" && code !== 0);

            if (!stay_open) {
                wind.close();
            } else {
                subterm.writeln(`\r\nProcess exited with code ${code}. Press any key to close.`);
                await subterm.wait_for_keypress();
                wind.close();
            }
        });

        process.add_exit_listener((code) => {
            subproc.process.kill(code);
        });

        wind.add_event_listener("close", () => {
            process.kill(close_exit_code);
        });

        wind.show();
        subterm.focus();
    },
} satisfies KernelFuncs;

// TODO: worth moving to skylight?
