import {AbstractFileSystem, FSEventType, PathNotFoundError, type UserspaceFileSystem} from "../kernel/filesystem";

/**
 * What a {@link ScopedFileSystem} can wrap: a filesystem in the kernel, or a filesystem stub in userspace. Only the members both have are required.
 * Members only the kernel's filesystems have are used when present (events, readiness and cache control).
 */
export type ScopedFileSystemTarget =
    Pick<UserspaceFileSystem, "read_file" | "write_file" | "delete_file" | "move_file" | "list_dir" | "make_dir" | "delete_dir" | "move_dir" | "set_readonly" | "is_readonly" | "exists" | "dir_exists" | "purge_cache" | "get_home">
    & Partial<Pick<AbstractFileSystem, "is_ready" | "register_callback" | "force_remove_from_cache" | "remote_purge_cache" | "remote_remove_from_cache">>;

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

// events whose data is a path, which are forwarded from the underlying filesystem when inside the scope
// (home and root events describe the underlying filesystem's own view, so aren't forwarded)
const PATH_EVENTS = [
    FSEventType.READING_FILE,
    FSEventType.WROTE_FILE,
    FSEventType.DELETED_FILE,
    FSEventType.MOVED_FILE,
    FSEventType.SET_READONLY,
    FSEventType.LISTING_DIR,
    FSEventType.MADE_DIR,
    FSEventType.DELETED_DIR,
    FSEventType.MOVED_DIR,
    FSEventType.CHECKING_EXISTS,
    FSEventType.CHECKING_DIR_EXISTS,
];

// resolves . and .. in an absolute path, never going above /
const normalise_absolute = (path: string): string => {
    const segments: string[] = [];
    for (const segment of path.split("/")) {
        if (segment === "" || segment === ".") {
            continue;
        }

        if (segment === "..") {
            segments.pop();
            continue;
        }

        segments.push(segment);
    }

    return "/" + segments.join("/");
};

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
export class ScopedFileSystem extends AbstractFileSystem {
    readonly #inner: ScopedFileSystemTarget;

    // the directory on the underlying filesystem, normalised, without a trailing slash (or "/" itself)
    readonly #scope_root: string;
    readonly #present_as_root: boolean;

    readonly #unsubscribers: (() => void)[] = [];

    get_unique_fs_type_name(): string {
        return "scoped";
    }

    private constructor(inner: ScopedFileSystemTarget, options: ScopedFileSystemOptions) {
        super();

        if (!options.root.startsWith("/")) {
            throw new Error(`ScopedFileSystem root must be absolute, got: ${options.root}`);
        }

        this.#inner = inner;
        this.#scope_root = normalise_absolute(options.root);
        this.#present_as_root = options.present_as_root ?? true;

        // in its own view, home is /home. otherwise keep the underlying home if it is inside the scope
        if (this.#present_as_root) {
            this._home = "/home";
        } else {
            const inner_home = inner.get_home();
            this._home = this.#to_outer(inner_home) ?? this.#scope_root;
        }

        // forward events for paths inside the scope, so watchers also see changes made outside of this view
        // (only filesystems in the kernel have events, stubs don't)
        const register_callback = typeof inner.register_callback === "function" ? inner.register_callback.bind(inner) : null;
        for (const event_type of register_callback ? PATH_EVENTS : []) {
            this.#unsubscribers.push(register_callback!(event_type, (data) => {
                const outer_path = this.#to_outer(data);
                if (outer_path !== null) {
                    this._call_callbacks(event_type, outer_path);
                }
            }));
        }
    }

    /**
     * Creates a scoped view of a filesystem, once the underlying filesystem is ready and the directory exists.
     */
    static async create(inner: ScopedFileSystemTarget, options: ScopedFileSystemOptions): Promise<ScopedFileSystem> {
        // a stub's filesystem is always ready, as the kernel booted with it
        while (typeof inner.is_ready === "function" && !(await inner.is_ready())) {
            await new Promise((resolve) => setTimeout(resolve, 10));
        }

        const scoped = new ScopedFileSystem(inner, options);

        if (!(await inner.dir_exists(scoped.#scope_root))) {
            await inner.make_dir(scoped.#scope_root);
        }

        scoped._initialised = true;
        return scoped;
    }

    /**
     * Stops forwarding events from the underlying filesystem. The view must not be used after this.
     */
    dispose(): void {
        for (const unsubscribe of this.#unsubscribers) {
            unsubscribe();
        }

        this.#unsubscribers.length = 0;
    }

    #is_inside_scope(inner_path: string): boolean {
        return this.#scope_root === "/" || inner_path === this.#scope_root || inner_path.startsWith(this.#scope_root + "/");
    }

    // a path of this view to the path on the underlying filesystem, refusing anything outside the scope
    #to_inner(path: string): string {
        if (!path.startsWith("/")) {
            throw new Error(`Filesystem paths must be absolute, got: ${path}`);
        }

        const normalised = normalise_absolute(path);

        if (this.#present_as_root) {
            // normalising can't go above /, so this always lands inside the scope
            if (this.#scope_root === "/") {
                return normalised;
            }

            return normalised === "/" ? this.#scope_root : this.#scope_root + normalised;
        }

        if (!this.#is_inside_scope(normalised)) {
            // the same error as a missing path, so nothing about what lies outside is revealed
            throw new PathNotFoundError(path);
        }

        return normalised;
    }

    // a path on the underlying filesystem to the path of this view, or null if it is outside the scope
    #to_outer(inner_path: string): string | null {
        const normalised = normalise_absolute(inner_path);
        if (!this.#is_inside_scope(normalised)) {
            return null;
        }

        if (!this.#present_as_root || this.#scope_root === "/") {
            return normalised;
        }

        return normalised === this.#scope_root ? "/" : normalised.slice(this.#scope_root.length);
    }

    // runs an operation on the underlying filesystem, rewriting any paths in its error messages to this view
    async #run<T>(operation: () => Promise<T>): Promise<T> {
        try {
            return await operation();
        } catch (e) {
            if (this.#present_as_root && this.#scope_root !== "/" && e instanceof Error) {
                e.message = e.message
                    .split(this.#scope_root + "/").join("/")
                    .split(this.#scope_root).join("/");
            }

            throw e;
        }
    }

    async is_ready(): Promise<boolean> {
        if (!this._initialised) {
            return false;
        }

        return typeof this.#inner.is_ready === "function" ? await this.#inner.is_ready() : true;
    }

    // empties the directory, leaving it in place
    async erase_all(): Promise<void> {
        await this.#run(async () => {
            for (const name of await this.#inner.list_dir(this.#scope_root)) {
                const child = this.#scope_root === "/" ? `/${name}` : `${this.#scope_root}/${name}`;

                if (await this.#inner.dir_exists(child)) {
                    await this.#inner.delete_dir(child, true);
                } else {
                    await this.#inner.delete_file(child);
                }
            }
        });
    }

    // the cache lives in the underlying filesystem, so these go there too

    purge_cache(smart = false): void {
        this.#inner.purge_cache(smart);
    }

    // (only filesystems in the kernel have these, so they do nothing over a stub)

    force_remove_from_cache(path: string): void {
        this.#inner.force_remove_from_cache?.(this.#to_inner(path));
    }

    remote_purge_cache(smart: boolean): void {
        this.#inner.remote_purge_cache?.(smart);
    }

    remote_remove_from_cache(path: string): void {
        this.#inner.remote_remove_from_cache?.(this.#to_inner(path));
    }

    // files

    read_file(path: string, as_uint = false): Promise<string | Uint8Array> {
        return this.#run(() => this.#inner.read_file(this.#to_inner(path), as_uint));
    }

    write_file(path: string, data: string | Uint8Array, force = false): Promise<void> {
        return this.#run(() => this.#inner.write_file(this.#to_inner(path), data, force));
    }

    delete_file(path: string): Promise<void> {
        return this.#run(() => this.#inner.delete_file(this.#to_inner(path)));
    }

    move_file(path: string, new_path: string): Promise<void> {
        return this.#run(() => this.#inner.move_file(this.#to_inner(path), this.#to_inner(new_path)));
    }

    set_readonly(path: string, readonly: boolean): Promise<void> {
        return this.#run(() => this.#inner.set_readonly(this.#to_inner(path), readonly));
    }

    is_readonly(path: string): Promise<boolean> {
        return this.#run(() => this.#inner.is_readonly(this.#to_inner(path)));
    }

    // stubs only have the normal operations, so the direct ones go through those too (the underlying filesystem still does its own caching)

    read_file_direct(path: string, as_uint: boolean): Promise<string | Uint8Array> {
        return this.read_file(path, as_uint);
    }

    write_file_direct(path: string, data: string | Uint8Array): Promise<void> {
        return this.write_file(path, data, true);
    }

    delete_file_direct(path: string): Promise<void> {
        return this.delete_file(path);
    }

    move_file_direct(src: string, new_path: string): Promise<void> {
        return this.move_file(src, new_path);
    }

    set_readonly_direct(path: string, readonly: boolean): Promise<void> {
        return this.set_readonly(path, readonly);
    }

    is_readonly_direct(path: string): Promise<boolean> {
        return this.is_readonly(path);
    }

    // directories

    list_dir(path: string, dirs_first = false): Promise<string[]> {
        // entries are names rather than paths, so need no translation
        return this.#run(() => this.#inner.list_dir(this.#to_inner(path), dirs_first));
    }

    make_dir(path: string): Promise<void> {
        return this.#run(() => this.#inner.make_dir(this.#to_inner(path)));
    }

    delete_dir(path: string, recursive = false): Promise<void> {
        return this.#run(async () => {
            const inner_path = this.#to_inner(path);

            // deleting the scope itself would take the whole view with it
            if (inner_path === this.#scope_root) {
                throw new Error("Refusing to delete the root directory.");
            }

            await this.#inner.delete_dir(inner_path, recursive);
        });
    }

    move_dir(src: string, dest: string, force_move_inside = false): Promise<void> {
        return this.#run(async () => {
            const inner_src = this.#to_inner(src);

            if (inner_src === this.#scope_root) {
                throw new Error("Refusing to move the root directory.");
            }

            await this.#inner.move_dir(inner_src, this.#to_inner(dest), force_move_inside);
        });
    }

    delete_dir_direct(path: string, recursive: boolean): Promise<void> {
        return this.delete_dir(path, recursive);
    }

    move_dir_direct(src: string, dest: string, force_move_inside: boolean): Promise<void> {
        return this.move_dir(src, dest, force_move_inside);
    }

    // existence

    exists(path: string): Promise<boolean> {
        return this.#run(() => this.#inner.exists(this.#to_inner(path)));
    }

    exists_direct(path: string): Promise<boolean> {
        return this.exists(path);
    }

    dir_exists(path: string): Promise<boolean> {
        return this.#run(() => this.#inner.dir_exists(this.#to_inner(path)));
    }
}
