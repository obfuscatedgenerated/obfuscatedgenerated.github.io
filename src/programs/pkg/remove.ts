import {determine_program_name_from_js} from "../../prog_registry";
import { ANSI, NEWLINE } from "../../term_ctl";
import { ProgramMainData } from "../../types"
import {graph_query} from "./index";

// extract from ANSI to make code less verbose
const { STYLE, PREFABS, FG } = ANSI;

// TODO: resolve unused deps?

export const remove_subcommand = async (data: ProgramMainData) => {
    // extract from data to make code less verbose
    const { args, term } = data;

    // remove subcommand name
    args.shift();

    if (args.length === 0) {
        term.writeln(`${PREFABS.error}Missing package name.`);
        term.writeln(`Try 'pkg -h' for more information.${STYLE.reset_all}`);
        return 1;
    }

    // remove duplicate args
    let unique_args = [...new Set(args)];

    // if any args contain @, trim to before @ and show warning
    // TODO: accept version specifier and check that the requested version is the one installed before removing
    for (const arg of unique_args) {
        if (arg.includes("@")) {
            term.writeln(`${FG.yellow}Warning: ${arg} contains a version specifier.`);
            term.writeln(`This will be ignored.${STYLE.reset_all}`);
        }
    }

    // perform removal
    unique_args = unique_args.map(arg => arg.split("@")[0]);

    // remove duplicates again
    unique_args = [...new Set(unique_args)];

    let error_count = 0;
    // returns 0 for success, 1 for failure, 2 for fatal error

    const fs = term.get_fs();
    const prog_reg = term.get_program_registry();

    // iter over remaining args
    const total_pkgs = unique_args.length;
    while (unique_args.length >= 1) {
        term.writeln(`${NEWLINE}${FG.gray}------------------------${STYLE.reset_all}${NEWLINE}`);

        const pkg = unique_args.shift();

        term.writeln(`${FG.yellow}Checking for ${pkg}...${STYLE.reset_all}`);

        // if .., /, or \ in pkg, skip
        if (pkg.includes("..") || pkg.includes("/") || pkg.includes("\\")) {
            term.writeln(`${PREFABS.error}Illegal package name '${pkg}'.${STYLE.reset_all}`);
            error_count++;
            term.writeln(`${FG.yellow}Skipping package...${STYLE.reset_all}`);
            continue;
        }

        const pkg_dir = `/usr/bin/${pkg}`;

        // check if pkg exists
        if (!(await fs.dir_exists(pkg_dir))) {
            term.writeln(`${PREFABS.error}Package '${pkg}' not installed.${STYLE.reset_all}`);
            error_count++;
            term.writeln(`${FG.yellow}Skipping package...${STYLE.reset_all}`);
            continue;
        }

        term.writeln(`${FG.yellow}Updating graph...${STYLE.reset_all}`);

        try {
            // TODO: does this handle deps properly?
            await graph_query.remove_pkg(fs, pkg);
        } catch (e) {
            term.writeln(`${PREFABS.error}Error removing package '${pkg}': ${e.message}${STYLE.reset_all}`);
            error_count++;
            term.writeln(`${FG.yellow}Skipping package...${STYLE.reset_all}`);
            continue;
        }

        term.writeln(`${FG.cyan}Unmounting programs...${STYLE.reset_all}`);

        const files = await fs.list_dir(pkg_dir);

        for (const file of files) {
            if (!file.endsWith(".js")) {
                continue;
            }

            const file_path = fs.join(pkg_dir, file);

            let program_name: string;
            try {
                const content = await fs.read_file(file_path) as string;
                program_name = await determine_program_name_from_js(content);
            } catch (e) {
                if (e.message.endsWith("is not compatible with Node.js.")) {
                    // silently skip node.js incompatible programs (they wouldn't have been mounted anyway)
                    // yes this is a weird way to do it, but better than changing how build_registrant works
                    continue;
                }

                term.writeln(`${PREFABS.error}Error determining program name for ${file}: ${e.message}${STYLE.reset_all}`);
                term.writeln(`${FG.yellow}Skipping program (will remain mounted until restart)...${STYLE.reset_all}`);
                continue;
            }

            try {
                prog_reg.unregister(program_name);
                term.writeln(`${FG.cyan}(-) ${program_name}${STYLE.reset_all}`);
            } catch (e) {
                term.writeln(`${FG.yellow + STYLE.bold}Warning: Program ${program_name} was never registered.${STYLE.reset_all}`);
            }
        }

        term.writeln(`${FG.yellow}Removing package data...${STYLE.reset_all}`);
        await fs.delete_dir(pkg_dir, true);
        fs.purge_cache();

        term.writeln(`${FG.green}Package '${pkg}' removed.${STYLE.reset_all}`);
    }

    term.writeln(`${NEWLINE}${FG.magenta + STYLE.bold}========================${STYLE.reset_all}${NEWLINE}`);

    if (error_count > 0) {
        term.writeln(`${PREFABS.error}Failed to remove ${error_count} package(s).${STYLE.reset_all}`);
        term.writeln(`${FG.green}Successfully removed ${total_pkgs - error_count} package(s).${STYLE.reset_all}`);
        term.writeln(`${FG.cyan}Total packages: ${total_pkgs}${STYLE.reset_all}`);
        return 1;
    }

    term.writeln(`${FG.green}Successfully removed all ${total_pkgs} package(s).${STYLE.reset_all}`);

    return 0;
}
