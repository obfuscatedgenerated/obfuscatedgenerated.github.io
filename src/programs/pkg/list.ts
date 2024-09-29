import {ANSI, NEWLINE} from "../../term_ctl";
import { ProgramMainData } from "../../types"
import {graph_query} from "./index";

// extract from ANSI to make code less verbose
const { STYLE, FG } = ANSI;
export const list_subcommand = async (data: ProgramMainData) => {
    // extract from data to make code less verbose
    const { args, term } = data;

    // remove subcommand name
    args.shift();

    // check for presence of -t flag
    let only_top_level = false;
    if (args[0] === "-t") {
        only_top_level = true;
        args.shift();
    }

    term.write(NEWLINE);

    const pkg_names = graph_query.list_pkgs(only_top_level);

    // print each package, marking top level packages in green and dependencies in gray
    // TODO: mark top level packages that are also dependencies in another color?
    for (const pkg_name of pkg_names) {
        const info = graph_query.get_pkg_info(pkg_name);
        term.writeln(`${STYLE.bold}${info.top_level ? FG.green : FG.gray}${pkg_name}${STYLE.no_bold_or_dim}@${info.version}${STYLE.reset_all}`);
    }

    return 0;
}
