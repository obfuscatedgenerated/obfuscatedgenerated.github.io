import { ANSI } from "../kernel/term_ctl";
import type { Program } from "../types";

export default {
    name: "pwd",
    description: "Print working directory.",
    usage_suffix: "",
    arg_descriptions: {},
    compat: "2.0.0",
    completion: async () => [],
    main: async (data) => {
        // extract from data to make code less verbose
        const { kernel, term } = data;

        // extract from ANSI to make code less verbose
        const { STYLE, PREFABS } = ANSI;
        
        // get filesystem
        const fs = kernel.get_fs();

        // print working directory
        term.writeln(PREFABS.dir_name + fs.get_cwd() + STYLE.reset_all);

        return 0;
    }
} as Program;