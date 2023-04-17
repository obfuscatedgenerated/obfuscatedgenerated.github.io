import type { Program } from "../types";

export default {
    name: "help",
    description: "List programs or get help for a specific program.",
    usage_suffix: " [command]",
    flags: {},
    main: (data) => {
        // extract from data to make code less verbose
        const { ANSI, args, term } = data;

        // extract from ANSI to make code less verbose
        const { STYLE, PREFABS } = ANSI;

        // TODO: generate automatically using registry
        if (args.length === 0) {
            term.writeln(`${PREFABS.program_name}help${STYLE.reset_all} - List programs or get help for a specific program.`);
            term.writeln(`${PREFABS.program_name}clear${STYLE.reset_all} - Clear the terminal.`);
            term.writeln(`${PREFABS.program_name}shutdown${STYLE.reset_all} - Exit the terminal.`);
            term.writeln(`${PREFABS.program_name}ls${STYLE.reset_all} - List files in the current directory.`);
            term.writeln(`${PREFABS.program_name}cd${STYLE.reset_all} - Change the current directory.`);
        } else {
            switch (args[0]) {
                case "help":
                    term.writeln(`Usage: ${PREFABS.program_name}help${STYLE.reset_all} [command]`);
                    term.writeln(`Displays a list of commands or help for a specific command.`);
                    break;
                case "clear":
                    term.writeln(`Usage: ${PREFABS.program_name}clear${STYLE.reset_all}`);
                    term.writeln(`Clears the terminal.`);
                    break;
                case "shutdown":
                    term.writeln(`Usage: ${PREFABS.program_name}shutdown${STYLE.reset_all} [-r]`);
                    term.writeln(`Exits the terminal.`);
                    term.writeln(`  -r  Reboot the terminal.`);
                    break;
                default:
                    term.writeln(`${PREFABS.error}Could not resolve help for ${args[0]}.${STYLE.reset_all}`);
                    return 1;
            }
        }

        return 0;
    }
} as Program;