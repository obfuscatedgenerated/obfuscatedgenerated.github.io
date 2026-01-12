import {ANSI, NEWLINE} from "../../kernel/term_ctl";
import { ProgramMainData } from "../../types"

// extract from ANSI to make code less verbose
const { STYLE, FG } = ANSI;
export const list_subcommand = async (data: ProgramMainData) => {
    // extract from data to make code less verbose
    const { args, term, kernel } = data;

    // remove subcommand name
    args.shift();

    // check for presence of -v or -i flag
    let only_visible = false;
    let only_invisible = false;
    if (args[0] === "-v") {
        only_visible = true;
        args.shift();
    } else if (args[0] === "-i") {
        only_invisible = true;
        args.shift();
    }

    term.write(NEWLINE);

    const wm = kernel.get_window_manager();
    const all_windows = wm!.get_all_windows();
    for (const win of all_windows) {
        if (only_visible && !win.visible) {
            continue;
        }

        if (only_invisible && win.visible) {
            continue;
        }

        // TODO: source process tracking to show which program opened the window
        const visibility_text = win.visible ? `${FG.green}Visible${STYLE.reset_all}` : `${FG.red}Invisible${STYLE.reset_all}`;
        term.writeln(`- [${win.id}] ${FG.cyan}${win.title}${STYLE.reset_all} : ${visibility_text} owned by PID ${FG.yellow}${win.owner_pid}${STYLE.reset_all}`);
    }

    return 0;
}
