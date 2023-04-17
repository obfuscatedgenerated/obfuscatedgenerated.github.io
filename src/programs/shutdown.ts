import type { Program } from "../types";

export default {
    name: "shutdown",
    description: "Stops the OS.",
    usage_suffix: " [-r]",
    flags: {
        "-r": "Reboot the terminal."
    },
    main: (data) => {
        // extract from data to make code less verbose
        const { ANSI, args, term } = data;

        // extract from ANSI to make code less verbose
        const { FG, STYLE } = ANSI;

        switch (args[0]) {
            case undefined:
                term.writeln(`${FG.red}Shutting down...${STYLE.reset_all}`);

                setTimeout(() => {
                    term.dispose();
                }, 1000);
                break;
            case "-r":
                term.writeln(`${FG.red}Rebooting...${STYLE.reset_all}`);

                setTimeout(() => {
                    window.location.reload();
                }, 1000);
                break;
            default:
                term.writeln(`${FG.red}Invalid argument: ${args[0]}${STYLE.reset_all}`);
                return 1;
        }

        return 0;
    }
} as Program;