import { ANSI } from "../kernel/term_ctl";
import type { Program } from "../types";

export default {
    name: "shutdown",
    description: "Stops the OS.",
    usage_suffix: "[-h] [-r] [-t ms]",
    arg_descriptions: {
        "Flags:": {
            "-h": "Show this help message.",
            "-r": "Reboot the terminal.",
            "-t": "Set the time before shutdown in milliseconds. Default is 1000."
        }
    },
    compat: "2.0.0",
    // TODO: completion
    main: async (data) => {
        // extract from data to make code less verbose
        const { kernel, shell, args, term, process } = data;

        // extract from ANSI to make code less verbose
        const { FG, STYLE } = ANSI;

        let time = 1000;
        let restart = false;

        for (const arg of args) {
            switch (arg) {
                case "-h": {
                    const spawn_result = kernel.spawn("help", ["shutdown"], shell);
                    const exit_code = await spawn_result.completion;
                    spawn_result.process.kill(exit_code);
                    return exit_code;
                }
                case "-r":
                    restart = true;
                    break;
                case "-t": {
                    // get the next argument
                    const time_arg = args[args.indexOf(arg) + 1];
                    if (time_arg === undefined) {
                        term.writeln(`${FG.red}Invalid argument: ${arg}${STYLE.reset_all}`);
                        return 1;
                    }

                    // parse the time
                    const parsed_time = parseInt(time_arg);
                    if (isNaN(parsed_time)) {
                        term.writeln(`${FG.red}Invalid argument: ${arg}${STYLE.reset_all}`);
                        return 1;
                    }

                    time = parsed_time;

                    // skip the next argument
                    args.splice(args.indexOf(arg) + 1, 1);
                    break;
                }
                default:
                    term.writeln(`${FG.red}Invalid argument: ${arg}${STYLE.reset_all}`);
                    return 1;
            }
        }

        if (restart) {
            term.writeln(`${FG.red}Restarting...${STYLE.reset_all}`);
        } else {
            term.writeln(`${FG.red}Shutting down...${STYLE.reset_all}`);
        }

        process.create_timeout(() => {
            // talk to ignition over ipc
            const ipc = kernel.get_ipc();
            const channel_id = ipc.create_channel("init");

            if (!channel_id) {
                term.writeln(`${FG.red}Failed to communicate with ignition.${STYLE.reset_all}`);
                return;
            }

            ipc.channel_send(channel_id, {
                type: "power",
                action: restart ? "reboot" : "shutdown",
            });
        }, time);

        // hang the terminal until it is shut down or restarted (dont allow any more commands)
        // await an event that will never happen
        await new Promise(() => {});
    }
} as Program;

