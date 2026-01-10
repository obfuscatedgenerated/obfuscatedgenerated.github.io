import type { Program } from "../types";
import { ANSI, NEWLINE } from "../term_ctl";

export default {
    name: "selfdestruct",
    description: "Permanently erases the filesystem and other data, then restarts the terminal.",
    usage_suffix: "",
    arg_descriptions: {},
    compat: "2.0.0",
    completion: async () => [],
    main: async (data) => {
        // extract from data to make code less verbose
        const { kernel, shell, term } = data;

        // extract from ANSI to make code less verbose
        const { FG, BG, STYLE } = ANSI;

        // get fs
        const fs = kernel.get_fs();

        const pad = (str: string, invis_codes = "") => {
            if (str.length >= term.cols) {
                return str;
            }

            return str + " ".repeat(term.cols - str.length + invis_codes.length);
        }

        // make sure the user really wants to do this
        term.writeln(BG.red + FG.white + STYLE.bold);
        term.write(pad("WARNING: This will permanently erase the filesystem and other data, and restart the terminal."));
        term.writeln(pad("This data cannot be recovered. Are you sure you want to do this?"));
        term.writeln(pad(`Press ${BG.blue}Y${BG.red} 3 times to continue, or anything else to cancel.`, BG.blue + BG.red));
        term.write(STYLE.reset_all);

        // wait for the user to press Y 3 times
        let y_count = 0;
        while (y_count < 3) {
            const key = await term.wait_for_keypress();
            if (key.key === "y" || key.key === "Y") {
                y_count++;
            } else {
                term.writeln("Cancelled.");
                return 0;
            }
        }

        // clear the screen and erase the filesystem
        term.reset();

        term.writeln("Erasing filesystem and other data...");
        await fs.erase_all();
        localStorage.removeItem("fetch_ttl_cache");

        term.writeln(`${NEWLINE}Thank you for using OllieOS!${NEWLINE}`);

        // TODO: talk to ignition instead of using shutdown command
        return await kernel.spawn("shutdown", ["r", "-t", "3000"], shell).completion;
    }
} as Program;