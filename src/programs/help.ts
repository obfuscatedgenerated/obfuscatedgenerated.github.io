import { ANSI, NEWLINE, ANSI_ESCAPE_REGEX } from "../term_ctl";
import type { Program, arg_descriptions } from "../types";


// deferred to prevent double printing of header if program has to re-execute itself
const header = (term, includes_mounted: boolean) => {
    // write header

    if (!includes_mounted) {
        term.writeln(`${ANSI.STYLE.italic}(Only built-in programs are included. Use the -m flag to include only mounted programs, or the -a flag to include all.)${ANSI.STYLE.reset_all}`);
    }

    term.writeln(`For help on a specific command, type ${ANSI.PREFABS.program_name}help${ANSI.STYLE.reset_all} [command].`)
    term.writeln(`The exit code of the most recently executed program is stored in the ${ANSI.PREFABS.variable_name}$?${ANSI.STYLE.reset_all} variable.`)
    term.writeln(`You can set variables with the syntax ${ANSI.PREFABS.variable_name}variable${ANSI.STYLE.reset_all}=value and unset them with ${ANSI.PREFABS.program_name}unset${ANSI.STYLE.reset_all}.`)
    term.writeln(`To persist the variables, define them in the ${ANSI.PREFABS.file_path}.ollierc${ANSI.STYLE.reset_all} file in your ${ANSI.PREFABS.dir_name}home${ANSI.STYLE.reset_all} directory.`)
    term.writeln(`You can run commands in the background by appending ${ANSI.STYLE.bold}${ANSI.FG.magenta}&${ANSI.STYLE.reset_all} to the end of the command.`)
    term.write(NEWLINE);
}


export default {
    name: "help",
    description: "List programs or get help for a specific program.",
    usage_suffix: "[command | -s] [-a | -m]",
    arg_descriptions: {
        "Arguments:": {
            "command": "The name of the program to get help for.",
        },
        "Flags:": {
            "-s": "Single-column mode. Forces the program list to be displayed in a single column.",
            "-a": "All programs. Includes all programs, built-in and mounted.",
            "-m": "Mounted programs. Includes only mounted programs.",
        },
    },
    compat: "2.0.0",
    completion: async (data) => {
        // TODO smarter completion to handle number of args and flags
        const programs = data.kernel.get_program_registry().listProgramNames();
        return programs.filter((program) => program.startsWith(data.current_partial));
    },
    main: async (data) => {
        // extract from data to make code less verbose
        const { shell, kernel, args, term } = data;

        // extract from ANSI to make code less verbose
        const { STYLE, PREFABS } = ANSI;

        const registry = kernel.get_program_registry();

        let single_column = false;
        let includes_mounted = false;
        let includes_builtin = true;

        // parse and remove flags from args
        for (let i = 0; i < args.length; i++) {
            switch (args[i]) {
                case "-s":
                    single_column = true;
                    args.splice(i, 1);
                    i--;
                    break;
                case "-a":
                    includes_mounted = true;
                    includes_builtin = true;
                    args.splice(i, 1);
                    i--;
                    break;
                case "-m":
                    includes_mounted = true;
                    includes_builtin = false;
                    args.splice(i, 1);
                    i--;
                    break;
            }
        }

        // if no arguments remain, use list mode
        if (args.length === 0) {
            // get program names
            const programs = registry.listProgramNames(includes_builtin, includes_mounted);

            // remove hidden programs
            const visible_programs = programs.filter((program_name) => {
                const program = registry.getProgram(program_name);
                return program !== undefined && !program.hide_from_help;
            });

            // add usage suffix and styling to each program name
            const programs_fmt = visible_programs.map((program) => {
                return `${PREFABS.program_name}${program}${STYLE.reset_all} ${registry.getProgram(program).usage_suffix}`;
            });

            // sort the programs alphabetically (usually already sorted alphabetically by Object.keys, but not guaranteed)
            programs_fmt.sort();


            if (single_column) {
                // FORMAT THE PROGRAMS INTO 1 COLUMN

                header(term, includes_mounted);
                term.writeln(programs_fmt.join(NEWLINE));
            } else {
                // FORMAT THE PROGRAMS INTO 2 COLUMNS


                // get the maximum length of a column
                const max_allowable_length = Math.floor(term.cols / 2) - 1;


                // split the programs into 2 columns
                const column1 = programs_fmt.filter((_, i) => i <= programs_fmt.length / 2);
                const column2 = programs_fmt.filter((_, i) => i > programs_fmt.length / 2);


                // compute the length of the longest program name
                const longest_program_length = Math.max(...programs_fmt.map((program) => program.replace(ANSI_ESCAPE_REGEX, "").length));

                // compute the smallest padding length
                const min_padding_length = max_allowable_length - longest_program_length;

                // if there is negative padding (overlap, terminal too small), re-execute the program in single-column mode
                if (min_padding_length < 0) {
                    term.writeln("Terminal too small to display programs in 2 columns. Re-executing in single-column mode.");
                    term.write(NEWLINE);
                    
                    const new_args = ["-s"];

                    if (includes_mounted) {
                        new_args.push("-m");
                    }

                    if (includes_builtin) {
                        new_args.push("-a");
                    }
                    
                    return await kernel.spawn("help", new_args, shell).completion;
                }


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
                header(term, includes_mounted);
                term.writeln(paired_programs.join(NEWLINE));
            }

            return 0;
        }

        // if an argument remains, get help for it
        const program = registry.getProgram(args[0]);

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
} as Program;