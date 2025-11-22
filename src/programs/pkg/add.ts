import {graph_query, json_convert_dep_sets_to_arrs, PkgAtVersion, repo_query} from ".";
import {mount_and_register_with_output} from "../../prog_registry";

import {ANSI, NEWLINE} from "../../term_ctl";
import {ProgramMainData} from "../../types"
import {remove_subcommand} from "./remove";

// extract from ANSI to make code less verbose
const {STYLE, PREFABS, FG} = ANSI;

// we arent allowing multiple versions of the same package to be installed at once to simplify things significantly
// TODO: write to a file that tracks installed packages and their dependents (for list and smart removal/cleanup)

export const add_subcommand = async (data: ProgramMainData, depended_by?: PkgAtVersion) => {
    // extract from data to make code less verbose
    const {args, term} = data;

    // remove subcommand name
    args.shift();

    if (args.length === 0) {
        term.writeln(`${PREFABS.error}Missing package name.`);
        term.writeln(`Try 'pkg -h' for more information.${STYLE.reset_all}`);
        return 1;
    }

    // remove duplicate args
    const unique_args = [...new Set(args)];

    let error_count = 0;
    // returns 0 for success, 1 for failure, 2 for fatal error

    const fs = term.get_fs();
    const prog_reg = term.get_program_registry();

    // iter over remaining args
    const total_pkgs = unique_args.length;
    while (unique_args.length >= 1) {
        term.writeln(`${NEWLINE}${FG.gray}------------------------${STYLE.reset_all}${NEWLINE}`);

        const pkg_at_version = unique_args.shift();

        // if in the format of pkg@version, split it up
        const pkg_split = pkg_at_version.split("@");
        if (pkg_split.length > 2) {
            term.writeln(`${PREFABS.error}Invalid package name: ${pkg_at_version}`);
            term.writeln(`Try 'pkg -h' for more information.${STYLE.reset_all}`);
            return 2;
        }

        const pkg_name = pkg_split[0];
        let pkg_version = pkg_split[1];

        term.writeln(`${FG.yellow}Checking for ${pkg_name}...${STYLE.reset_all}`);

        const pkg_json = await repo_query.get_pkg_json(pkg_name);

        if (!pkg_json) {
            term.writeln(`${PREFABS.error}Package '${pkg_name}' not found.${STYLE.reset_all}`);
            error_count++;
            term.writeln(`${FG.yellow}Skipping package ${pkg_name}...${STYLE.reset_all}`);
            continue;
        }

        // if no version specified, use latest
        if (!pkg_version) {
            pkg_version = pkg_json.latest_version;
        }

        term.writeln(`${FG.yellow}Using ${pkg_name}@${pkg_version}...${STYLE.reset_all}`);

        // check if version exists (and get metadata)
        const meta = await repo_query.get_pkg_meta(pkg_name, pkg_version);

        if (!meta) {
            term.writeln(`${PREFABS.error}Version '${pkg_version}' of '${pkg_name}' not found.${STYLE.reset_all}`);
            error_count++;
            term.writeln(`${FG.yellow}Skipping package ${pkg_name}...${STYLE.reset_all}`);
            continue;
        }

        if (!meta.externals || meta.externals !== "global") {
            term.writeln(`${PREFABS.error}Package '${pkg_name}' is not using the new global externals system. Please build the package with a newer version of pkgbuild.${STYLE.reset_all}`);
            error_count++;
            term.writeln(`${FG.yellow}Skipping package ${pkg_name}...${STYLE.reset_all}`);
            continue;
        }

        const pkg_dir = `/usr/bin/${pkg_name}`;

        // check version file if already installed
        // TODO: switch to pkg graph?
        if (graph_query.pkg_is_installed(pkg_name)) {
            const installed_version = graph_query.get_pkg_version(pkg_name);

            if (installed_version === pkg_version) {
                // if exact version already installed, check dep graph then skip
                // ie if depended_by is set but that isn't a dependent yet then add it

                term.writeln(`${FG.yellow + STYLE.bold}Warning: ${pkg_name}@${pkg_version} already installed. If you wish to reinstall the package, remove it first.${STYLE.reset_all}`);

                // cant do this here as top level package isn't installed yet. it's the caller's job to do this. it wouldn't be safe to refactor the method in a way that allows this
                // if (depended_by) {
                //     graph_query.add_pkg_dependent(fs, pkg_name, depended_by);
                //     term.writeln(`${FG.yellow}(dep graph updated)${STYLE.reset_all}`);
                // }

                continue;
            } else {
                // uninstall old version
                term.writeln(`${FG.yellow}Uninstalling old ${pkg_name}@${pkg_version}...${STYLE.reset_all}`);

                const remove_data = {term, process: data.process, args: ["remove", pkg_name], unsubbed_args: ["remove", pkg_name], raw_parts: [...data.raw_parts, "remove", pkg_name]};
                const remove_exit_code = await remove_subcommand(remove_data);
                if (remove_exit_code !== 0) {
                    term.writeln(`${PREFABS.error}Failed to uninstall old version.${STYLE.reset_all}`);
                    error_count++;
                    term.writeln(`${FG.yellow}Skipping package ${pkg_name}...${STYLE.reset_all}`);
                    continue;
                }
            }
        }

        // firstly, install dependencies
        if (meta.deps && meta.deps.size > 0) {
            term.writeln(`${NEWLINE + FG.magenta + STYLE.bold}Installing dependencies...${STYLE.reset_all}`);

            // simulate a call to this function with the deps as arguments
            // TODO: is it worth doing this properly and decomposing each stage to a function and calling it?
            // TODO: clearer logs
            // TODO: unshifting add is silly, should this func be changed to accept args with add removed?
            // TODO: parallelism with promise.all???
            const virtual_args: string[] = [...meta.deps];
            virtual_args.unshift("add");

            // we need to also pass the name of the dependent package to the virtual call to let the graph know
            const virtual_data = {term, process: data.process, args: virtual_args, unsubbed_args: virtual_args, raw_parts: [...data.raw_parts, ...virtual_args]};
            const virtual_exit_code = await add_subcommand(virtual_data, pkg_at_version as PkgAtVersion);

            if (virtual_exit_code !== 0) {
                term.writeln(`${PREFABS.error}Failed to install dependencies.${STYLE.reset_all}`);
                error_count++;
                term.writeln(`${FG.yellow}Skipping package ${pkg_name}...${STYLE.reset_all}`);
                continue;
                // TODO: remove partial installation
            }

            term.writeln(`${FG.magenta + STYLE.bold}Dependencies installed.${STYLE.reset_all + NEWLINE}`);
        }

        term.writeln(`${FG.yellow}Enumerating contents...${STYLE.reset_all}`);

        const content_list = meta.files;

        if (content_list.length === 0 || content_list.length === 1 && content_list[0] === "") {
            term.writeln(`${PREFABS.error}Empty package.${STYLE.reset_all}`);
            error_count++;
            term.writeln(`${FG.yellow}Skipping package ${pkg_name}...${STYLE.reset_all}`);
            continue;
        }

        // get each file in contents and load it into memory
        const file_map = new Map<string, string>();

        for (const file of content_list) {
            if (file === "") {
                continue;
            }

            term.writeln(`${FG.yellow}Downloading ${file}...${STYLE.reset_all}`);

            const file_contents = await repo_query.get_pkg_file(pkg_name, pkg_version, file);

            if (!file_contents) {
                term.writeln(`${PREFABS.error}Not found.${STYLE.reset_all}`);
                error_count++;
                term.writeln(`${FG.yellow}Skipping package ${pkg_name}...${STYLE.reset_all}`);
                continue;
            }

            file_map.set(file, file_contents);
        }

        // add pkg.json and meta.json to file map
        file_map.set("pkg.json", JSON.stringify(pkg_json));
        // TODO: adding this might be redundant, we could just move build timestamp to the graph. could also use file array to help mounting? prob not needed.
        // TODO: build timestamp isnt actually used anywhere yet so not a big deal until implemented. might be quicker to just open this file rather than access the graph anyway!
        file_map.set("meta.json", JSON.stringify(meta, json_convert_dep_sets_to_arrs));

        // not actually executing the file map yet, as we need to ensure the graph is valid

        term.writeln(`${FG.yellow}Updating graph...${STYLE.reset_all}`);

        // don't need to check if installed or do anything fancy if it is, as previous checks have already run and updated the graph if needed
        // this is guaranteed to be a new install (whether first time or remove was just run)
        // TODO: test if that's true! test it more!
        try {
            await graph_query.install_new_pkg(fs, pkg_name, pkg_version, meta.deps, !depended_by, depended_by);
        } catch (e) {
            term.writeln(`${PREFABS.error}Failed to add to graph: ${e.message}${STYLE.reset_all}`);
            error_count++;
            term.writeln(`${FG.yellow}Skipping package ${pkg_name}...${STYLE.reset_all}`);
            continue;
        }

        // if there were dependencies, add this package as a dependent to each of them
        try {
            if (meta.deps && meta.deps.size > 0) {
                for (const dep of meta.deps) {
                    const dep_name = dep.split("@")[0];
                    await graph_query.add_pkg_dependent(fs, dep_name, pkg_at_version as PkgAtVersion);
                }
            }
        } catch (e) {
            term.writeln(`${PREFABS.error}Failed to update dependencies: ${e.message}${STYLE.reset_all}`);
            error_count++;
            term.writeln(`${FG.yellow}Rolling back graph...${STYLE.reset_all}`);
            // TODO: safety check? is it safer to capture the entire graph before starting and then rollback to that? add a capture and rollback method to graph_query?
            await graph_query.remove_pkg(fs, pkg_name);
            term.writeln(`${FG.yellow}Skipping package ${pkg_name}...${STYLE.reset_all}`);
            continue;
        }

        term.writeln(`${FG.yellow}Installing ${pkg_name}...${STYLE.reset_all}`);

        await fs.make_dir(pkg_dir);

        // write each file
        for (const [file, value] of file_map) {
            await fs.write_file(`${pkg_dir}/${file}`, value, true);
        }

        // TODO: check if this fails somehow, and if it does, rollback the graph

        term.writeln(`${FG.green}Installed!${STYLE.reset_all}`);

        term.writeln(`${FG.cyan}Mounting package ${pkg_name}...${STYLE.reset_all}`);

        // it doesn't matter if mounting fails, the graph is fine and the files are downloaded properly, so no rollback needed

        // mount each program
        for (const [filename, value] of file_map) {
            if (!filename.endsWith(".js")) {
                continue;
            }

            await mount_and_register_with_output(filename, value, prog_reg, term, true);
        }

        term.writeln(`${FG.green}Package ${pkg_name}@${pkg_version} installed.${STYLE.reset_all}`);
    }

    term.writeln(`${NEWLINE}${FG.magenta + STYLE.bold}========================${STYLE.reset_all}${NEWLINE}`);

    if (error_count > 0) {
        term.writeln(`${PREFABS.error}Failed to install ${error_count} package(s).${STYLE.reset_all}`);
        term.writeln(`${FG.green}Successfully installed ${total_pkgs - error_count} package(s).${STYLE.reset_all}`);
        term.writeln(`${FG.cyan}Total packages: ${total_pkgs}${STYLE.reset_all}`);
        return 1;
    }

    term.writeln(`${FG.green}Successfully installed all ${total_pkgs} package(s).${STYLE.reset_all}`);

    return 0;
}
// TODO: decompose into smaller functions
