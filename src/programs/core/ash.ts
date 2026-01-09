import type {Program} from "../../types";

export default {
    name: "ash",
    description: "A shell.",
    usage_suffix: "",
    arg_descriptions: {},
    main: async (data) => {
        const {term, process} = data;

        const fs = term.get_fs();

        // run .ollierc if it exists
        const absolute_rc = fs.absolute("~/.ollierc");
        await term.run_script(absolute_rc);

        let running = true;
        let final_code = 0;
        process.add_exit_listener((exit_code) => {
            final_code = exit_code;
            running = false;
        });

        while (running) {
            await new Promise<void>((resolve) => {
                setTimeout(resolve, 1000);
            });
        }

        return final_code;
    }
} as Program;
