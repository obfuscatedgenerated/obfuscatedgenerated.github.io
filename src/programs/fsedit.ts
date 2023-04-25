import type { SyncProgram } from "../types";

export default {
    name: "fsedit",
    description: "Opens the fsedit program to edit the filesystem.",
    usage_suffix: "",
    arg_descriptions: {},
    main: (data) => {
        
        // open fsedit in a popup window
        window.open("/fsedit", "_blank", "popup=true")

        return 0;
    }
} as SyncProgram;