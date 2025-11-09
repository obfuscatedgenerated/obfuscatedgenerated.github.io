import {ANSI} from "../../term_ctl";
import { ProgramMainData } from "../../types"
import {get_window_by_id} from "../../windowing";

// extract from ANSI to make code less verbose
const { STYLE, FG, PREFABS } = ANSI;
export const hide_subcommand = async (data: ProgramMainData) => {
    // extract from data to make code less verbose
    const { args, term } = data;

    // remove subcommand name
    args.shift();

    // get the window id to hide
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

    const wind = get_window_by_id(window_id);

    if (!wind) {
        term.writeln(`${PREFABS.error}No window found with ID '${window_id}'.`)
        term.writeln(`Try 'window list' to see all open windows.${STYLE.reset_all}`);
        return 1;
    }

    if (!wind.visible) {
        term.writeln(`Window with ID ${FG.cyan}${window_id}${STYLE.reset_all} is already hidden.${STYLE.reset_all}`);
        return 2;
    }

    term.writeln(`Hiding window with ID ${FG.cyan}${window_id}${STYLE.reset_all}.`);
    wind.hide();

    return 0;
}
