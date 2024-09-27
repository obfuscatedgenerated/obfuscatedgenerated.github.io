import { repo_query } from ".";
import { mount_and_register_with_output } from "../../prog_registry";

import { ANSI, NEWLINE } from "../../term_ctl";
import { ProgramMainData } from "../../types"

// extract from ANSI to make code less verbose
const { STYLE, PREFABS, FG } = ANSI;

// TODO: remove first if it is an upgrade

export const add_subcommand = async (data: ProgramMainData) => {
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
    const unique_args = [...new Set(args)];

    let error_count = 0;
    // returns 0 for success, 1 for failure, 2 for fatal error

    const fs = term.get_fs();
    const prog_reg = term.get_program_registry();

    // iter over remaining args
    const total_pkgs = unique_args.length;
    while (unique_args.length >= 1) {
        term.writeln(`${NEWLINE}${FG.gray}------------------------${STYLE.reset_all}${NEWLINE}`);

        const pkg = unique_args.shift();

        // if in the format of pkg@version, split it up
        const pkg_split = pkg.split("@");
        if (pkg_split.length > 2) {
            term.writeln(`${PREFABS.error}Invalid package name: ${pkg}`);
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

        // firstly, install dependencies
        if (meta.deps && meta.deps.length > 0) {
            term.writeln(`${FG.magenta + STYLE.bold}Installing dependencies...${STYLE.reset_all}`);

            // simulate a call to this function with the deps as arguments
            // TODO: is it worth doing this properly and decomposing each stage to a function and calling it?
            // TODO: clearer logs
            // TODO: unshifting add is silly, should this func be changed to accept args with add removed?
            const virtual_args = meta.deps;
            virtual_args.unshift("add");

            const virtual_data = { term, args: virtual_args, unsubbed_args: virtual_args };
            const virtual_exit_code = await add_subcommand(virtual_data);

            if (virtual_exit_code !== 0) {
                term.writeln(`${PREFABS.error}Failed to install dependencies.${STYLE.reset_all}`);
                error_count++;
                term.writeln(`${FG.yellow}Skipping package ${pkg_name}...${STYLE.reset_all}`);
                continue;
                // TODO: remove partial installation
            }
        }

        const pkg_dir = `/usr/bin/${pkg_name}`;

        // check version file
        if (fs.exists(`${pkg_dir}/VERSION`)) {
            const installed_version = fs.read_file(`${pkg_dir}/VERSION`);

            if (installed_version === pkg_version) {
                term.writeln(`${PREFABS.error}Already installed. If you wish to reinstall the package, remove it first.${STYLE.reset_all}`);
                error_count++;
                term.writeln(`${FG.yellow}Skipping package ${pkg_name}...${STYLE.reset_all}`);
                continue;
            }
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

        // add pkg.json to file map
        file_map.set("pkg.json", JSON.stringify(pkg_json));

        term.writeln(`${FG.yellow}Installing ${pkg_name}...${STYLE.reset_all}`);

        fs.make_dir(pkg_dir);

        // write version file
        fs.write_file(`${pkg_dir}/VERSION`, pkg_version);

        // write each file
        for (const [file, value] of file_map) {
            fs.write_file(`${pkg_dir}/${file}`, value, true);
        }

        term.writeln(`${FG.green}Installed!${STYLE.reset_all}`);

        term.writeln(`${FG.cyan}Mounting package ${pkg_name}...${STYLE.reset_all}`);

        // mount each program
        for (const [file, value] of file_map) {
            if (!file.endsWith(".js")) {
                continue;
            }

            await mount_and_register_with_output(file, value, prog_reg, term);
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
