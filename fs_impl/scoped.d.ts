import { AbstractFileSystem, type UserspaceFileSystem } from "../kernel/filesystem";
/**
 * What a {@link ScopedFileSystem} can wrap: a filesystem in the kernel, or a filesystem stub in userspace. Only the members both have are required.
 * Members only the kernel's filesystems have are used when present (events, readiness and cache control).
 */
export type ScopedFileSystemTarget = Pick<UserspaceFileSystem, "read_file" | "write_file" | "delete_file" | "move_file" | "list_dir" | "make_dir" | "delete_dir" | "move_dir" | "set_readonly" | "is_readonly" | "exists" | "dir_exists" | "purge_cache" | "get_home"> & Partial<Pick<AbstractFileSystem, "wait_until_initialised" | "register_callback" | "force_remove_from_cache">>;
/**
 * Options for a {@link ScopedFileSystem}.
 */
export interface ScopedFileSystemOptions {
    /**
     * The directory of the underlying filesystem to confine to, e.g. "/vms/test". Created if it doesn't exist.
     */
    root: string;
    /**
     * When true, the directory appears as "/" and nothing outside it can be named (e.g. a virtual machine's disk).
     * When false, paths are the real ones of the underlying filesystem, and anything outside the directory is refused.
     * Defaults to true.
     */
    present_as_root?: boolean;
}
/**
 * Confines any filesystem to one of its directories. Works over any implementation, in the kernel or over a userspace filesystem stub, as it only uses the members both have (see {@link ScopedFileSystemTarget}).
 *
 * Every operation is passed straight to the underlying filesystem (so there is one cache, and changes made outside the scope are seen immediately), with paths translated on the way in and out.
 * Paths are resolved before being checked, so . and .. can't be used to leave the scope.
 *
 * Only a security boundary when the kernel creates it and hands out its userspace proxy: anything holding the underlying filesystem can bypass it.
 * Created in userspace (e.g. by a virtual machine over its own filesystem stub), it keeps the view contained, but code sharing its realm could still reach the stub.
 *
 * Create with {@link ScopedFileSystem.create}, which waits for the underlying filesystem and makes the directory.
 */
export declare class ScopedFileSystem extends AbstractFileSystem {
    #private;
    get_unique_fs_type_name(): string;
    private constructor();
    /**
     * Creates a scoped view of a filesystem, once the underlying filesystem is ready and the directory exists.
     */
    static create(inner: ScopedFileSystemTarget, options: ScopedFileSystemOptions): Promise<ScopedFileSystem>;
    /**
     * Stops forwarding events from the underlying filesystem. The view must not be used after this.
     */
    dispose(): void;
    erase_all(): Promise<void>;
    purge_cache(smart?: boolean): void;
    force_remove_from_cache(path: string): void;
    read_file(path: string, as_uint?: boolean): Promise<string | Uint8Array>;
    write_file(path: string, data: string | Uint8Array, force?: boolean): Promise<void>;
    delete_file(path: string): Promise<void>;
    move_file(path: string, new_path: string): Promise<void>;
    set_readonly(path: string, readonly: boolean): Promise<void>;
    is_readonly(path: string): Promise<boolean>;
    read_file_direct(path: string, as_uint: boolean): Promise<string | Uint8Array>;
    write_file_direct(path: string, data: string | Uint8Array): Promise<void>;
    delete_file_direct(path: string): Promise<void>;
    move_file_direct(src: string, new_path: string): Promise<void>;
    set_readonly_direct(path: string, readonly: boolean): Promise<void>;
    is_readonly_direct(path: string): Promise<boolean>;
    list_dir(path: string, dirs_first?: boolean): Promise<string[]>;
    make_dir(path: string): Promise<void>;
    delete_dir(path: string, recursive?: boolean): Promise<void>;
    move_dir(src: string, dest: string, force_move_inside?: boolean): Promise<void>;
    delete_dir_direct(path: string, recursive: boolean): Promise<void>;
    move_dir_direct(src: string, dest: string, force_move_inside: boolean): Promise<void>;
    exists(path: string): Promise<boolean>;
    exists_direct(path: string): Promise<boolean>;
    dir_exists(path: string): Promise<boolean>;
}
