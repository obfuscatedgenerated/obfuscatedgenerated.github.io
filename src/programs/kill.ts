import {ANSI} from "../term_ctl";
import type { Program } from "../types";
import {helper_completion_options} from "./core/ash/tab_completion";

export default {
    name: "kill",
    description: "Kill a process by its PID.",
    usage_suffix: "PID",
    arg_descriptions: {
        "Arguments:": {
            "PID": "The PID of the process to kill."
        }
    },
    completion: async (data) => {
        if (data.arg_index === 0) {
            const pm = data.kernel.get_process_manager();
            const pids = pm.list_pids().map((pid) => pid.toString());
            return helper_completion_options(pids)(data);
        }

        return [];
    },
    main: async (data) => {
        // extract from data to make code less verbose
        const { kernel, term } = data;

        // extract from ANSI to make code less verbose
        const { STYLE, PREFABS } = ANSI;

        if (data.args.length !== 1) {
            term.writeln(`${PREFABS.error}Exactly one argument (PID) expected.${STYLE.reset_all}`);
            return 1;
        }

        // TODO: support more kill signals as arguments

        // get process manager
        const pm = kernel.get_process_manager();
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

// TODO: move this to be literal SIGTERM and SIGKILL signals sent to processes
