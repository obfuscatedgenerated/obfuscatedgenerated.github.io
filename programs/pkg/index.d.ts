import type { Program } from "../../types";
import type { AbstractFileSystem } from "../../filesystem";
export type PkgAtVersion = `${string}@${string}`;
interface PackageMeta {
    files: string[];
    version: string;
    deps: Set<PkgAtVersion>;
    build_timestamp: number;
    externals: "global" | undefined;
}
export declare const repo_query: {
    api_call: (filepath: string) => Promise<string>;
    get_pkg_json: (pkg: string) => Promise<any>;
    get_pkg_meta: (pkg: string, version: string) => Promise<PackageMeta>;
    get_pkg_file: (pkg: string, version: string, filepath: string) => Promise<string>;
};
interface PkgGraphEntry {
    version: string;
    deps: Set<PkgAtVersion>;
    dependents: Set<PkgAtVersion>;
    top_level: boolean;
}
export declare const json_convert_dep_sets_to_arrs: (key: string, value: any) => any;
export declare const json_convert_dep_arrs_to_sets: (key: string, value: any) => any;
export declare const graph_query: {
    get_pkg_info: (pkg: string) => PkgGraphEntry;
    list_pkgs: (only_top_level?: boolean) => string[];
    pkg_is_installed: (pkg: string, version?: string) => boolean;
    get_pkg_version: (pkg: string) => string | undefined;
    get_pkg_dependents: (pkg: string) => Set<PkgAtVersion> | undefined;
    get_pkg_dependencies: (pkg: string) => Set<PkgAtVersion> | undefined;
    install_new_pkg: (fs: AbstractFileSystem, pkg: string, version: string, deps: Set<PkgAtVersion>, top_level: boolean, dependended_by?: PkgAtVersion) => void;
    promote_pkg_to_top_level: (fs: AbstractFileSystem, pkg: string) => void;
    demote_pkg_from_top_level: (fs: AbstractFileSystem, pkg: string) => void;
    add_pkg_dependent: (fs: AbstractFileSystem, pkg: string, dependent_at_version: PkgAtVersion) => void;
    remove_pkg_dependent: (fs: AbstractFileSystem, pkg: string, dependent_at_version: PkgAtVersion) => void;
    remove_pkg: (fs: AbstractFileSystem, pkg: string, skip_dep_check?: boolean) => void;
    list_unused_pkgs: () => string[];
    get_file_path_in_pkg_bin: (fs: AbstractFileSystem, pkg: string, filepath: string) => string;
};
declare const _default: Program;
export default _default;
