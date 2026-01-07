import type { Program } from "../../types";
import {recurse_mount_and_register_with_output} from "../../prog_registry";
import {ANSI, NEWLINE} from "../../term_ctl";
export default {
    name: "ignition",
    description: "System init process",
    usage_suffix: "",
    arg_descriptions: {},
    hide_from_help: true,
    main: async (data) => {
        const { term, process } = data;

        // check if ignition is already running (only allowed to be PID 1)
        if (process.pid !== 1) {
            term.writeln("Cannot run ignition.");
            return 1;
        }

        const fs = term.get_fs();

        // enable screen reader mode if stored in local storage
        if (localStorage.getItem("reader") === "true") {
            await term.execute("reader -s on");
        }

        // run .ollie_profile if it exists
        const absolute_profile = fs.absolute("~/.ollie_profile");
        await term.run_script(absolute_profile);

        // mount all programs in any subdirectory of /usr/bin
        // TODO: smarter system that has files to be mounted so any stray js files don't get mounted? or maybe it doesn't matter and is better mounting everything for hackability!
        const usr_bin = fs.absolute("/usr/bin");
        if (await fs.exists(usr_bin)) {
            await recurse_mount_and_register_with_output(fs, usr_bin, term.get_program_registry(), this);
        }

        // run .ollierc if it exists (TODO: make shells and the OS different things! right now the difference is .ollierc runs after mounting so theres that)
        const absolute_rc = fs.absolute("~/.ollierc");
        await term.run_script(absolute_rc);

        process.add_exit_listener(async (exit_code) => {
            // TODO: panic here?
            term.reset();
            term.writeln(`${ANSI.BG.red + ANSI.FG.white}Critical Error: ignition process was killed. The terminal may not function correctly.`);

            term.write(NEWLINE);
            term.writeln("Debug info:");
            term.writeln(`ignition exited with code ${exit_code}`);
            term.writeln(`at time: ${new Date().toISOString()}`);

            term.write(NEWLINE);
            term.writeln("Processes running at time of ignition exit:");

            const proc = term.get_process_manager();
            const pids = proc.list_pids();
            for (const pid of pids) {
                const p = proc.get_process(pid);

                if (p) {
                    term.writeln(`- PID ${p.pid}: ${p.source_command.command} (started at ${p.created_at.toISOString()})`);
                }
            }

            term.writeln(ANSI.STYLE.reset_all);
        });

        process.detach(true);
        return 0;
    }
} as Program;
