import type { SyncProgram } from "../types";
import { ANSI } from "../term_ctl";


export default {
    name: "tour",
    description: "Runs the onboarding tour.",
    usage_suffix: "",
    arg_descriptions: {},
    main: (data) => {
        // extract from data to make code less verbose
        const { term, args } = data;

        // extract from ANSI to make code less verbose
        const { STYLE, PREFABS } = ANSI;

        term.writeln("test.");

        return 0;
    }
} as SyncProgram;
