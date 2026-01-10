import type { Program } from "../types";
import { ANSI } from "../term_ctl";

export default {
    name: "fsedit",
    description: "Opens the fsedit program to edit the filesystem.",
    usage_suffix: "[directory]",
    arg_descriptions: {
        "Arguments:": {
            directory: "The directory to open fsedit in. Defaults to the current working directory."
        }
    },
    compat: "2.0.0",
    main: async (data) => {
        // extract from data to make code less verbose
        const { kernel, args, term, process } = data;

        // extract from ANSI to make code less verbose
        const { PREFABS, STYLE } = ANSI;

        // get fs
        const fs = kernel.get_fs();

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
        if (!(await fs.dir_exists(dir))) {
            term.writeln(`${PREFABS.error}Directory '${args[0]}' does not exist.${STYLE.reset_all}`);
            return 1;
        }

        // url encode the directory
        const encoded_dir = encodeURIComponent(dir);

        if (!kernel.has_window_manager()) {
            // fallback to opening in a popup window
            window.open(`./fsedit?type=${fs_name}&dir=${encoded_dir}`, "_blank", "popup=true");
            term.writeln("Opened fsedit in a new popup window.");
            return 0;
        }

        const iframe = document.createElement("iframe");
        iframe.src = `./fsedit?type=${fs_name}&dir=${encoded_dir}`;
        iframe.style.border = "none";
        iframe.style.width = "100%";
        iframe.style.height = "100%";

        const wind = process.create_window();
        wind.title = "fsedit";

        wind.width = "75vw";
        wind.height = "75vh";

        wind.x = "12.5vw";
        wind.y = "12.5vh";

        wind.dom.appendChild(iframe);
        wind.show();

        // send message
        term.writeln("Opened fsedit in a new window.");

        wind.add_event_listener("close", async () => {
            // backup unlock logic TODO improve the design of fsedit in general
            if (await fs.exists("/.fs.lock")) {
                // check that no other fsedit processes are running
                let other_fsedit_running = false;
                const processes = kernel.get_process_manager().list_pids();
                for (const pid of processes) {
                    if (pid === process.pid) {
                        continue;
                    }

                    const proc = kernel.get_process_manager().get_process(pid);
                    if (proc && proc.source_command.command === "fsedit") {
                        other_fsedit_running = true;
                        break;
                    }
                }

                if (!other_fsedit_running) {
                    await fs.delete_file("/.fs.lock");
                }
            }

            process.kill(0);
        });

        // listen for message from iframe to close window
        const message_handler = (event: MessageEvent) => {
            if (event.source === iframe.contentWindow && event.data === "closing-fsedit") {
                wind.close();
                window.removeEventListener("message", message_handler);
            }
        };
        window.addEventListener("message", message_handler);

        process.detach();
        return 0;
    }
} as Program;