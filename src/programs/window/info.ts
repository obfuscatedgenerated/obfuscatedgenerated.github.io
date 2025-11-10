import {ANSI, NEWLINE} from "../../term_ctl";
import { ProgramMainData } from "../../types"

// extract from ANSI to make code less verbose
const { STYLE, FG } = ANSI;
export const info_subcommand = async (data: ProgramMainData) => {
    // extract from data to make code less verbose
    const { args, term } = data;

    // remove subcommand name
    args.shift();

    term.write(NEWLINE);

    const wm = term.get_window_manager();
    const all_windows = wm!.get_all_windows();
    const visible_windows = all_windows.filter(w => w.visible).length;

    term.writeln(`Window manager: ${FG.cyan}${wm!.get_unique_manager_type_name()}${STYLE.reset_all}`);
    term.writeln(`Total open windows: ${FG.cyan}${all_windows.length}${STYLE.reset_all}`);
    term.writeln(`Visible windows: ${FG.cyan}${visible_windows}${STYLE.reset_all}`);
    term.writeln(`Invisible windows: ${FG.cyan}${all_windows.length - visible_windows}${STYLE.reset_all}`);

    return 0;
}
