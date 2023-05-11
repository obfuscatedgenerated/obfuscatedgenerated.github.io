import { ANSI } from "../term_ctl";
import type { AsyncProgram } from "../types";

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
    async_main: async (data) => {
        // extract from data to make code less verbose
        const { args, term } = data;

        // extract from ANSI to make code less verbose
        const { FG, STYLE } = ANSI;

        let time = 1000;
        let restart = false;

        for (const arg of args) {
            switch (arg) {
                case "-h":
                    term.execute("help shutdown");
                    return 0;
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

        setTimeout(() => {
            if (restart) {
                window.location.reload();
            } else {
                term.dispose();
            }
        }, time);

        // hang the terminal until it is shut down or restarted (dont allow any more commands)
        // await an event that will never happen
        await new Promise(() => {});
    }
} as AsyncProgram;