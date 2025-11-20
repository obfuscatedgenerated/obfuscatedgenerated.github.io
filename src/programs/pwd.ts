import { ANSI } from "../term_ctl";
import type { Program } from "../types";

export default {
    name: "pwd",
    description: "Print working directory.",
    usage_suffix: "",
    arg_descriptions: {},
    completion: async () => [],
    main: async (data) => {
        // extract from data to make code less verbose
        const { term } = data;

        // extract from ANSI to make code less verbose
        const { STYLE, PREFABS } = ANSI;
        
        // get filesystem
        const fs = term.get_fs();

        // print working directory
        term.writeln(PREFABS.dir_name + fs.get_cwd() + STYLE.reset_all);

        return 0;
    }
} as Program;