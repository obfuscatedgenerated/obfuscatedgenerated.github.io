import type { SyncProgram } from "../types";

export default {
    name: "fsedit",
    description: "Opens the fsedit program to edit the filesystem.",
    usage_suffix: "",
    arg_descriptions: {},
    main: (data) => {
        // extract from data to make code less verbose
        const { term } = data;

        // get fs's unique name
        const fs_name = term.get_fs().get_unique_fs_type_name();

        // open fsedit in a popup window
        window.open(`/fsedit?type=${fs_name}`, "_blank", "popup=true")

        // send message
        term.writeln("Opened fsedit in a new window.");

        return 0;
    }
} as SyncProgram;