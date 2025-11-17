import {ANSI, NEWLINE} from "../../term_ctl";
import type { WrappedTerminal } from "../../term_ctl";
import type { ProgramMainData } from "../../types"
import {graph_query, repo_query} from "./index";

// extract from ANSI to make code less verbose
const { STYLE, PREFABS } = ANSI;

interface PkgInfo {
    description?: string;
    author?: string;
    license?: string;
    homepage_url?: string;
    repo_url?: string;
    long_desc?: string;
}

const print_info = (term: WrappedTerminal, pkg_name: string, pkg_version: string, pkg_data: PkgInfo, installed: boolean) => {
    term.write(NEWLINE);

    term.writeln(`Package: ${STYLE.bold}${pkg_name}${STYLE.no_bold_or_dim}`);
    term.writeln(`Version: ${STYLE.bold}${pkg_version}${STYLE.no_bold_or_dim}`);
    term.writeln(`Description: ${pkg_data.description || "No description provided."}`);
    term.writeln(`Author: ${pkg_data.author || "Unknown"}`);
    term.writeln(`License: ${pkg_data.license || "Unknown"}`);
    term.writeln(`Installed: ${STYLE.bold}${installed ? "Yes" : "No"}${STYLE.no_bold_or_dim}`);

    if (pkg_data.homepage_url) {
        term.writeln(`Homepage: ${pkg_data.homepage_url}`);
    }

    if (pkg_data.repo_url) {
        term.writeln(`Repository: ${pkg_data.repo_url}`);
    }

    if (pkg_data.long_desc) {
        term.write(NEWLINE);
        term.writeln(`Long description available. Use ${PREFABS.program_name}pkg${STYLE.reset_all + STYLE.italic} read${STYLE.reset_all} ${pkg_name} to read it.`);
    }
}

export const info_subcommand = async (data: ProgramMainData) => {
    // extract from data to make code less verbose
    const { args, term } = data;

    // remove subcommand name
    args.shift();

    // check for presence of -r flag
    let always_fetch = false;
    if (args[0] === "-r") {
        always_fetch = true;
        args.shift();
    }

    // check for package name
    if (args.length === 0) {
        term.writeln(`${PREFABS.error}Missing package name.`);
        term.writeln(`Try 'pkg -h' for more information.${STYLE.reset_all}`);
        return 1;
    }

    const pkg_at_version = args[0];

    // if in the format of pkg@version, split it up
    const pkg_split = pkg_at_version.split("@");
    if (pkg_split.length > 2) {
        term.writeln(`${PREFABS.error}Invalid package name: ${pkg_at_version}`);
        term.writeln(`Try 'pkg -h' for more information.${STYLE.reset_all}`);
        return 2;
    }

    const pkg_name = pkg_split[0];
    let pkg_version = pkg_split[1];

    // if no version specified, use what's installed
    // if not installed, fetch latest from repo
    // note that version doesnt really matter other than as a test whether the version exists and installed locally, as pkg.json is shared across versions
    if (!pkg_version) {
        const installed_pkg = graph_query.get_pkg_version(pkg_name);
        if (installed_pkg && !always_fetch) {
            pkg_version = installed_pkg;
        } else {
            const pkg_json = await repo_query.get_pkg_json(pkg_name);
            if (!pkg_json) {
                term.writeln(`${PREFABS.error}Package not found: ${pkg_name}`);
                term.writeln(`Try 'pkg -h' for more information.${STYLE.reset_all}`);
                return 3;
            }

            pkg_version = pkg_json.latest_version;
        }
    }

    const installed_pkg = graph_query.get_pkg_version(pkg_name);
    const requested_version_installed = installed_pkg === pkg_version;

    const fs = term.get_fs();

    if (!always_fetch && requested_version_installed) {
        const pkg_json_path = graph_query.get_file_path_in_pkg_bin(fs, pkg_name, "pkg.json");

        if (!fs.exists(pkg_json_path)) {
            // shouldnt happen, but just in case
            console.error(`Invalid pkg.json path: ${pkg_json_path}`);
            term.writeln(`${PREFABS.error}Error reading package files for ${pkg_name}`);
            return 3;
        }

        const pkg_json = fs.read_file(pkg_json_path) as string;
        const pkg_data = JSON.parse(pkg_json);

        print_info(term, pkg_name, pkg_version, pkg_data, true);
        return 0;
    }

    // fetch package data from repo
    const pkg_data = await repo_query.get_pkg_json(pkg_name);
    if (!pkg_data) {
        term.writeln(`${PREFABS.error}Package not found: ${pkg_name}`);
        term.writeln(`Try 'pkg -h' for more information.${STYLE.reset_all}`);
        return 3;
    }

    print_info(term, pkg_name, pkg_version, pkg_data, requested_version_installed);
    return 0;
}
