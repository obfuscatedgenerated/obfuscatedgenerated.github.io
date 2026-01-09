import type {Program} from "../../../types";

import {AshShell} from "./core";
import {make_read_line_key_handlers, make_read_line_printable_handler} from "./key_handlers";
import {apply_special_vars} from "../../../abstract_shell";

export default {
    name: "ash",
    description: "A shell.",
    usage_suffix: "[--login]",
    arg_descriptions: {
        "Arguments:": {
            "--login": "Start the shell as a login shell. Don't pass this flag manually, it's handled by the system."
        }
    },
    main: async (data) => {
        const {kernel, term, process, args} = data;

        const shell = new AshShell(term, kernel);
        apply_special_vars(shell);

        const fs = kernel.get_fs();

        if (args.includes("--login")) {
            // enable screen reader mode if stored in local storage
            if (localStorage.getItem("reader") === "true") {
                await shell.execute("reader -s on");
            }

            // run .ollie_profile if it exists
            const absolute_profile = fs.absolute("~/.ollie_profile");
            await shell.run_script(absolute_profile);
        }

        // run .ollierc if it exists
        const absolute_rc = fs.absolute("~/.ollierc");
        await shell.run_script(absolute_rc);

        let running = true;
        let final_code = 0;
        process.add_exit_listener((exit_code) => {
            final_code = exit_code;
            running = false;
        });

        const read_line_key_handlers = make_read_line_key_handlers(shell, kernel);
        const read_line_printable_handler = make_read_line_printable_handler(shell);

        term.focus();

        while (running) {
            await shell.insert_prompt(true);

            const input = await term.read_line(read_line_key_handlers, read_line_printable_handler);
            if (!input.trim()) {
                continue;
            }

            // TODO: have an actual builtin processor instead of just reading input here
            if (input === "exit") {
                running = false;
                break;
            }

            shell.memory.add_history_entry(input);
            await shell.execute(input);
        }

        return final_code;
    }
} as Program;
