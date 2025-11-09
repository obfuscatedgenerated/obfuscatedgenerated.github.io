import type { Program } from "../types";
import { ANSI } from "../term_ctl";
import {VirtualWindow} from "../windowing";

export default {
    name: "fsedit",
    description: "Opens the fsedit program to edit the filesystem.",
    usage_suffix: "[directory]",
    arg_descriptions: {
        "Arguments:": {
            directory: "The directory to open fsedit in. Defaults to the current working directory."
        }
    },
    main: async (data) => {
        // extract from data to make code less verbose
        const { args, term } = data;

        // extract from ANSI to make code less verbose
        const { PREFABS, STYLE } = ANSI;

        // get fs
        const fs = term.get_fs();

        // get fs name
        const fs_name = fs.get_unique_fs_type_name();

        // check args
        let dir = fs.get_cwd();
        if (args.length > 1) {
            term.writeln(`${PREFABS.error}Too many arguments.${STYLE.reset_all}`);
            return 1;
        } else if (args.length === 1) {
            // set dir
            dir = fs.absolute(args[0]);
        }

        // check if directory exists
        if (!fs.dir_exists(dir)) {
            term.writeln(`${PREFABS.error}Directory '${args[0]}' does not exist.${STYLE.reset_all}`);
            return 1;
        }

        // url encode the directory
        const encoded_dir = encodeURIComponent(dir);

        // open fsedit in a popup window
        //window.open(`./fsedit?type=${fs_name}&dir=${encoded_dir}`, "_blank", "popup=true")

        const iframe = document.createElement("iframe");
        iframe.src = `./fsedit?type=${fs_name}&dir=${encoded_dir}`;
        iframe.style.border = "none";
        iframe.style.width = "100%";
        iframe.style.height = "100%";

        const wind = new VirtualWindow();
        wind.title = "fsedit";

        wind.width = "75vw";
        wind.height = "75vh";

        wind.x = "12.5vw";
        wind.y = "12.5vh";

        wind.dom.appendChild(iframe);
        wind.show();

        // send message
        term.writeln("Opened fsedit in a new window.");

        return 0;
    }
} as Program;