/**
 * Error thrown when a path is not found.
 *
 * @group Userspace
 * @category Filesystem
 */
export class PathNotFoundError extends Error {
    constructor(path: string) {
        super(`Path not found: ${path}`);
    }
}

/**
 * Error thrown when attempting to delete a non-empty directory without recursive flag.
 *
 * @group Userspace
 * @category Filesystem
 */
export class NonRecursiveDirectoryError extends Error {
    constructor(path: string) {
        super(`Refusing to delete non-empty directory: ${path}`);
    }
}

/**
 * Error thrown when attempting to move a directory into a non-empty destination.
 *
 * @group Userspace
 * @category Filesystem
 */
export class MoveDestinationDirectoryNotEmptyError extends Error {
    constructor(path: string) {
        super(`Destination directory is not empty: ${path}`);
    }
}

/**
 * Error thrown when attempting to write to a read-only path.
 *
 * @group Userspace
 * @category Filesystem
 */
export class ReadOnlyError extends Error {
    constructor(path: string) {
        super(`Path is read-only: ${path}`);
    }
}

/**
 * Event types emitted after filesystem operations.
 *
 * @group Userspace
 * @category Filesystem
 */
export enum FSEventType {
    READING_FILE,
    WROTE_FILE,
    DELETED_FILE,
    MOVED_FILE,
    SET_READONLY,

    LISTING_DIR,
    MADE_DIR,
    DELETED_DIR,
    MOVED_DIR,

    SET_CWD,
    GETTING_CWD,
    SET_HOME,
    GETTING_HOME,
    SET_ROOT,
    GETTING_ROOT,

    CHECKING_EXISTS,
    CHECKING_DIR_EXISTS,
}

// TODO: ensure all functions fire these events (opfs doesnt at all yet!)

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
 * Interface for interacting with the chosen filesystem implementation from userspace.
 *
 * @group Userspace
 * @category Filesystem
 */
export interface UserspaceFileSystem {
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
    exists(path: string): Promise<boolean>;
    dir_exists(path: string): Promise<boolean>;
    join(base_dir: string, ...paths: string[]): string;
    absolute(path: string): string;
    get_cwd(): string;
    set_cwd(path: string): void;
    get_home(): string;
    get_root(): string;
}

// TODO: could protect erase_all but then also need to check recursive deletion, doesnt really gain much

/**
 * Interface for interacting with a filesystem implementation.
 *
 * @group Kernel (Privileged)
 * @category Filesystem
 */
export abstract class AbstractFileSystem {
    //TODO: dry

    // note some members are conventionally private with _ prefix to allow implementations to access them
    // they wont be exposed to userspace though

    _initialised = false;

    readonly #cache: Map<string, { readonly: boolean, content: string | Uint8Array, as_uint: boolean }> = new Map();
    readonly #callbacks: Map<FSEventType, FSEventHandler[]> = new Map();

    _root = "/";
    _home = "/home";
    _cwd = this._home;

    abstract get_unique_fs_type_name(): string;
    abstract erase_all(): Promise<void>;

    abstract is_ready(): Promise<boolean>;

    purge_cache(smart = false): void {
        if (smart) {
            for (const path in this.#cache) {
                if (!this.exists_direct(path)) {
                    this.#cache.delete(path);
                }
            }
        } else {
            this.#cache.clear();
        }
    }

    force_remove_from_cache(path: string): void {
        this.#cache.delete(path);
    }

    remote_purge_cache(smart: boolean): void {
        localStorage.setItem("purge_cache", smart.toString());
    }

    remote_remove_from_cache(path: string): void {
        localStorage.setItem("remove_from_cache", path);
    }

    #remote_listener(): void {
        const purge_cache = localStorage.getItem("purge_cache");
        if (purge_cache) {
            this.purge_cache(purge_cache === "true");
            localStorage.removeItem("purge_cache");
        }

        const remove_from_cache = localStorage.getItem("remove_from_cache");
        if (remove_from_cache) {
            this.force_remove_from_cache(remove_from_cache);
            localStorage.removeItem("remove_from_cache");
        }
    }


    register_callback(event_type: FSEventType, callback: FSEventHandler): () => void {
        // if there are no callbacks for this event type, create an empty array
        if (!this.#callbacks.has(event_type)) {
            this.#callbacks.set(event_type, []);
        }

        // add callback to array
        this.#callbacks.get(event_type).push(callback);

        // return function to remove callback
        return () => {
            this.#callbacks.get(event_type).splice(this.#callbacks.get(event_type).indexOf(callback), 1);
        }
    }

    _call_callbacks(event_type: FSEventType, data: string): void {
        // call all callbacks
        for (const callback of this.#callbacks.get(event_type) ?? []) {
            callback(data, this);
        }
    }


    abstract read_file_direct(path: string, as_uint: boolean): Promise<string | Uint8Array>;
    abstract write_file_direct(path: string, data: string | Uint8Array): Promise<void>;
    abstract delete_file_direct(path: string): Promise<void>;
    // does not check if destination exists
    abstract move_file_direct(src: string, new_path: string): Promise<void>;
    abstract set_readonly_direct(path: string, readonly: boolean): Promise<void>;
    abstract is_readonly_direct(path: string): Promise<boolean>;


    async read_file(path: string, as_uint = false): Promise<string | Uint8Array> {
        // prevent prototype pollution

        this._call_callbacks(FSEventType.READING_FILE, path);

        // check if file is in cache and still exists, as well as if it's the correct type
        const cached = this.#cache.get(path);
        if (cached && await this.exists(path) && cached.as_uint === as_uint) {
            return this.#cache.get(path).content;
        }

        // if not, read it from disk and cache it
        const content = await this.read_file_direct(path, as_uint);
        this.#cache.set(path, { readonly: await this.is_readonly(path), content, as_uint });
        return content;
    }

    async write_file(path: string, data: string | Uint8Array, force = false): Promise<void> {
        // check if file is readonly
        let readonly = false;
        if (await this.exists(path)) {
            readonly = await this.is_readonly(path);
            
            if (!force && readonly) {
                throw new ReadOnlyError(path);
            }
        }

        // write to disk and cache
        this.#cache.set(path, { readonly, content: data, as_uint: data instanceof Uint8Array });
        await this.write_file_direct(path, data);
        this._call_callbacks(FSEventType.WROTE_FILE, path);
    }

    async delete_file(path: string): Promise<void> {
        // delete from cache and disk
        if (this.#cache.has(path)) {
            this.#cache.delete(path);
        }
        await this.delete_file_direct(path);
        this._call_callbacks(FSEventType.DELETED_FILE, path);
    }

    // does not check if destination exists
    async move_file(path: string, new_path: string): Promise<void> {
        // move in cache and disk
        this.#cache.set(new_path, this.#cache.get(path));
        this.#cache.delete(path);
        await this.move_file_direct(path, new_path);
        this._call_callbacks(FSEventType.MOVED_FILE, path);
    }

    async set_readonly(path: string, readonly: boolean): Promise<void> {
        // check if file exists
        if (!await this.exists(path)) {
            throw new PathNotFoundError(path);
        }

        // set readonly in cache and disk
        const entry = this.#cache.get(path);
        if (entry) {
            entry.readonly = readonly;
            this.#cache.set(path, entry);
        } else {
            this.#cache.set(path, {readonly, content: await this.read_file(path), as_uint: false});
        }

        await this.set_readonly_direct(path, readonly);
        this._call_callbacks(FSEventType.SET_READONLY, path);
    }

    async is_readonly(path: string): Promise<boolean> {
        // check if file exists
        if (!await this.exists(path)) {
            throw new PathNotFoundError(path);
        }

        // check if file is in cache
        const cached = this.#cache.get(path);
        if (cached) {
            return cached.readonly;
        }

        // if not, check on disk (cannot cache as would need to read content, causes recursive call)
        return this.is_readonly_direct(path);
    }


    abstract list_dir(path: string, dirs_first?: boolean): Promise<string[]>;
    // (recursive)
    abstract make_dir(path: string): Promise<void>;
    abstract delete_dir_direct(path: string, recursive: boolean): Promise<void>;
    abstract move_dir_direct(src: string, dest: string, force_move_inside: boolean): Promise<void>;

    async delete_dir(path: string, recursive = false): Promise<void> {
        await this.delete_dir_direct(path, recursive);

        // smart purge cache
        this.purge_cache(true);
    }

    async move_dir(src: string, dest: string, force_move_inside = false): Promise<void> {
        await this.move_dir_direct(src, dest, force_move_inside);

        // smart purge cache
        this.purge_cache(true);
    }

    get_cwd(): string {
        this._call_callbacks(FSEventType.GETTING_CWD, this._cwd);
        return this._cwd;
    }

    set_cwd(path: string): void {
        // if path ends with /, remove it
        if (path.endsWith("/")) {
            path = path.slice(0, -1);
        }

        // if path is empty, set to root
        if (path === "") {
            path = this._root;
        }

        this._cwd = path;
        this._call_callbacks(FSEventType.SET_CWD, path);
    }


    get_home(): string {
        this._call_callbacks(FSEventType.GETTING_HOME, this._home);
        return this._home;
    }

    set_home(path: string): void {
        this._home = path;
        this._call_callbacks(FSEventType.SET_HOME, path);
    }

    get_root(): string {
        this._call_callbacks(FSEventType.GETTING_ROOT, this._root);
        return this._root;
    }

    set_root(path: string): void {
        this._root = path;
        this._call_callbacks(FSEventType.SET_ROOT, path);
    }


    abstract exists_direct(path: string): Promise<boolean>;
    abstract dir_exists(path: string): Promise<boolean>;

    async exists(path: string): Promise<boolean> {
        // check if file is in cache
        if (this.#cache.has(path)) {
            return true;
        }

        // if not, check if it exists on disk
        this._call_callbacks(FSEventType.CHECKING_EXISTS, path);
        return this.exists_direct(path);
    }

    absolute(path: string): string {
        // if path is blank, path is root
        if (path === "") {
            return this._root;
        }

        // if path is ., return cwd
        // TODO: is it safer to run this assumption then do the rest of the code rather than do the following root/cwd checks?
        if (path === ".") {
            return this._cwd;
        }

        // if path is ~, return home
        // TODO: again, same for this and the later ~/ check
        if (path === "~") {
            return this._home;
        }

        // if path starts with cwd and doesn't contain .., it is absolute
        if (path.startsWith(this._cwd) && !path.includes("..")) {
            return path;
        }

        // if path starts with root and doesn't contain .., it is absolute
        if (path.startsWith(this._root) && !path.includes("..")) {
            return path;
        }

        // drop leading ./
        if (path.startsWith("./")) {
            path = path.slice(2);
        }


        let effective_cwd = this._cwd;

        // if path starts with .., step up the cwd
        while (path.startsWith("..") && effective_cwd !== this._root) {
            path = path.slice(2);

            // drop leading /
            if (path.startsWith("/")) {
                path = path.slice(1);
            }

            effective_cwd = effective_cwd.slice(0, effective_cwd.lastIndexOf("/"));
        }

        // TODO: doesn't support middle of path ..
        // if path ends with .., remove the last part of the full path
        while (path.endsWith("..")) {
            path = path.slice(0, path.lastIndexOf(".."));

            // drop trailing /
            if (path.endsWith("/")) {
                path = path.slice(0, path.length - 1);
            }

            // slice path, slicing effective_cwd if path is empty
            if (path === "") {
                effective_cwd = effective_cwd.slice(0, effective_cwd.lastIndexOf("/"));
            } else {
                path = path.slice(0, path.lastIndexOf("/"));

                if (path === "") {
                    effective_cwd = effective_cwd.slice(0, effective_cwd.lastIndexOf("/"));
                }
            }
        }

        // if path starts with ~/, replace it with home
        if (path.startsWith("~/")) {
            path = path.slice(2);
            effective_cwd = this._home;
        }

        // if path still starts with /, drop it
        if (path.startsWith("/")) {
            path = path.slice(1);
        }

        return this.join(effective_cwd, path);
    }

    join(base_dir: string, ...paths: string[]): string {
        // drop trailing /
        if (base_dir.endsWith("/")) {
            base_dir = base_dir.slice(0, base_dir.length - 1);
        }

        // join base_dir and path, using slash if path is not empty
        for (let path of paths) {
            if (path.startsWith("/")) {
                path = path.slice(1);
            }

            if (path === "") {
                continue;
            }

            base_dir += "/" + path;
        }

        return base_dir;
    }

    protected constructor() {
        // check if the cache should be purged from remote changes
        setInterval(() => this.#remote_listener(), 100);
    }

    static create_userspace_proxy(fs: AbstractFileSystem): UserspaceFileSystem {
        const self = fs;
        const proxy = Object.create(null);

        // write protect certain kernel secured paths
        const check_path = (path: string): string => {
            const absolute_path = self.absolute(path);

            const is_protected =
                absolute_path === "/sys" ||
                absolute_path.startsWith("/sys/") ||
                absolute_path === "/boot" ||
                absolute_path.startsWith("/boot/");

            if (is_protected) {
                throw new ReadOnlyError(absolute_path);
            }

            return absolute_path;
        };

        Object.defineProperties(proxy, {
            get_unique_fs_type_name: { value: () => self.get_unique_fs_type_name(), enumerable: true },
            erase_all: { value: () => self.erase_all(), enumerable: true },
            purge_cache: { value: (smart?: boolean) => self.purge_cache(smart), enumerable: true },
            read_file: { value: (path: string, as_uint?: boolean) => self.read_file(self.absolute(path), as_uint), enumerable: true },
            list_dir: { value: (path: string, dirs_first?: boolean) => self.list_dir(self.absolute(path), dirs_first), enumerable: true },
            exists: { value: (path: string) => self.exists(self.absolute(path)), enumerable: true },
            dir_exists: { value: (path: string) => self.dir_exists(self.absolute(path)), enumerable: true },
            is_readonly: {
                value: async (path: string) => {
                    try {
                        check_path(path);
                    } catch (e) {
                        if (e instanceof ReadOnlyError) {
                            return true;
                        }

                        throw e;
                    }

                    return await self.is_readonly(self.absolute(path));
                },
                enumerable: true
            },
            join: { value: (base: string, ...paths: string[]) => self.join(base, ...paths), enumerable: true },
            absolute: { value: (path: string) => self.absolute(path), enumerable: true },
            get_cwd: { value: () => self.get_cwd(), enumerable: true },
            get_home: { value: () => self.get_home(), enumerable: true },
            get_root: { value: () => self.get_root(), enumerable: true },
            write_file: {
                value: (path: string, data: string | Uint8Array, force?: boolean) =>
                    self.write_file(check_path(path), data, force),
                enumerable: true
            },
            delete_file: {
                value: (path: string) => self.delete_file(check_path(path)),
                enumerable: true
            },
            move_file: {
                value: (path: string, new_path: string) => {
                    return self.move_file(check_path(path), check_path(new_path));
                },
                enumerable: true
            },
            make_dir: {
                value: (path: string) => self.make_dir(check_path(path)),
                enumerable: true
            },
            delete_dir: {
                value: (path: string, recursive?: boolean) => self.delete_dir(check_path(path), recursive),
                enumerable: true
            },
            move_dir: {
                value: (src: string, dest: string, move_inside?: boolean) => {
                    return self.move_dir(check_path(src), check_path(dest), move_inside);
                },
                enumerable: true
            },
            set_readonly: {
                value: (path: string, readonly: boolean) => self.set_readonly(check_path(path), readonly),
                enumerable: true
            },
            set_cwd: { value: (path: string) => self.set_cwd(path), enumerable: true }
        });

        return Object.freeze(proxy);
    }
}

// TODO: need a way to block programs from accessing the localstorage/OPFS themselves directly, maybe need a function wrapper for that to shadow it away?

// TODO: doc methods in both interfaces!
