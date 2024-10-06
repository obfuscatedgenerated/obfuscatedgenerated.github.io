import type { Program } from "../types";
import { ANSI, NEWLINE } from "../term_ctl";

export default {
    name: "selfdestruct",
    description: "Permanently erases the filesystem and other data, then restarts the terminal.",
    usage_suffix: "",
    arg_descriptions: {},
    main: async (data) => {
        // extract from data to make code less verbose
        const { term } = data;

        // extract from ANSI to make code less verbose
        const { FG, BG, STYLE } = ANSI;

        // get fs
        const fs = term.get_fs();

        // make sure the user really wants to do this
        term.writeln(`${BG.red + FG.white + STYLE.bold}WARNING: This will permanently erase the filesystem and other data, and restart the terminal.`);
        term.writeln("This data cannot be recovered. Are you sure you want to do this?");
        term.writeln(`Press ${BG.blue}Y${BG.red} 3 times to continue, or anything else to cancel.${STYLE.reset_all}`);

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
        fs.erase_all();
        localStorage.removeItem("fetch_ttl_cache");

        term.writeln(`${NEWLINE}Thank you for using OllieOS!${NEWLINE}`);

        await term.execute("shutdown -r -t 3000");
    }
} as Program;