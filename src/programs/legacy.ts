import type { Program } from "../types";

export default {
    name: "legacy",
    description: "Opens the legacy ollieg.codes site if you're having trouble with this version.",
    usage_suffix: "",
    arg_descriptions: {
    },
    main: async (_data) => {
        window.location.assign("https://legacy.ollieg.codes/");

        return 0;
    }
} as Program;
