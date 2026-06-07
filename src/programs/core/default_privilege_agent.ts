import type { Program } from "../../types";
import type {UserspaceOtherProcessContext} from "../../kernel/processes";

import {ANSI, NEWLINE} from "../../kernel/term_ctl";

interface PrivilegeRequestMessage {
    process: UserspaceOtherProcessContext;
    reason: string;
}

export default {
    name: "default_privilege_agent",
    description: "Default agent for handling kernel privilege requests",
    usage_suffix: "",
    arg_descriptions: {},
    hide_from_help: true,
    compat: "2.0.0",
    main: async (data) => {
        const { kernel, term, args, process: my_process } = data;

        // expect arg for channel id
        const channel_id_str = args[0];
        if (!channel_id_str) {
            term.writeln("Error in privilege agent: No channel ID provided.");
            return 1;
        }

        const channel_id = parseInt(channel_id_str, 10);
        if (isNaN(channel_id)) {
            term.writeln("Error in privilege agent: Invalid channel ID.");
            return 1;
        }

        // listen to the channel
        const ipc = kernel.get_ipc();

        let finished = false;
        let handling_request = false;

        let listening = false;
        let retries = 0;

        // retry until we can listen to the channel (may be some delay between process start and channel assignment)
        while (!listening && retries < 20) {
            listening = ipc.channel_listen(channel_id, async (msg) => {
                if (handling_request) {
                    // already handling a request, ignore new ones
                    return;
                }

                handling_request = true;

                const {process, reason} = msg.data as PrivilegeRequestMessage;

                // immediately acknowledge the request is being handled
                ipc.channel_send(channel_id, {
                    process,
                    handling: true
                });

                term.writeln(`${NEWLINE}${ANSI.STYLE.bold}${ANSI.BG.blue}${ANSI.FG.white}KERNEL PRIVILEGE REQUEST${ANSI.STYLE.reset_all}${ANSI.BG.gray}${NEWLINE}`);

                term.writeln(`Process PID ${process.pid} (${process.source_command.command}) is requesting elevated kernel privileges.`);
                term.writeln(`The process gave the following reason for the request:${NEWLINE}`);

                term.writeln(`${ANSI.STYLE.bold}${ANSI.FG.yellow}"${reason}"${ANSI.FG.reset}${ANSI.STYLE.no_bold_or_dim}${NEWLINE}`);

                term.writeln("Granting this request will allow the process full access to the kernel, which may compromise system security and stability.");
                term.writeln("It may also be able to temporarily share this access with other running processes.");

                term.writeln(`${NEWLINE}Do you wish to grant elevated privileges to PID ${process.pid}? (y/n)${ANSI.STYLE.reset_all}${ANSI.CURSOR.invisible}`);

                const event = await term.wait_for_keypress();
                term.write(ANSI.CURSOR.visible);

                if (event.key.toLowerCase() === "y") {
                    term.writeln(`${NEWLINE}${ANSI.BG.green}${ANSI.FG.white}Privilege request granted.${ANSI.STYLE.reset_all}${NEWLINE}`);
                    ipc.channel_send(channel_id, {
                        process,
                        granted: true
                    });
                } else {
                    term.writeln(`${NEWLINE}${ANSI.BG.red}${ANSI.FG.white}Privilege request denied.${ANSI.STYLE.reset_all}${NEWLINE}`);
                    ipc.channel_send(channel_id, {
                        process,
                        granted: false
                    });
                }

                // the kernel should kill the agent when ready, rather than exiting possibly early (race condition)
                //finished = true;
            });

            if (!listening) {
                // wait a bit before retrying
                await new Promise(resolve => setTimeout(resolve, 50));
                retries++;
            }
        }

        if (!listening) {
            term.writeln("Error in privilege agent: Failed to listen to channel after multiple attempts.");
            return 1;
        }

        my_process.add_exit_listener(() => {
            finished = true;
        });

        // wait to handle for up to 10 seconds
        // overall timeout up to 60 seconds
        const start_time = Date.now();
        // TODO: clean up logic here
        while ((Date.now() - start_time) < 60000 && !finished && (handling_request || (Date.now() - start_time) < 10000)) {
            const timeout_id = my_process.create_timeout(() => {}, 100);
            await my_process.wait_for_timeout(timeout_id);
        }

        return 0;
    }
} as Program;
