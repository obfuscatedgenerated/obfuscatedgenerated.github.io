import type {Program} from "../../types";
import type {ProcessContext} from "../../processes";

export default {
    name: "jetty",
    description: "TTY init process",
    usage_suffix: "",
    arg_descriptions: {},
    hide_from_help: true,
    main: async (data) => {
        const {kernel, term, process} = data;

        term.reset();

        const fs = kernel.get_fs();

        // determine default shell from /etc/default_shell
        let default_shell = "ash";

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
            const shell_proc = kernel.spawn(default_shell, ["--login"]);
            current_shell_process = shell_proc.process;

            const exit_code = await shell_proc.completion;

            if (exit_code === 0) {
                running = false;
            }

            console.log(`default shell ${default_shell} exited with code ${exit_code}`);
        }

        return final_code;
    }
} as Program;
