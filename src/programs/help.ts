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
            term.writeln(`To persist the variables, define them in the ${PREFABS.file_path}.ollierc${STYLE.reset_all} file in your ${PREFABS.dir_name}home${STYLE.reset_all} directory.`)
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
            const column1 = programs_fmt.filter((_, i) => i <= programs_fmt.length / 2);
            const column2 = programs_fmt.filter((_, i) => i > programs_fmt.length / 2);

            // pair the programs in the 2 columns
            const paired_programs = column1.map((program1, i) => {
                let program2 = column2[i] ?? "";

                const program1_real_length = program1.replace(ANSI_ESCAPE_REGEX, "").length;
                const program2_real_length = program2.replace(ANSI_ESCAPE_REGEX, "").length;

                // if the program name is too long, truncate it
                if (program1_real_length > max_allowable_length) {
                    program1 = program1.slice(0, max_allowable_length / 2 - 3) + "...";
                }
                if (program2_real_length > max_allowable_length) {
                    program2 = program2.slice(0, max_allowable_length / 2 - 3) + "...";
                }

                // pad the programs so that they are both left-aligned
                const padding = " ".repeat(max_allowable_length - program1_real_length);

                return program1 + padding + program2;
            });

            // write the programs to the terminal
            term.writeln(paired_programs.join(NEWLINE));

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