import {ANSI} from "../term_ctl";
import type { Program } from "../types";

export default {
    name: "kill",
    description: "Kill a process by its PID.",
    usage_suffix: "PID",
    arg_descriptions: {
        "Arguments:": {
            "PID": "The PID of the process to kill."
        }
    },
    completion: async () => [],
    main: async (data) => {
        // extract from data to make code less verbose
        const { term } = data;

        // extract from ANSI to make code less verbose
        const { STYLE, PREFABS } = ANSI;

        if (data.args.length !== 1) {
            term.writeln(`${PREFABS.error}Exactly one argument (PID) expected.${STYLE.reset_all}`);
            return 1;
        }

        // TODO: support more kill signals as arguments

        // get process manager
        const pm = term.get_process_manager();
        const pid = parseInt(data.args[0]);

        if (isNaN(pid)) {
            term.writeln(`${PREFABS.error}Invalid PID provided.${STYLE.reset_all}`);
            return 1;
        }

        const process = pm.get_process(pid);
        if (!process) {
            term.writeln(`${PREFABS.error}No process found with PID ${pid}.${STYLE.reset_all}`);
            return 1;
        }

        process.kill(143); // SIGTERM
        return 0;
    }
} as Program;
