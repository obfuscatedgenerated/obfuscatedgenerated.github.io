import type { Program } from "../../types";

import {recurse_mount_and_register_with_output} from "../../prog_registry";

interface IgnitionIPCMessageBase {
    type: string;
}

interface IgnitionIPCPowerMessage extends IgnitionIPCMessageBase {
    type: "power";
    action: "shutdown" | "reboot";
    hard?: boolean;
}

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

        // open and handle ipc communication
        const ipc = term.get_ipc();

        ipc.service_register("init", process.pid, async (channel_id) => {
            ipc.channel_listen(channel_id, process.pid, async (msg) => {
                const payload = msg.data as IgnitionIPCMessageBase;

                switch (payload.type) {
                    // TODO: handle ipc messages (move to a function)
                    default:
                        ipc.channel_send(channel_id, process.pid, {
                            type: "error",
                            message: `Unknown message type: ${payload.type}`
                        });
                }
            });
        });

        process.add_exit_listener(async (exit_code) => {
            term.panic("ignition process exited unexpectedly!", `Exit code: ${exit_code}`);
        });

        const fs = term.get_fs();

        // mount all programs in any subdirectory of /usr/bin
        // TODO: smarter system that has files to be mounted so any stray js files don't get mounted? or maybe it doesn't matter and is better mounting everything for hackability!
        const usr_bin = fs.absolute("/usr/bin");
        if (await fs.exists(usr_bin)) {
            await recurse_mount_and_register_with_output(fs, usr_bin, term.get_program_registry(), term);
        }

        // execute jetty, respawning it if it exits
        const run_jetty = async () => {
            await term.execute("jetty", true, async (exit_code) => {
                console.warn(`jetty exited with code ${exit_code}, respawning...`);

                // respawn jetty
                run_jetty();
            });
        }

        // await ONLY the first run of jetty
        await run_jetty();

        process.detach(true);
        return 0;
    }
} as Program;
