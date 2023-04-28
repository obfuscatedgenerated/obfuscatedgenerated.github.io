import { ANSI, NEWLINE, ANSI_ESCAPE_REGEX } from "../term_ctl";
import type { SyncProgram, arg_descriptions } from "../types";

export default {
    name: "help",
    description: "List programs or get help for a specific program.",
    usage_suffix: "[command]",
    arg_descriptions: {
        "Arguments:": {
            "command": "The name of the program to get help for.",
        }
    },
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
        const program = data.registry.getProgram(args[0]);

        if (program === undefined) {
            term.writeln(`${PREFABS.error}Could not resolve help for ${args[0]}.${STYLE.reset_all}`);
            return 1;
        }

        term.writeln(`${NEWLINE}${PREFABS.program_name}${program.name}${STYLE.reset_all}`);
        term.writeln(`${program.description}`);
        term.write(NEWLINE);
        term.writeln(`Usage: ${PREFABS.program_name}${program.name}${STYLE.reset_all} ${program.usage_suffix}`);

        if (Object.keys(program.arg_descriptions).length > 0) {
            // recurse each level of nesting
            // each level is a section title, until the innermost object, in which they are pairs of argument name and description.
            // add indents depending on the level of nesting
            const recurse = (descs: arg_descriptions, nest_level: number): string => {
                let output = "";

                for (const [key, value] of Object.entries(descs)) {
                    if (typeof value === "string") {
                        // argument, innermost nest
                        output += `${" ".repeat(nest_level * 4)}${key} - ${value}${NEWLINE}`;
                    } else {
                        // title, deeper nest
                        output += `${NEWLINE}${" ".repeat(nest_level * 4)}${STYLE.bold + STYLE.italic}${key}${STYLE.reset_all}${NEWLINE}`;
                        output += recurse(value, nest_level + 1);
                    }
                }

                return output;
            }
            

            term.write(NEWLINE);
            term.write(recurse(program.arg_descriptions, 0));
        }

        return 0;
    }
} as SyncProgram;