/**
 * localStorage, IndexedDB and the other storage APIs that isolated programs don't have (their origin is opaque), backed by files in the OllieOS filesystem.
 * Also provides sessionStorage and navigator.storage, and document.cookie in frames.
 *
 * Nothing is installed by default. A program that needs them calls {@link install_web_storage} before running the code that uses them
 * (e.g. a game that saves its settings), and only its own thread or frame gets them.
 *
 * IndexedDB is provided by fake-indexeddb, kept in memory and saved to the filesystem after every transaction that changes it.
 * Each database is saved as one file, so this suits settings and saves of a few MB, not large datasets.
 * Two running copies of the same program would overwrite each other's saves (the last to write wins).
 *
 * @module
 */
/**
 * The parts of the filesystem used to persist storage. A program's own `kernel.get_fs()` provides them.
 */
export interface WebStorageFileSystem {
    absolute(path: string): string;
    exists(path: string): Promise<boolean>;
    dir_exists(path: string): Promise<boolean>;
    make_dir(path: string): Promise<void>;
    read_file(path: string, as_uint?: boolean): Promise<string | Uint8Array>;
    write_file(path: string, data: string | Uint8Array): Promise<void>;
    delete_file(path: string): Promise<void>;
    list_dir(path: string): Promise<string[]>;
}
export interface WebStorageOptions {
    /** Install localStorage (and sessionStorage, which isn't persisted). Default true. */
    local_storage?: boolean;
    /** Install IndexedDB. Default true. */
    indexed_db?: boolean;
    /** Install document.cookie, in programs that have a document (needs_dom). Cookies without an expiry only last until the program exits. Default true. */
    cookies?: boolean;
    /** Install navigator.storage (estimate, persist and persisted). Default true. */
    storage_manager?: boolean;
}
/**
 * Gives the calling program localStorage and IndexedDB, saved under the given directory. Call it before running code that uses them.
 * Installs into the program's own thread or frame only.
 *
 * @param fs The program's filesystem, i.e. `kernel.get_fs()`.
 * @param dir Where to keep the data, e.g. "~/.local/share/my_program". Created if it doesn't exist.
 *
 * @example
 * await install_web_storage(kernel.get_fs(), "~/.local/share/classicube");
 */
export declare const install_web_storage: (program_fs: WebStorageFileSystem, dir: string, options?: WebStorageOptions) => Promise<void>;
