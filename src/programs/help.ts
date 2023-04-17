import type { Program } from "../types";

export default {
    name: "help",
    description: "List programs or get help for a specific program.",
    usage_suffix: "[command]",
    flags: {},
    main: (data) => {
        // extract from data to make code less verbose
        const { ANSI, NEWLINE, args, term } = data;

        // extract from ANSI to make code less verbose
        const { STYLE, PREFABS } = ANSI;
        
        // if no arguments are given, list all programs in 2 columns, depending on the terminal's columns
        if (args.length === 0) {
            // get all program names
            const programs = Object.keys(data.registry.programs);

            // add usage suffix to each program name
            const programs_with_usage = programs.map((program) => {
                return `${program} ${data.registry.programs[program].usage_suffix}`;
            });

            // sort the programs alphabetically (usually already sorted alphabetically by Object.keys, but not guaranteed)
            programs_with_usage.sort();

            // get the maximum length of a column
            const max_allowable_length = Math.floor(term.cols / 2) - 1;
            
            // split the programs into 2 columns
            const column1 = programs_with_usage.filter((_, i) => i % 2 === 0);
            const column2 = programs_with_usage.filter((_, i) => i % 2 === 1);

            // pad the programs in each column to the maximum length
            const column1_formatted = column1.map((program) => {
                return program.padEnd(max_allowable_length - program.length, " ");
            });

            const column2_formatted = column2.map((program) => {
                return program.padEnd(max_allowable_length - program.length, " ");
            });

            // write the programs to the terminal
            for (let i = 0; i < column1_formatted.length; i++) {
                term.writeln(`${column1_formatted[i]}  ${column2_formatted[i] || ""}`);
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
} as Program;