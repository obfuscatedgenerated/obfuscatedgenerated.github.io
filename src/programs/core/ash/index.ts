import type {Program} from "../../../types";

import {AshShell} from "./core";
import {make_read_line_key_handlers, make_read_line_printable_handler} from "./key_handlers";

const detect_node = () => {
    try {
        return (typeof process !== "undefined") && (process.release.name === "node");
    } catch {
        return false;
    }
}

export default {
    name: "ash",
    description: "A shell.",
    usage_suffix: "",
    arg_descriptions: {},
    main: async (data) => {
        const {term, process} = data;

        const shell = new AshShell(term);

        shell.memory.set_variable("VERSION", document.body.dataset.version);
        shell.memory.set_variable("ENV", detect_node() ? "node" : "web");

        const fs = term.get_fs();

        // run .ollierc if it exists
        const absolute_rc = fs.absolute("~/.ollierc");
        await shell.run_script(absolute_rc);

        let running = true;
        let final_code = 0;
        process.add_exit_listener((exit_code) => {
            final_code = exit_code;
            running = false;
        });

        const read_line_key_handlers = make_read_line_key_handlers(shell);
        const read_line_printable_handler = make_read_line_printable_handler(shell);

        while (running) {
            await shell.insert_prompt(true);

            const input = await term.read_line(read_line_key_handlers, read_line_printable_handler);
            if (!input.trim()) {
                continue;
            }

            shell.memory.add_history_entry(input);
            await shell.execute(input);
        }

        return final_code;
    }
} as Program;
