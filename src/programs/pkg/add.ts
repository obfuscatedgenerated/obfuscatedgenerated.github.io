import { repo_query } from ".";
import { mount_and_register_with_output } from "../../prog_registry";

import { ANSI } from "../../term_ctl";
import { ProgramMainData } from "../../types"

// extract from ANSI to make code less verbose
const { STYLE, PREFABS, FG } = ANSI;

export const add_subcommand = async (data: ProgramMainData) => {
    // extract from data to make code less verbose
    const { args, term } = data;

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

    const pkg_json = await repo_query.get_pkg_json(pkg_name);

    if (!pkg_json) {
        term.writeln(`${PREFABS.error}Package '${pkg_name}' not found.${STYLE.reset_all}`);
        return 1;
    }

    // if no version specified, use latest
    if (!pkg_version) {
        pkg_version = pkg_json.latest_version;
    }

    term.writeln(`${FG.yellow}Using ${pkg_name}@${pkg_version}...${STYLE.reset_all}`);

    // check if version exists
    const contents = await repo_query.get_pkg_contents(pkg_name, pkg_version);

    if (!contents) {
        term.writeln(`${PREFABS.error}Version '${pkg_version}' of '${pkg_name}' not found.${STYLE.reset_all}`);
        return 1;
    }

    const pkg_dir = `/usr/bin/${pkg_name}`;

    // check version file
    const fs = term.get_fs();
    if (fs.exists(`${pkg_dir}/VERSION`)) {
        const installed_version = fs.read_file(`${pkg_dir}/VERSION`);

        if (installed_version === pkg_version) {
            term.writeln(`${PREFABS.error}Already installed. If you wish to reinstall the package, remove it first.${STYLE.reset_all}`);
            return 1;
        }
    }

    term.writeln(`${FG.yellow}Enumerating contents...${STYLE.reset_all}`);

    const content_list = contents.split("\n");

    if (content_list.length === 0 || content_list.length === 1 && content_list[0] === "") {
        term.writeln(`${PREFABS.error}Empty package.${STYLE.reset_all}`);
        return 1;
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
            return 1;
        }

        file_map.set(file, file_contents);
    }

    // add pkg.json to file map
    file_map.set("pkg.json", JSON.stringify(pkg_json));

    term.writeln(`${FG.yellow}Installing...${STYLE.reset_all}`);

    fs.make_dir(pkg_dir);

    // write version file
    fs.write_file(`${pkg_dir}/VERSION`, pkg_version);

    // write each file
    for (const [file, value] of file_map) {
        fs.write_file(`${pkg_dir}/${file}`, value);
    }

    term.writeln(`${FG.green}Installed!${STYLE.reset_all}`);

    term.writeln(`${FG.cyan}Mounting package...${STYLE.reset_all}`);

    const prog_reg = term.get_program_registry();

    // mount each program
    for (const [file, value] of file_map) {
        if (!file.endsWith(".js")) {
            continue;
        }

        mount_and_register_with_output(file, value, prog_reg, term);
    }

    term.writeln(`${FG.green}Mounted!${STYLE.reset_all}`);
    return 0;
}
