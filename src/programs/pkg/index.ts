import { add_subcommand, remove_subcommand } from "./add_rem";

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
        if (".?#".includes(path)) {
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

    // returns null if not found, otherwise returns the contents of the file
    get_pkg_contents: async (pkg: string, version: string) => {
        pkg = encodeURI(pkg);
        version = encodeURI(version);

        // repo/pkgs/pkg/version/
        const url = append_url_pathnames(repo_url_obj, ["pkgs", pkg, version, "contents.txt"]);

        const response = await fetch(url.toString());
        if (!response.ok) {
            if (response.status === 404) {
                return null;
            }

            throw new Error(`HTTP error! status: ${response.status}`);
        }

        return await response.text();
    },

    // gets a file within a package or returns null if not found
    get_pkg_file: async (pkg: string, version: string, filepath: string) => {
        pkg = encodeURI(pkg);
        version = encodeURI(version);
        filepath = encodeURI(filepath);

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

export default {
    name: "pkg",
    description: "The package manager for OllieOS.",
    usage_suffix: "[-h] [subcommand] [arguments]",
    arg_descriptions: {
        "Subcommands:": {
            "add": "Installs a package.",
            "remove": "Uninstalls a package.",
            "list": "Lists all installed packages.",
            "info": "Displays information about a package.",
        },
        "Arguments:": {
            "-h": "Displays this help message.",
            "For add, remove, info:": {
                "package": "The package to install/remove/query.",
            },
        }
    },
    async_main: async (data) => {
        // TODO: safety prompt on first use

        // extract from data to make code less verbose
        const { args, term } = data;

        // extract from ANSI to make code less verbose
        const { STYLE, PREFABS } = ANSI;

        if (args.length === 0) {
            term.writeln(`${PREFABS.error}Missing subcommand.`)
            term.writeln(`Try 'pkg -h' for more information.${STYLE.reset_all}`);
            return 1;
        }

        if (args.includes("-h")) {
            term.execute("help pkg");
            return 0;
        }

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