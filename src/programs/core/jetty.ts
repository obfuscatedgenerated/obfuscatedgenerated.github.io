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

        // TODO: get these to work again, may need a mini shell implementation
        // // enable screen reader mode if stored in local storage
        // if (localStorage.getItem("reader") === "true") {
        //     await term.execute("reader -s on");
        // }

        // // run .ollie_profile if it exists
        // const absolute_profile = fs.absolute("~/.ollie_profile");
        // await term.run_script(absolute_profile);

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
            const shell_proc = kernel.spawn("ash", []);
            current_shell_process = shell_proc.process;

            const exit_code = await shell_proc.completion;

            if (exit_code === 0) {
                running = false;
            }

            console.log(`ash exited with code ${exit_code}`);
        }

        return final_code;
    }
} as Program;
