import {ANSI, NEWLINE} from "../../lib/ansi";
import { ProgramMainData } from "../../types"
import {graph_query, is_valid_pkg_name, LIB_DIR, PROGRAMS_MANIFEST, triggers} from "./index";
import {apply_pkg_batch, create_pkg_batch, type PkgBatch} from "./batch";

// extract from ANSI to make code less verbose
const { STYLE, PREFABS, FG } = ANSI;

// TODO: resolve unused deps?

/**
 * @param parent_batch The batch of the command this is part of (e.g. replacing an old version during add). Without one, the changes are applied when this finishes.
 */
export const remove_subcommand = async (data: ProgramMainData, parent_batch?: PkgBatch) => {
    // extract from data to make code less verbose
    const { args, term, kernel, shell } = data;
    const batch = parent_batch ?? create_pkg_batch();

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

    const fs = kernel.get_fs();

    // iter over remaining args
    const total_pkgs = unique_args.length;
    while (unique_args.length >= 1) {
        term.writeln(`${NEWLINE}${FG.gray}------------------------${STYLE.reset_all}${NEWLINE}`);

        const pkg = unique_args.shift()!;

        term.writeln(`${FG.yellow}Checking for ${pkg}...${STYLE.reset_all}`);

        if (!is_valid_pkg_name(pkg)) {
            term.writeln(`${PREFABS.error}Illegal package name '${pkg}'.${STYLE.reset_all}`);
            error_count++;
            term.writeln(`${FG.yellow}Skipping package...${STYLE.reset_all}`);
            continue;
        }

        const pkg_dir = `${LIB_DIR}/${pkg}`;

        // check if pkg exists
        if (!(await fs.dir_exists(pkg_dir))) {
            term.writeln(`${PREFABS.error}Package '${pkg}' not installed.${STYLE.reset_all}`);
            error_count++;
            term.writeln(`${FG.yellow}Skipping package...${STYLE.reset_all}`);
            continue;
        }

        term.writeln(`${FG.yellow}Updating graph...${STYLE.reset_all}`);

        let meta_triggers = {};
        let meta_version = "unknown";
        let meta_deps: string[] = [];

        if (await fs.exists(fs.join(pkg_dir, "meta.json"))) {
            try {
                const meta_raw = await fs.read_file(fs.join(pkg_dir, "meta.json")) as string;
                const meta = JSON.parse(meta_raw);

                meta_triggers = meta.triggers || {};
                meta_version = meta.version || "unknown";
                meta_deps = meta.deps || [];
            } catch (e) {
                term.writeln(`${FG.yellow + STYLE.bold}Warning: Could not read meta.json for package ${pkg}: ${e.message}${STYLE.reset_all}`);
            }
        }

        // remove self as a dependent from packages listed as dependencies
        for (const dep_pkg of meta_deps) {
            try {
                // split into name and version if @ present
                const dep_pkg_name = dep_pkg.split("@")[0];
                await graph_query.remove_pkg_dependent(fs, dep_pkg_name, pkg);
            } catch (e) {
                term.writeln(`${FG.yellow + STYLE.bold}Warning: Could not remove dependent ${pkg} from package ${dep_pkg}: ${e.message}${STYLE.reset_all}`);
            }
        }

        try {
            await graph_query.remove_pkg(fs, pkg);
        } catch (e) {
            term.writeln(`${PREFABS.error}Error removing package '${pkg}': ${e.message}${STYLE.reset_all}`);
            error_count++;
            term.writeln(`${FG.yellow}Skipping package...${STYLE.reset_all}`);
            continue;
        }

        // programs are removed from BIN_DIR when the batch is applied
        const manifest_path = fs.join(pkg_dir, PROGRAMS_MANIFEST);
        if (await fs.exists(manifest_path)) {
            try {
                const program_names: string[] = JSON.parse(await fs.read_file(manifest_path) as string);

                for (const program_name of program_names) {
                    batch.remove.add(program_name);
                }
            } catch (e) {
                term.writeln(`${FG.yellow + STYLE.bold}Warning: Could not read programs for package ${pkg}: ${e.message}${STYLE.reset_all}`);
            }
        }

        term.writeln(`${FG.yellow}Queued ${pkg} for removal.${STYLE.reset_all}`);

        // the package dir goes from LIB_DIR at the same time, then triggers run
        batch.remove_packages.add(pkg);

        batch.steps.push(async () => {
            fs.purge_cache();

            term.writeln(`${FG.green}Package '${pkg}' removed.${STYLE.reset_all}`);

            // check for any removal triggers
            if (meta_triggers && Object.keys(meta_triggers).length > 0) {
                term.writeln(`${FG.cyan}Processing uninstall triggers for ${pkg}...${STYLE.reset_all}`);

                for (const [trigger_name, trigger_data] of Object.entries(meta_triggers)) {
                    if (!await triggers.trigger_exists(fs, trigger_name)) {
                        term.writeln(`${FG.yellow}Warning: trigger '${trigger_name}' is not recognised and will be skipped.${STYLE.reset_all}`);
                        continue;
                    }

                    term.writeln(`${FG.cyan}Processing uninstall trigger: ${trigger_name}...${STYLE.reset_all}`);
                    await triggers.process_uninstall_trigger(trigger_name, trigger_data, pkg, meta_version, term, kernel, shell)
                }

                term.writeln(`${FG.cyan}Uninstall trigger processing complete.${STYLE.reset_all}`);
            }
        });
    }

    // the command that started the batch applies it, so the user is only asked once
    if (!parent_batch) {
        term.writeln(`${NEWLINE}${FG.gray}------------------------${STYLE.reset_all}${NEWLINE}`);

        if (!(await apply_pkg_batch(batch, kernel, term))) {
            return 1;
        }
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
