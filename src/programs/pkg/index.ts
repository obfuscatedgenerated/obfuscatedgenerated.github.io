import {add_subcommand} from "./add";
import {remove_subcommand} from "./remove";

import {ANSI} from "../../term_ctl";
import type {Program} from "../../types";
import type {AbstractFileSystem} from "../../filesystem";
import {list_subcommand} from "./list";
import {info_subcommand} from "./info";
import {browse_subcommand} from "./browse";
import {helper_completion_options} from "../../tab_completion";


const REPO_URL = "https://ollieg.codes/pkg_repo";
const repo_url_obj = new URL(REPO_URL);
// TODO: in future, this can be changed. it will also be a list of repos in priority order, and the first one that has the package will be used.

const GRAPH_DIR = "/var/lib/pkg";
const GRAPH_PATH = GRAPH_DIR + "/graph.json";

const BIN_DIR = "/usr/bin";

// TODO: subcommand template / helper

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

export type PkgAtVersion = `${string}@${string}`;

interface PackageMeta {
    files: string[];
    version: string;
    deps: Set<PkgAtVersion>;
    build_timestamp: number;
    externals: "global" | undefined;
}

export const repo_query = {
    // GETs a file path relative to the repo root
    // TODO: why did i write this and not use it?? all other fetches are just this but returning null for a 404?? am i stupid?? it's being exported so maybe i had a reason
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
    get_pkg_meta: async (pkg: string, version: string): Promise<PackageMeta> => {
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

        // TODO: validate meta

        const data = await response.json();

        // convert deps to set
        data.deps = new Set(data.deps);

        return data;
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
    },

    get_provided_list: async () => {
        // repo/provided.txt
        const url = append_url_pathnames(repo_url_obj, ["provided.txt"]);

        const response = await fetch(url.toString());
        if (!response.ok) {
            if (response.status === 404) {
                return null;
            }

            throw new Error(`HTTP error! status: ${response.status}`);
        }

        // newline separated list of provided package names
        const data = await response.text();
        return data.split("\n").map((line) => line.trim()).filter((line) => line.length > 0);
    },

    get_pkg_versions: async (pkg: string) => {
        pkg = encodeURI(pkg);
        pkg = pkg.replace(/\./g, "%2E");

        // repo/pkgs/pkg/versions.txt
        const url = append_url_pathnames(repo_url_obj, ["pkgs", pkg, "versions.txt"]);
        const response = await fetch(url.toString());
        if (!response.ok) {
            if (response.status === 404) {
                return null;
            }

            throw new Error(`HTTP error! status: ${response.status}`);
        }

        // newline separated list of versions
        const data = await response.text();
        return data.split("\n").map((line) => line.trim()).filter((line) => line.length > 0);
    }
}

interface PkgGraphEntry {
    version: string;
    deps: Set<PkgAtVersion>;
    dependents: Set<PkgAtVersion>;
    top_level: boolean; // as in, specified by the user at install time
}

export const json_convert_dep_sets_to_arrs = (key: string, value: any) => {
    if (key !== "deps" && key !== "dependents") {
        return value;
    }

    if (value instanceof Set) {
        return Array.from(value);
    }

    throw new Error(`${key} not a set in graph to be stringified!`);
}

export const json_convert_dep_arrs_to_sets = (key: string, value: any) => {
    if (key !== "deps" && key !== "dependents") {
        return value;
    }

    if (Array.isArray(value)) {
        return new Set(value);
    }

    throw new Error(`${key} not an array in graph to be parsed!`);
}

let graph: { [pkg_name: string]: PkgGraphEntry } = {};
export const graph_query = {
    // TODO: graph consistency checks / repair function
    // TODO: dangling dep check

    // gets the graph entry for a package
    get_pkg_info: (pkg: string): PkgGraphEntry => {
        return graph[pkg];
    },

    // lists names of all installed packages, optionally only top level
    list_pkgs: (only_top_level = false) => {
        const pkgs = Object.keys(graph);

        if (only_top_level) {
            return pkgs.filter((pkg) => graph[pkg].top_level);
        }

        return pkgs;
    },

    // checks if a package is installed, optionally with a specific version
    pkg_is_installed: (pkg: string, version?: string) => {
        if (!graph[pkg]) {
            return false;
        }

        if (version) {
            return graph[pkg].version === version;
        }

        return true;
    },

    // gets the version of an installed package, or undefined if not installed
    get_pkg_version: (pkg: string): string | undefined => {
        return graph[pkg]?.version;
    },

    // gets the dependents of a package, or undefined if not installed
    get_pkg_dependents: (pkg: string): Set<PkgAtVersion> | undefined => {
        return graph[pkg]?.dependents;
    },

    // gets the dependencies of a package, or undefined if not installed
    get_pkg_dependencies: (pkg: string): Set<PkgAtVersion> | undefined => {
        return graph[pkg]?.deps;
    },

    // installs a NEW package. if this is not a top level package, you must specify an initial dependent. you cannot modify an existing package unless you use the defined functions.
    install_new_pkg: async (fs: AbstractFileSystem, pkg: string, version: string, deps: Set<PkgAtVersion>, top_level: boolean, dependended_by?: PkgAtVersion) => {
        // TODO: resolve what to do if the package is already installed rather than exploding, makes using it a lot simpler

        if (graph[pkg]) {
            throw new Error(`Package ${pkg} is already installed and cannot be modified.`);
        }

        // TODO: we could assume top level based on if dependended_by is provided, but that's not very precise. top level packages may be dependencies!
        if (!top_level && !dependended_by) {
            throw new Error(`Package ${pkg} is not installed as a top-level package but does not have a dependent it was installed by.`);
        }

        const dependents = new Set<PkgAtVersion>();

        if (dependended_by) {
            dependents.add(dependended_by);
        }

        graph[pkg] = {
            version,
            deps,
            top_level,
            dependents
        };

        // write to file
        await fs.write_file(GRAPH_PATH, JSON.stringify(graph, json_convert_dep_sets_to_arrs));
    },

    // makes a package a top level package, no checks are performed as top level packages may have dependents
    promote_pkg_to_top_level: async (fs: AbstractFileSystem, pkg: string) => {
        if (!graph[pkg]) {
            throw new Error(`Package ${pkg} is not installed.`);
        }

        graph[pkg].top_level = true;

        // write to file
        await fs.write_file(GRAPH_PATH, JSON.stringify(graph, json_convert_dep_sets_to_arrs));
    },

    // makes a package not a top level package, but only if it has no dependents. use add_pkg_dependent FIRST before demoting if it has dependents now.
    demote_pkg_from_top_level: async (fs: AbstractFileSystem, pkg: string) => {
        if (!graph[pkg]) {
            throw new Error(`Package ${pkg} is not installed.`);
        }

        if (graph[pkg].dependents.size > 0) {
            throw new Error(`Package ${pkg} has no dependents and cannot be demoted. Use add_pkg_dependent FIRST.`);
        }

        graph[pkg].top_level = false;

        // write to file
        await fs.write_file(GRAPH_PATH, JSON.stringify(graph, json_convert_dep_sets_to_arrs));
    },

    // adds a dependent to a package, provided the dependent is already installed. also adds the dependency to the dependent package.
    add_pkg_dependent: async (fs: AbstractFileSystem, pkg: string, dependent_at_version: PkgAtVersion) => {
        if (!graph[pkg]) {
            throw new Error(`Package ${pkg} is not installed.`);
        }

        const dependent_name = dependent_at_version.split("@")[0];

        if (!graph[dependent_name]) {
            throw new Error(`Dependent ${dependent_name} is not installed.`);
        }

        const pkg_at_version = `${pkg}@${graph[pkg].version}` as PkgAtVersion;

        graph[pkg].dependents.add(dependent_at_version);
        graph[dependent_name].deps.add(pkg_at_version);

        // write to file
        await fs.write_file(GRAPH_PATH, JSON.stringify(graph, json_convert_dep_sets_to_arrs));
    },

    // removes a dependent from a package, as well as clearing the dependency from the dependent package
    remove_pkg_dependent: async (fs: AbstractFileSystem, pkg: string, dependent_at_version: PkgAtVersion) => {
        if (!graph[pkg]) {
            throw new Error(`Package ${pkg} is not installed.`);
        }

        const dependent_name = dependent_at_version.split("@")[0];

        if (!graph[dependent_name]) {
            throw new Error(`Dependent ${dependent_name} is not installed.`);
        }

        if (!graph[pkg].dependents.has(dependent_at_version)) {
            throw new Error(`Package ${pkg} does not have dependent ${dependent_at_version}.`);
        }

        const pkg_at_version = `${pkg}@${graph[pkg].version}` as PkgAtVersion;

        if (!graph[dependent_name].deps.has(pkg_at_version)) {
            throw new Error(`Inconsistent graph! Dependent ${dependent_name} does not have dependency ${pkg}, but ${pkg} has dependent ${dependent_at_version}.`);
        }

        // need to remove both the dependent from the target package as well as the dependency from the dependent package
        graph[pkg].dependents.delete(dependent_at_version);
        graph[dependent_name].deps.delete(pkg_at_version);

        // write to file
        await fs.write_file(GRAPH_PATH, JSON.stringify(graph, json_convert_dep_sets_to_arrs));

        // uninstall if it has no dependents now? probably not, we can have a separate command for that
    },

    // removes a package from the graph, provided it has no dependents. you can skip this check, but this will leave dangling dependencies.
    remove_pkg: async (fs: AbstractFileSystem, pkg: string, skip_dep_check = false) => {
        if (!graph[pkg]) {
            throw new Error(`Package ${pkg} is not installed.`);
        }

        // check if this package has any dependents
        if (!skip_dep_check && graph[pkg].dependents.size > 0) {
            throw new Error(`Package ${pkg} has dependents and cannot be removed.`);
        }

        // // remove this package from its dependents' dependencies
        // no! don't do this! if they skip the dep check, we don't want to destroy the fact that there are hanging deps
        // for (const dependent of graph[pkg].dependents) {
        //     const dependent_name = dependent.split("@")[0];
        //     graph[dependent_name].deps = graph[dependent_name].deps.filter((dep) => dep !== pkg);
        // }

        // remove this package from its dependencies' dependents
        for (const dep of graph[pkg].deps) {
            const dep_name = dep.split("@")[0];
            graph[dep_name].dependents.delete(`${pkg}@${graph[pkg].version}` as PkgAtVersion);
        }

        // TODO: feels like something is missing? oh well, we'll find out when we test it

        // remove this package from the graph
        delete graph[pkg];

        // write to file
        await fs.write_file(GRAPH_PATH, JSON.stringify(graph, json_convert_dep_sets_to_arrs));
    },

    // lists all packages that are not installed as top level and have no dependents
    list_unused_pkgs: () => {
        return Object.keys(graph).filter((pkg) => !graph[pkg].top_level && graph[pkg].dependents.size === 0);
    },

    get_file_path_in_pkg_bin: (fs: AbstractFileSystem, pkg: string, filepath: string) => {
        const pkg_dir = fs.join(BIN_DIR, pkg);
        return fs.join(pkg_dir, filepath);
    }
}

// extract from ANSI to make code less verbose
const {STYLE, PREFABS} = ANSI;

// TODO: update command (update all installed or specific packages)

export default {
    name: "pkg",
    description: "The package manager for OllieOS.",
    usage_suffix: "[-h] [subcommand] [arguments]",
    arg_descriptions: {
        "Subcommands:": {
            "add": `Installs a list of packages: ${PREFABS.program_name}pkg${STYLE.reset_all + STYLE.italic} add <packages...>${STYLE.reset_all}`,
            "remove": `Uninstalls a list of packages: ${PREFABS.program_name}pkg${STYLE.reset_all + STYLE.italic} remove <packages...>${STYLE.reset_all}`,
            "list": `Lists all installed packages: ${PREFABS.program_name}pkg${STYLE.reset_all + STYLE.italic} list [-t]${STYLE.reset_all}`,
            "info": `Displays information about a package: ${PREFABS.program_name}pkg${STYLE.reset_all + STYLE.italic} info [-r] <package>${STYLE.reset_all}`,
            "read": `Reads the long description for a package if it has one: ${PREFABS.program_name}pkg${STYLE.reset_all + STYLE.italic} read [-r] <package>${STYLE.reset_all}`,
            "browse": `Browse the repository for packages and versions: ${PREFABS.program_name}pkg${STYLE.reset_all + STYLE.italic} browse${STYLE.reset_all}`,
            "clean": `Removes all packages that are not top level and have no dependents (and are therefore unused): ${PREFABS.program_name}pkg${STYLE.reset_all + STYLE.italic} clean [-d]${STYLE.reset_all}`,
        },
        "Arguments:": {
            "-h": "Displays this help message.",
            "For add:": {
                "packages": "The packages to install, separated by spaces. If you wish to install a specific version, use the format 'package@version'.",
            },
            "For remove:": {
                "packages": "The packages to uninstall, separated by spaces.",
            },
            "For list:": {
                "-t": "List only top-level packages.",
            },
            "For info:": {
                "-r": "Always fetch the latest information from the repository.",
                "package": "The package to get information about.",
            },
            "For read:": {
                "-r": "Always fetch the latest information from the repository.",
                "package": "The package to read the long description of.",
            },
            "For clean:": {
                "-d": "Dry run. Lists the packages that would be removed without actually removing them.",
            }
        }
    },
    completion: async (data) => {
        // TODO: smarter completion that understands flags for subcommands
        switch (data.arg_index) {
            case 0:
                return helper_completion_options(["add", "remove", "list", "info", "read", "browse", "clean"])(data);
            case 1:
                if (["info", "read", "remove"].includes(data.args[0])) {
                    // complete with installed package names
                    const fs = data.term.get_fs();

                    // load graph
                    let local_graph: { [pkg_name: string]: PkgGraphEntry } = {};
                    try {
                        local_graph = JSON.parse(await fs.read_file("/var/lib/pkg/graph.json") as string, json_convert_dep_arrs_to_sets);
                    } catch (e) {
                        return [];
                    }

                    const pkgs = Object.keys(local_graph);
                    return helper_completion_options(pkgs)(data);
                }
                break;
        }

        return [];
    },
    main: async (data) => {
        // TODO: safety prompt on first use

        // extract from data to make code less verbose
        const {args, term} = data;
        const fs = term.get_fs();

        if (args.length === 0) {
            term.writeln(`${PREFABS.error}Missing subcommand.`)
            term.writeln(`Try 'pkg -h' for more information.${STYLE.reset_all}`);
            return 1;
        }

        if (args.includes("-h")) {
            term.execute("help pkg");
            return 0;
        }

        // create /var/lib/pkg if it doesn't exist so subcommands don't have to check
        if (!(await fs.exists(GRAPH_DIR))) {
            await fs.make_dir(GRAPH_DIR);
        }

        // create /var/lib/pkg/graph.json if it doesn't exist
        if (!(await fs.exists(GRAPH_PATH))) {
            await fs.write_file(GRAPH_PATH, "{}");
        }

        // load graph
        try {
            graph = JSON.parse(await fs.read_file("/var/lib/pkg/graph.json") as string, json_convert_dep_arrs_to_sets);
        } catch (e) {
            term.writeln(`${PREFABS.error}Fatal error: could not load package graph.${STYLE.reset_all}`);
            return 2;
        }

        switch (args[0]) {
            case "add":
                return await add_subcommand(data);
            case "remove":
                return await remove_subcommand(data);
            case "list":
                return await list_subcommand(data);
            case "info":
                return await info_subcommand(data);
            case "read":
                term.writeln(`${PREFABS.error}Not implemented yet.${STYLE.reset_all}`);
                break;
            case "browse":
                return await browse_subcommand(data);
            case "clean":
                term.writeln(`${PREFABS.error}Not implemented yet.${STYLE.reset_all}`);
                break;
            default:
                term.writeln(`${PREFABS.error}Invalid subcommand.`);
                term.writeln(`Try 'pkg -h' for more information.${STYLE.reset_all}`);
                return 1;
        }

        return 0;
    }
} as Program;