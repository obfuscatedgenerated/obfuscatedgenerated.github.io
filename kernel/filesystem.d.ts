import { ProcessContext } from "./processes";
import { mirror_source, MirrorSource, type sync_members } from "./rpc";
/**
 * Error thrown when a path is not found.
 *
 * @group Userspace
 * @category Filesystem
 */
export declare class PathNotFoundError extends Error {
    constructor(path: string);
}
/**
 * Error thrown when attempting to delete a non-empty directory without recursive flag.
 *
 * @group Userspace
 * @category Filesystem
 */
export declare class NonRecursiveDirectoryError extends Error {
    constructor(path: string);
}
/**
 * Error thrown when attempting to move a directory into a non-empty destination.
 *
 * @group Userspace
 * @category Filesystem
 */
export declare class MoveDestinationDirectoryNotEmptyError extends Error {
    constructor(path: string);
}
/**
 * Error thrown when attempting to write to a read-only path, or when attemping to write to a protected path without privilege.
 *
 * @group Userspace
 * @category Filesystem
 */
export declare class ReadOnlyError extends Error {
    constructor(path: string);
}
/**
 * Error thrown when attempting to read a protected file without privilege.
 *
 * @group Userspace
 * @category Filesystem
 */
export declare class ProtectedFileReadError extends Error {
    constructor(path: string);
}
/**
 * Where programs keep state of their own, in a directory per program named after the program's identity (see {@link Kernel.get_private_storage_path}).
 * Userspace can neither read nor change it, apart from each program's own directory.
 */
export declare const PRIVATE_STORAGE_ROOT = "/var/lib/private";
/**
 * Kernel only. Directories userspace can't change (each one and everything under it), as only the kernel or a kernel function the user allows may.
 * /usr/lib holds what installed packages ship, which their programs in /usr/bin trust.
 */
export declare const WRITE_PROTECTED_PATHS: readonly string[];
/**
 * Kernel only. Directories whose contents userspace can't read. Listing each directory itself is allowed (e.g. which programs have private storage), reading anything under it isn't.
 */
export declare const READ_PROTECTED_PATHS: readonly string[];
/**
 * Kernel only. Whether userspace is refused changing an absolute path.
 * @param private_storage The process's own private storage (see {@link Kernel.get_private_storage_path}), which it may change.
 */
export declare const is_write_protected: (absolute_path: string, private_storage?: string | null) => boolean;
/**
 * Kernel only. Whether userspace is refused reading an absolute path.
 * @param private_storage The process's own private storage (see {@link Kernel.get_private_storage_path}), which it may read.
 */
export declare const is_read_protected: (absolute_path: string, private_storage?: string | null) => boolean;
/**
 * Event types emitted after filesystem operations.
 *
 * @group Userspace
 * @category Filesystem
 */
export declare enum FSEventType {
    READING_FILE = 0,
    WROTE_FILE = 1,
    DELETED_FILE = 2,
    MOVED_FILE = 3,
    SET_READONLY = 4,
    LISTING_DIR = 5,
    MADE_DIR = 6,
    DELETED_DIR = 7,
    MOVED_DIR = 8,
    REMOVED_SET_CWD = 9,
    REMOVED_GETTING_CWD = 10,
    SET_HOME = 11,
    GETTING_HOME = 12,
    SET_ROOT = 13,
    GETTING_ROOT = 14,
    CHECKING_EXISTS = 15,
    CHECKING_DIR_EXISTS = 16
}
/**
 * Handler type for filesystem events.
 * @param data Various string data related to the event, but most likely a path.
 * @param fs The filesystem instance emitting the event.
 *
 * @group Userspace
 * @category Filesystem
 */
export type FSEventHandler = (data: string, fs: AbstractFileSystem) => void;
/**
 * How the RPC layer accesses the filesystem's userspace proxy: these members read synchronously, everything else goes to the kernel.
 * @hidden
 */
export declare const USERSPACE_FILESYSTEM_ANNOTATIONS: {
    readonly get_unique_fs_type_name: "constant";
    readonly get_cwd: "mirrored";
    readonly get_home: "mirrored";
    readonly get_root: "mirrored";
    readonly join: (base_dir: string, ...paths: string[]) => string;
    readonly absolute: (this: import("../lib/path").PathSource, path: string) => string;
};
/**
 * Interface for interacting with the chosen filesystem implementation from userspace.
 *
 * For the privileged API, see {@link AbstractFileSystem}.
 *
 * @group Userspace
 * @category Filesystem
 */
export interface UserspaceFileSystem {
    /** @hidden */
    readonly [sync_members]?: (member: keyof typeof USERSPACE_FILESYSTEM_ANNOTATIONS) => void;
    get_unique_fs_type_name(): string;
    erase_all(): Promise<void>;
    purge_cache(smart?: boolean): void;
    read_file(path: string, as_uint?: boolean): Promise<string | Uint8Array>;
    write_file(path: string, data: string | Uint8Array, force?: boolean): Promise<void>;
    delete_file(path: string): Promise<void>;
    move_file(path: string, new_path: string): Promise<void>;
    list_dir(path: string, dirs_first?: boolean): Promise<string[]>;
    make_dir(path: string): Promise<void>;
    delete_dir(path: string, recursive?: boolean): Promise<void>;
    move_dir(src: string, dest: string, force_move_inside?: boolean): Promise<void>;
    set_readonly(path: string, readonly: boolean): Promise<void>;
    is_readonly(path: string): Promise<boolean>;
    /**
     * Whether the kernel protects a path from this program, so changing it (or reading it, with access "read") needs a kernel func the user allows.
     * Unlike {@link is_readonly}, this is about the path itself rather than a file's read-only flag. A program's own private storage is never protected from it.
     */
    is_protected(path: string, access?: "write" | "read"): Promise<boolean>;
    exists(path: string): Promise<boolean>;
    dir_exists(path: string): Promise<boolean>;
    join(base_dir: string, ...paths: string[]): string;
    absolute(path: string): string;
    get_cwd(): string;
    get_home(): string;
    get_root(): string;
}
/**
 * Interface for interacting with a filesystem implementation.
 *
 * For the userspace API, see {@link UserspaceFileSystem}.
 *
 * @group Kernel (Privileged)
 * @category Filesystem
 */
export declare abstract class AbstractFileSystem implements MirrorSource {
    #private;
    readonly [mirror_source]: true;
    _initialised: (() => void);
    wait_until_initialised(): Promise<void>;
    _root: string;
    _home: string;
    abstract get_unique_fs_type_name(): string;
    abstract erase_all(): Promise<void>;
    purge_cache(smart?: boolean): void;
    force_remove_from_cache(path: string): void;
    register_callback(event_type: FSEventType, callback: FSEventHandler): () => void;
    _call_callbacks(event_type: FSEventType, data: string): void;
    abstract read_file_direct(path: string, as_uint: boolean): Promise<string | Uint8Array>;
    abstract write_file_direct(path: string, data: string | Uint8Array): Promise<void>;
    abstract delete_file_direct(path: string): Promise<void>;
    abstract move_file_direct(src: string, new_path: string): Promise<void>;
    abstract set_readonly_direct(path: string, readonly: boolean): Promise<void>;
    abstract is_readonly_direct(path: string): Promise<boolean>;
    read_file(path: string, as_uint?: boolean): Promise<string | Uint8Array>;
    write_file(path: string, data: string | Uint8Array, force?: boolean): Promise<void>;
    delete_file(path: string): Promise<void>;
    move_file(path: string, new_path: string): Promise<void>;
    set_readonly(path: string, readonly: boolean): Promise<void>;
    is_readonly(path: string): Promise<boolean>;
    abstract list_dir(path: string, dirs_first?: boolean): Promise<string[]>;
    abstract make_dir(path: string): Promise<void>;
    abstract delete_dir_direct(path: string, recursive: boolean): Promise<void>;
    abstract move_dir_direct(src: string, dest: string, force_move_inside: boolean): Promise<void>;
    delete_dir(path: string, recursive?: boolean): Promise<void>;
    move_dir(src: string, dest: string, force_move_inside?: boolean): Promise<void>;
    get_home(): string;
    set_home(path: string): void;
    get_root(): string;
    set_root(path: string): void;
    abstract exists_direct(path: string): Promise<boolean>;
    abstract dir_exists(path: string): Promise<boolean>;
    exists(path: string): Promise<boolean>;
    absolute(path: string, cwd?: string): string;
    join(base_dir: string, ...paths: string[]): string;
    /**
     * @param get_private_storage Gives the process's own private storage, which it may read and change. Asked on each check, as the kernel may only know who the process is once its program is found.
     */
    static create_userspace_proxy(fs: AbstractFileSystem, process: ProcessContext, get_private_storage?: () => string | null): UserspaceFileSystem;
}
