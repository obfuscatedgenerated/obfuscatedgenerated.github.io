import type {Program} from "../../../types";
import {NEWLINE} from "../../../term_ctl";

import {AshShell} from "./core";
import {make_read_line_key_handlers, make_read_line_printable_handler} from "./key_handlers";

export default {
    name: "ash",
    description: "A shell.",
    usage_suffix: "[--login] [--no-scripts]",
    arg_descriptions: {
        "Arguments:": {
            "--login": "Start the shell as a login shell. Don't pass this flag manually, it's handled by the system.",
            "--no-scripts": "Do not run any startup scripts like .ashrc or .ash_profile."
        }
    },
    compat: "2.0.0",
    main: async (data) => {
        const {kernel, term, process, args} = data;

        const shell = new AshShell(term, kernel);

        const env_info = kernel.get_env_info();
        shell.memory.set_variable("VERSION", env_info.version);
        shell.memory.set_variable("ENV", env_info.env);

        const fs = kernel.get_fs();

        const absolute_profile = fs.absolute("~/.ash_profile");
        const absolute_rc = fs.absolute("~/.ashrc");

        // create .ash_profile file if it doesn't exist
        const profile_content = `# ash configuration file${NEWLINE}# This file is run at login.${NEWLINE}${NEWLINE}cat /etc/motd.txt${NEWLINE}echo "OllieOS v$VERSION ($ENV)"${NEWLINE}`;
        if (!(await fs.exists(absolute_profile))) {
            await fs.write_file(absolute_profile, profile_content);
        }

        // create .ashrc file if it doesn't exist
        const rc_content = `# ash configuration file${NEWLINE}# This file is run when a shell is created.${NEWLINE}${NEWLINE}`;
        if (!(await fs.exists(absolute_rc))) {
            await fs.write_file(absolute_rc, rc_content);
        }

        if (args.includes("--login")) {
            // enable screen reader mode if stored in local storage
            if (localStorage.getItem("reader") === "true") {
                await shell.execute("reader -s on");
            }

            // run .ash_profile, checking it exists again just in case (because why not)
            if (!args.includes("--no-scripts") && await fs.exists(absolute_profile)) {
                await shell.run_script(absolute_profile);
            }
        }

        // run .ashrc, checking it exists again just in case (could be deleted in profile)
        if (!args.includes("--no-scripts") && await fs.exists(absolute_rc)) {
            await shell.run_script(absolute_rc);
        }

        let running = true;
        let final_code = 0;
        process.add_exit_listener((exit_code) => {
            final_code = exit_code;
            running = false;
        });

        const read_line_key_handlers = make_read_line_key_handlers(shell, kernel);
        const read_line_printable_handler = make_read_line_printable_handler(shell);

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
