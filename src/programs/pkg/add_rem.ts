import { repo_query } from ".";

import { ANSI } from "../../term_ctl";
import { ProgramMainData } from "../../types"

export const add_subcommand = async (data: ProgramMainData) => {
    // extract from data to make code less verbose
    const { args, term } = data;

    // extract from ANSI to make code less verbose
    const { STYLE, PREFABS, FG } = ANSI;

    const pkg = args[1];

    if (!pkg) {
        term.writeln(`${PREFABS.error}Missing package name.`);
        term.writeln(`Try 'pkg -h' for more information.${STYLE.reset_all}`);
        return 1;
    }

    // if in the format of pkg@version, split it up
    const pkg_split = pkg.split("@");
    if (pkg_split.length > 2) {
        term.writeln(`${PREFABS.error}Invalid package name.`);
        term.writeln(`Try 'pkg -h' for more information.${STYLE.reset_all}`);
        return 1;
    }

    const pkg_name = pkg_split[0];
    let pkg_version = pkg_split[1];

    term.writeln(`${FG.yellow}Checking for ${pkg_name}...${STYLE.reset_all}`);

    const p_exists = await repo_query.pkg_exists(pkg_name);

    if (!p_exists) {
        term.writeln(`${PREFABS.error}Package '${pkg_name}' not found.${STYLE.reset_all}`);
        return 1;
    }

    // get pkg.json
    const pkg_json = await repo_query.get_pkg_json(pkg_name);

    // if no version specified, use latest
    if (!pkg_version) {
        pkg_version = pkg_json.latest_version;
    }

    term.writeln(`${FG.yellow}Using ${pkg_name}@${pkg_version}.${STYLE.reset_all}`);

    // check if version exists
    const v_exists = await repo_query.pkg_at_version_exists(pkg_name, pkg_version);

    if (!v_exists) {
        term.writeln(`${PREFABS.error}Version '${pkg_version}' of '${pkg_name}' not found.${STYLE.reset_all}`);
        return 1;
    }

    term.writeln(`${FG.yellow}Enumerating contents...${STYLE.reset_all}`);

    return 0;
}




export const remove_subcommand = async (data: ProgramMainData) => {
    return 0;
}
