import type { Program } from "../../types";
import type {PrivilegeAgentRequest, PrivilegeRequestKind} from "../../kernel";

import {ANSI, NEWLINE} from "../../lib/ansi";

export interface RequestStyle {
    title: string;
    background: string;
    // finishes "Process PID n (command) ..."
    asking: string;
    // whether the reason came from the program, rather than being written by the kernel
    reason_from_program: boolean;
    consequence: string;
    question: string;
}

// each kind looks different, so a request for less (e.g. reaching local services) is never mistaken for kernel access, and the reverse
export const REQUEST_STYLES: Record<PrivilegeRequestKind, RequestStyle> = {
    kernel: {
        title: "KERNEL PRIVILEGE REQUEST",
        background: ANSI.BG.blue,
        asking: "is requesting elevated kernel privileges.",
        reason_from_program: true,
        consequence: "Granting this request will allow the process full access to the kernel, which may compromise system security and stability. It may also be able to temporarily share this access with other running processes.",
        question: "Do you wish to grant elevated privileges to",
    },
    kernel_func: {
        title: "KERNEL FUNCTION REQUEST",
        background: ANSI.BG.magenta,
        asking: "is requesting to run one of its functions with kernel access.",
        reason_from_program: true,
        consequence: "Granting this request will run that function with full access to the kernel, which may compromise system security and stability. The access ends when the function returns.",
        question: "Do you wish to let this function run for",
    },
    loopback: {
        title: "DEVICE SERVICES REQUEST",
        background: ANSI.BG.cyan,
        asking: "is requesting access to services running on this device.",
        reason_from_program: false,
        consequence: "Granting this request will let the process connect to services on this device (localhost) while it runs. It doesn't give the process any other access, including to the kernel.",
        question: "Do you wish to allow device services for",
    },
    confirm: {
        title: "CONFIRMATION",
        background: ANSI.BG.gray,
        asking: "is asking you to confirm an action.",
        reason_from_program: false,
        consequence: "This doesn't give the process any other access.",
        question: "Do you wish to allow this for",
    },
};

export default {
    name: "default_privilege_agent",
    description: "Default agent for handling kernel privilege requests",
    usage_suffix: "",
    arg_descriptions: {},
    hide_from_help: true,
    compat: "3.0.0",
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
            listening = await ipc.channel_listen(channel_id, async (msg) => {
                if (handling_request) {
                    // already handling a request, ignore new ones
                    return;
                }

                handling_request = true;

                const {process, reason, kind} = msg.data as PrivilegeAgentRequest;

                // agents predate kinds, so anything unknown is treated as the most serious
                const style = REQUEST_STYLES[kind] ?? REQUEST_STYLES.kernel;

                // immediately acknowledge the request is being handled
                ipc.channel_send(channel_id, {
                    process,
                    handling: true
                });

                term.writeln(`${NEWLINE}${ANSI.STYLE.bold}${style.background}${ANSI.FG.white}${style.title}${ANSI.STYLE.reset_all}${ANSI.BG.gray}${NEWLINE}`);

                term.writeln(`Process PID ${process.pid} (${process.source_command.command}) ${style.asking}`);

                if (style.reason_from_program) {
                    term.writeln(`The process gave the following reason for the request:${NEWLINE}`);
                    term.writeln(`${ANSI.STYLE.bold}${ANSI.FG.yellow}"${reason}"${ANSI.FG.reset}${ANSI.STYLE.no_bold_or_dim}${NEWLINE}`);
                } else {
                    term.writeln(`${NEWLINE}${ANSI.STYLE.bold}${ANSI.FG.yellow}${reason}${ANSI.FG.reset}${ANSI.STYLE.no_bold_or_dim}${NEWLINE}`);
                }

                term.writeln(style.consequence);

                term.writeln(`${NEWLINE}${style.question} PID ${process.pid}? (y/n)${ANSI.STYLE.reset_all}${ANSI.CURSOR.invisible}`);

                const event = await term.wait_for_keypress();
                term.write(ANSI.CURSOR.visible);

                if (event.key.toLowerCase() === "y") {
                    term.writeln(`${NEWLINE}${ANSI.BG.green}${ANSI.FG.white}Request granted.${ANSI.STYLE.reset_all}${NEWLINE}`);
                    ipc.channel_send(channel_id, {
                        process,
                        granted: true
                    });
                } else {
                    term.writeln(`${NEWLINE}${ANSI.BG.red}${ANSI.FG.white}Request denied.${ANSI.STYLE.reset_all}${NEWLINE}`);
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
} satisfies Program;
