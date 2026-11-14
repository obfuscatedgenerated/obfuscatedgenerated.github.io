import {ANSI, NEWLINE} from "../../lib/ansi";
import type {ProgramMainData} from "../../types";
import {MIGRATION_PATH, type MigrationState} from "../../lib/pkg_migration";
import {graph_query} from "./index";
import {add_subcommand} from "./add";

// extract from ANSI to make code less verbose
const {STYLE, PREFABS, FG} = ANSI;

export const migrate_subcommand = async (data: ProgramMainData) => {
    const {term, kernel} = data;
    const fs = kernel.get_fs();

    if (!(await fs.exists(MIGRATION_PATH))) {
        term.writeln(`${FG.green}Nothing to migrate.${STYLE.reset_all}`);
        return 0;
    }

    let state: MigrationState;
    try {
        state = JSON.parse(await fs.read_file(MIGRATION_PATH) as string);
    } catch (e) {
        term.writeln(`${PREFABS.error}Could not read ${MIGRATION_PATH}: ${e.message}${STYLE.reset_all}`);
        return 2;
    }

    // first run: prefer the old graph's top level packages so deps get pulled in naturally, then back it up and start fresh
    if (!state.graph_reset) {
        const top_level = graph_query.list_pkgs(true);
        if (top_level.length > 0) {
            state.packages = top_level;
        }

        await fs.write_file(fs.join(state.backup_dir, "graph.json"), await fs.read_file("/var/lib/pkg/graph.json") as string);
        await graph_query.reset(fs);

        state.graph_reset = true;
        await fs.write_file(MIGRATION_PATH, JSON.stringify(state));
    }

    if (state.packages.length === 0) {
        await fs.delete_file(MIGRATION_PATH);
        term.writeln(`${FG.green}Nothing to migrate.${STYLE.reset_all}`);
        return 0;
    }

    term.writeln(`${FG.yellow}Reinstalling ${state.packages.length} package(s): ${state.packages.join(", ")}${STYLE.reset_all}`);

    const add_args = ["add", ...state.packages];
    await add_subcommand({...data, args: [...add_args], unsubbed_args: [...add_args], raw_parts: [...data.raw_parts, ...add_args]});

    const failed = state.packages.filter((pkg) => !graph_query.pkg_is_installed(pkg));

    term.write(NEWLINE);

    if (failed.length > 0) {
        state.packages = failed;
        await fs.write_file(MIGRATION_PATH, JSON.stringify(state));

        term.writeln(`${PREFABS.error}Could not reinstall: ${failed.join(", ")}${STYLE.reset_all}`);
        term.writeln(`${FG.yellow}Run 'pkg migrate' again to retry. Old package files are in ${state.backup_dir}${STYLE.reset_all}`);
        return 1;
    }

    await fs.delete_file(MIGRATION_PATH);

    term.writeln(`${FG.green}Migration complete. Old package files are in ${state.backup_dir} and can be deleted once you're happy.${STYLE.reset_all}`);
    return 0;
}
