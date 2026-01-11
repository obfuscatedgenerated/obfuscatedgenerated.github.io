import {ANSI} from "../../term_ctl";
import { ProgramMainData } from "../../types"

// extract from ANSI to make code less verbose
const { STYLE, FG, PREFABS } = ANSI;
export const close_subcommand = async (data: ProgramMainData) => {
    // extract from data to make code less verbose
    const { args, term, kernel: userspace_kernel } = data;

    // remove subcommand name
    args.shift();

    // get the window id to close
    if (args.length === 0) {
        term.writeln(`${PREFABS.error}Missing window ID.`)
        term.writeln(`Try 'window -h' for more information.${STYLE.reset_all}`);
        return 1;
    }

    const window_id = parseInt(args[0], 10);
    if (isNaN(window_id)) {
        term.writeln(`${PREFABS.error}Invalid window ID '${args[0]}'. Window ID must be an integer.`)
        term.writeln(`Try 'window list' to see all open windows.${STYLE.reset_all}`);
        return 1;
    }

    // check window exists first with userspace kernel
    const userspace_wm = userspace_kernel.get_window_manager();
    const userspace_window = userspace_wm!.get_window_by_id(window_id);
    if (!userspace_window) {
        term.writeln(`${PREFABS.error}No window found with ID '${window_id}'.`)
        term.writeln(`Try 'window list' to see all open windows.${STYLE.reset_all}`);
        return 1;
    }

    // request elevation
    const kernel = await userspace_kernel.request_privilege("Access the window manager to close a window.");
    if (!kernel) {
        term.writeln(`${PREFABS.error}Permission denied to access the window manager.${STYLE.reset_all}`);
        return 1;
    }

    const wm = kernel.get_window_manager();
    const wind = wm!.get_window_by_id(window_id);

    // check again for safety
    if (!wind) {
        term.writeln(`${PREFABS.error}No window found with ID '${window_id}'.`)
        term.writeln(`Try 'window list' to see all open windows.${STYLE.reset_all}`);
        return 1;
    }

    term.writeln(`Closing window with ID ${FG.cyan}${window_id}${STYLE.reset_all}. The process that opened this window may still be running.`);
    wind.close();

    return 0;
}
