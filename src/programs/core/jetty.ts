import type {Program} from "../../types";
import type {ProcessContext} from "../../processes";
import {ANSI} from "../../term_ctl";

export default {
    name: "jetty",
    description: "TTY init process",
    usage_suffix: "",
    arg_descriptions: {},
    hide_from_help: true,
    compat: "2.0.0",
    main: async (data) => {
        const {kernel, term, process} = data;

        term.reset();

        const fs = kernel.get_fs();

        // determine default shell from /etc/default_shell
        let default_shell = "ash";
        let default_shell_args: string[] = [];

        try {
            const default_shell_data = await fs.read_file("/etc/default_shell") as string;
            default_shell = default_shell_data.trim();
        } catch (e) {
            term.writeln("Warning: /etc/default_shell not found, defaulting to 'ash' shell!");

            // wait 3 seconds
            await new Promise((resolve) => setTimeout(resolve, 3000));
        }

        if (!default_shell) {
            term.writeln("Warning: /etc/default_shell is empty, defaulting to 'ash' shell!");

            // wait 3 seconds
            await new Promise((resolve) => setTimeout(resolve, 3000));
        }

        // separate shell args if any
        const default_shell_parts = default_shell.split(" ");
        default_shell = default_shell_parts[0];

        if (default_shell_parts.length > 1) {
            default_shell_args = default_shell_parts.slice(1);
        }

        let running = true;
        let final_code = 0;
        let current_shell_process: ProcessContext;

        // on exit, force shell to exit too
        // TODO: add process ownership to automatically kill child processes
        const proc_mgr = kernel.get_process_manager();
        process.add_exit_listener(async (exit_code) => {
            if (current_shell_process && proc_mgr.get_process(current_shell_process.pid)) {
                current_shell_process.kill(exit_code);
            }

            final_code = exit_code;
            running = false;
        });

        // execute shell in a respawn loop
        while (running) {
            const shell_proc = kernel.spawn(default_shell, default_shell_args);
            current_shell_process = shell_proc.process;

            let exit_code: number;
            let error: Error | null = null;
            try {
                exit_code = await shell_proc.completion;
                shell_proc.process.kill(exit_code);
            } catch (e) {
                console.error(e);
                error = e as Error;
                exit_code = -1;
            }

            console.log(`default shell ${default_shell} exited with code ${exit_code}`);

            // early break in case jetty is being killed
            if (!running) {
                break;
            }

            term.reset();

            term.writeln(exit_code === 0 ? "Logged out." : `Shell exited with code ${exit_code}!`);

            if (error) {
                term.writeln(`Error details: ${error}`);
            }

            term.writeln(`Press any key to log back in.${ANSI.CURSOR.invisible}`);

            await term.wait_for_keypress();
            term.write(ANSI.CURSOR.visible);

            term.reset();
        }

        return final_code;
    }
} as Program;
