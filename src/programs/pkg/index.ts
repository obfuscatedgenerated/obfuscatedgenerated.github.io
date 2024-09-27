import { add_subcommand } from "./add";
import { remove_subcommand } from "./remove";

import { ANSI } from "../../term_ctl";
import type { AsyncProgram } from "../../types";


const REPO_URL = "https://ollieg.codes/pkg_repo";
const repo_url_obj = new URL(REPO_URL);
// TODO: in future, this can be changed. it will also be a list of repos in priority order, and the first one that has the package will be used.

const append_url_pathnames = (url: URL, pathnames: string[]) => {
    const new_url = new URL(url.toString());
    let urlpath = new_url.pathname;

    // drop trailing /
    if (urlpath.endsWith("/")) {
        urlpath = urlpath.slice(0, urlpath.length - 1);
    }

    for (const path of pathnames) {
        if (path.includes("/") || path.includes("\\") || path.includes("..")) {
            throw new Error("Unsafe pathname: " + path);
        }

        urlpath += (path === "" ? "" : "/" + path);
    }

    new_url.pathname = urlpath;
    return new_url;
    // TODO: safe?
}

export const repo_query = {
    // GETs a file path relative to the repo root
    api_call: async (filepath: string) => {
        const url = new URL(filepath, repo_url_obj);

        const response = await fetch(url.toString());
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.text();
    },

    // returns null if not found, otherwise returns the contents of the file
    get_pkg_json: async (pkg: string) => {
        pkg = encodeURI(pkg);
        pkg = pkg.replace(/\./g, "%2E");

        // repo/pkgs/pkg/
        const url = append_url_pathnames(repo_url_obj, ["pkgs", pkg, "pkg.json"]);

        const response = await fetch(url.toString());
        if (!response.ok) {
            if (response.status === 404) {
                return null;
            }

            throw new Error(`HTTP error! status: ${response.status}`);
        }

        return await response.json();
    },

    // returns null if not found, otherwise returns the meta.json file as an object
    get_pkg_meta: async (pkg: string, version: string) => {
        pkg = encodeURI(pkg);
        version = encodeURI(version);
        pkg = pkg.replace(/\./g, "%2E");
        version = version.replace(/\./g, "%2E");

        // repo/pkgs/pkg/version/
        const url = append_url_pathnames(repo_url_obj, ["pkgs", pkg, version, "meta.json"]);

        const response = await fetch(url.toString());
        if (!response.ok) {
            if (response.status === 404) {
                return null;
            }

            throw new Error(`HTTP error! status: ${response.status}`);
        }

        return await response.json();
    },

    // gets a file within a package or returns null if not found
    get_pkg_file: async (pkg: string, version: string, filepath: string) => {
        pkg = encodeURI(pkg);
        version = encodeURI(version);
        filepath = encodeURI(filepath);
        pkg = pkg.replace(/\./g, "%2E");
        version = version.replace(/\./g, "%2E");
        filepath = filepath.replace(/\./g, "%2E");

        // repo/pkgs/pkg/version/filepath
        const url = append_url_pathnames(repo_url_obj, ["pkgs", pkg, version, filepath]);

        const response = await fetch(url.toString());
        if (!response.ok) {
            if (response.status === 404) {
                return null;
            }

            throw new Error(`HTTP error! status: ${response.status}`);
        }

        return await response.text();
    }
}

// extract from ANSI to make code less verbose
const { STYLE, PREFABS } = ANSI;

export default {
    name: "pkg",
    description: "The package manager for OllieOS.",
    usage_suffix: "[-h] [subcommand] [arguments]",
    arg_descriptions: {
        "Subcommands:": {
            "add": `Installs a list of packages: ${PREFABS.program_name}pkg${STYLE.reset_all + STYLE.italic} add <packages...>${STYLE.reset_all}`,
            "remove": `Uninstalls a list of packages: ${PREFABS.program_name}pkg${STYLE.reset_all + STYLE.italic} remove <packages...>${STYLE.reset_all}`,
            "list": `Lists all installed packages: ${PREFABS.program_name}pkg${STYLE.reset_all + STYLE.italic} list${STYLE.reset_all}`,
            "info": `Displays information about a package: ${PREFABS.program_name}pkg${STYLE.reset_all + STYLE.italic} info [-r] <package>${STYLE.reset_all}`,
            "read": `Reads the long description for a package if it has one: ${PREFABS.program_name}pkg${STYLE.reset_all + STYLE.italic} read [-r] <package>${STYLE.reset_all}`,
            "browse": `Browse the repository for packages and versions: ${PREFABS.program_name}pkg${STYLE.reset_all + STYLE.italic} browse${STYLE.reset_all}`,
        },
        "Arguments:": {
            "-h": "Displays this help message.",
            "For add:": {
                "packages": "The packages to install, separated by spaces. If you wish to install a specific version, use the format 'package@version'.",
            },
            "For remove:": {
                "packages": "The packages to uninstall, separated by spaces.",
            },
            "For info:": {
                "-r": "Always fetch the latest information from the repository.",
                "package": "The package to get information about.",
            },
            "For read:": {
                "-r": "Always fetch the latest information from the repository.",
                "package": "The package to read the long description of.",
            },
        }
    },
    async_main: async (data) => {
        // TODO: safety prompt on first use

        // extract from data to make code less verbose
        const { args, term } = data;

        if (args.length === 0) {
            term.writeln(`${PREFABS.error}Missing subcommand.`)
            term.writeln(`Try 'pkg -h' for more information.${STYLE.reset_all}`);
            return 1;
        }

        if (args.includes("-h")) {
            term.execute("help pkg");
            return 0;
        }

        // TODO: support multiple packages at once

        switch (args[0]) {
            case "add":
                return await add_subcommand(data);
            case "remove":
                return await remove_subcommand(data);
            case "list":
                term.writeln(`${PREFABS.error}Not implemented yet.${STYLE.reset_all}`);
                break;
            case "info":
                term.writeln(`${PREFABS.error}Not implemented yet.${STYLE.reset_all}`);
                break;
            case "read":
                term.writeln(`${PREFABS.error}Not implemented yet.${STYLE.reset_all}`);
                break;
            case "browse":
                term.writeln(`${PREFABS.error}Not implemented yet.${STYLE.reset_all}`);
                break;
            default:
                term.writeln(`${PREFABS.error}Invalid subcommand.`);
                term.writeln(`Try 'pkg -h' for more information.${STYLE.reset_all}`);
                return 1;
        }

        return 0;
    }
} as AsyncProgram;