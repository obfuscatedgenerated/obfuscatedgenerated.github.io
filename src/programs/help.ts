import { ANSI, NEWLINE, ANSI_ESCAPE_REGEX } from "../term_ctl";
import type { SyncProgram } from "../types";

export default {
    name: "help",
    description: "List programs or get help for a specific program.",
    usage_suffix: "[command]",
    flags: {},
    main: (data) => {
        // extract from data to make code less verbose
        const { args, term } = data;

        // extract from ANSI to make code less verbose
        const { STYLE, PREFABS } = ANSI;
        
        // if no arguments are given, list all programs in 2 columns, depending on the terminal's columns
        if (args.length === 0) {
            // write header
            term.writeln(`For help on a specific command, type ${PREFABS.program_name}help${STYLE.reset_all} [command].`)
            term.writeln(`The exit code of the most recently executed program is stored in the ${PREFABS.variable_name}$?${STYLE.reset_all} variable.`)
            term.writeln(`You can set variables with the syntax ${PREFABS.variable_name}variable${STYLE.reset_all}=value and unset them with ${PREFABS.program_name}unset${STYLE.reset_all}.`)
            term.write(NEWLINE);

            // get all program names
            const programs = Object.keys(data.registry.programs);

            // add usage suffix and styling to each program name
            const programs_fmt = programs.map((program) => {
                return `${PREFABS.program_name}${program}${STYLE.reset_all} ${data.registry.programs[program].usage_suffix}`;
            });

            // sort the programs alphabetically (usually already sorted alphabetically by Object.keys, but not guaranteed)
            programs_fmt.sort();

            // get the maximum length of a column
            const max_allowable_length = Math.floor(term.cols / 2) - 1;
            
            // split the programs into 2 columns
            const column1 = programs_fmt.filter((_, i) => i % 2 === 0);
            const column2 = programs_fmt.filter((_, i) => i % 2 === 1);

            // pad the programs in each column to the maximum length
            const column1_formatted = column1.map((program) => {
                // get program length whilst ignoring ANSI escape codes
                const program_length = program.replace(ANSI_ESCAPE_REGEX, "").length;

                if (program_length > max_allowable_length) {
                    return program.slice(0, max_allowable_length - 3) + "...";
                }

                return program.padEnd(max_allowable_length - program_length, " ");
            });

            const column2_formatted = column2.map((program) => {
                const program_length = program.replace(ANSI_ESCAPE_REGEX, "").length;

                if (program_length > max_allowable_length) {
                    return program.slice(0, max_allowable_length - 3) + "...";
                }

                return program.padEnd(max_allowable_length - program_length, " ");
            });

            // write the programs to the terminal
            for (let i = 0; i < column1_formatted.length; i++) {
                term.writeln(`${column1_formatted[i]}\t${column2_formatted[i] || ""}`);
            }

            return 0;
        }

        // if arguments are given, get help for the first argument
        const program = data.registry.programs[args[0]];

        if (program === undefined) {
            term.writeln(`${PREFABS.error}Could not resolve help for ${args[0]}.${STYLE.reset_all}`);
            return 1;
        }

        term.writeln(`${PREFABS.program_name}${program.name}${STYLE.reset_all}`);
        term.writeln(`${program.description}`);
        term.write(NEWLINE);
        term.writeln(`Usage: ${PREFABS.program_name}${program.name}${STYLE.reset_all} ${program.usage_suffix}`);

        if (Object.keys(program.flags).length > 0) {
            term.write(NEWLINE);
            term.writeln("Flags:");
            for (const [flag, description] of Object.entries(program.flags)) {
                term.writeln(`  ${flag}${STYLE.reset_all}\t${description}`);
            }
        }

        return 0;
    }
} as SyncProgram;