export declare class PathNotFoundError extends Error {
    constructor(path: string);
}
export declare class NonRecursiveDirectoryError extends Error {
    constructor(path: string);
}
export declare class ReadOnlyError extends Error {
    constructor(path: string);
}
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
    SET_CWD = 9,
    GETTING_CWD = 10,
    SET_HOME = 11,
    GETTING_HOME = 12,
    SET_ROOT = 13,
    GETTING_ROOT = 14,
    CHECKING_EXISTS = 15,
    CHECKING_DIR_EXISTS = 16
}
export type FSEventHandler = (data: string, fs: AbstractFileSystem) => void;
export declare abstract class AbstractFileSystem {
    _initialised: boolean;
    _cache: Map<string, {
        readonly: boolean;
        content: string | Uint8Array;
        as_uint: boolean;
    }>;
    _callbacks: Map<FSEventType, FSEventHandler[]>;
    _root: string;
    _home: string;
    _cwd: string;
    abstract get_unique_fs_type_name(): string;
    abstract erase_all(): Promise<void>;
    abstract is_ready(): Promise<boolean>;
    purge_cache(smart?: boolean): void;
    force_remove_from_cache(path: string): void;
    remote_purge_cache(smart: boolean): void;
    remote_remove_from_cache(path: string): void;
    _remote_listener(): void;
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
    abstract move_dir_direct(src: string, dest: string, no_overwrite: boolean, move_inside: boolean): Promise<void>;
    delete_dir(path: string, recursive?: boolean): Promise<void>;
    move_dir(src: string, dest: string, no_overwrite?: boolean, move_inside?: boolean): Promise<void>;
    get_cwd(): string;
    set_cwd(path: string): void;
    get_home(): string;
    set_home(path: string): void;
    get_root(): string;
    set_root(path: string): void;
    abstract exists_direct(path: string): Promise<boolean>;
    abstract dir_exists(path: string): Promise<boolean>;
    exists(path: string): Promise<boolean>;
    absolute(path: string): string;
    join(base_dir: string, ...paths: string[]): string;
    protected constructor();
}
