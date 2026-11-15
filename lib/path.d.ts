/**
 * Pure path helpers shared by the filesystem and the RPC shim, so both resolve paths identically.
 *
 * @module
 */
export interface PathContext {
    root: string;
    home: string;
    cwd?: string;
}
export declare const join_path: (base_dir: string, ...paths: string[]) => string;
export declare const absolute_path: (path: string, context: PathContext) => string;
/**
 * Anything that can report the root, home and current directory, e.g. a filesystem proxy or its stub.
 */
export interface PathSource {
    get_root(): string;
    get_home(): string;
    get_cwd(): string;
}
/**
 * Resolves a path using the root, home and cwd of `this`. Lets filesystem stubs resolve paths without calling the kernel.
 */
export declare const absolute_from_source: (this: PathSource, path: string) => string;
