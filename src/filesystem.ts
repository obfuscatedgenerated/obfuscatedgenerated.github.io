export class PathNotFoundError extends Error {
    constructor(path: string) {
        super(`Path not found: ${path}`);
    }
}

export class NonRecursiveDirectoryError extends Error {
    constructor(path: string) {
        super(`Refusing to delete non-empty directory: ${path}`);
    }
}

export class ReadOnlyError extends Error {
    constructor(path: string) {
        super(`Path is read-only: ${path}`);
    }
}

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

export type FSEventHandler = (data: string, fs: FileSystem) => void;

export abstract class FileSystem {
    //TODO: dry
    _initialised = false;

    _cache: Map<string, { readonly: boolean, content: string | Uint8Array, as_uint: boolean }> = new Map();
    _callbacks: Map<FSEventType, FSEventHandler[]> = new Map();

    _root = "/";
    _home = "/home";
    _cwd = this._home;

    abstract get_unique_fs_type_name(): string;

    purge_cache(smart = false): void {
        if (smart) {
            for (const path in this._cache) {
                if (!this.exists_direct(path)) {
                    this._cache.delete(path);
                }
            }
        } else {
            this._cache = new Map();
        }
    }

    force_remove_from_cache(path: string): void {
        this._cache.delete(path);
    }

    remote_purge_cache(smart: boolean): void {
        localStorage.setItem("purge_cache", smart.toString());
    }

    remote_remove_from_cache(path: string): void {
        localStorage.setItem("remove_from_cache", path);
    }

    _remote_listener(): void {
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
        if (!this._callbacks.has(event_type)) {
            this._callbacks.set(event_type, []);
        }

        // add callback to array
        this._callbacks.get(event_type).push(callback);

        // return function to remove callback
        return () => {
            this._callbacks.get(event_type).splice(this._callbacks.get(event_type).indexOf(callback), 1);
        }
    }

    _call_callbacks(event_type: FSEventType, data: string): void {
        // call all callbacks
        for (const callback of this._callbacks.get(event_type) ?? []) {
            callback(data, this);
        }
    }


    abstract read_file_direct(path: string, as_uint: boolean): string | Uint8Array;
    abstract write_file_direct(path: string, data: string | Uint8Array): void;
    abstract delete_file_direct(path: string): void;
    abstract move_file_direct(path: string, new_path: string): void;
    abstract set_readonly_direct(path: string, readonly: boolean): void;
    abstract is_readonly_direct(path: string): boolean;


    read_file(path: string, as_uint = false): string | Uint8Array {
        // prevent prototype pollution

        this._call_callbacks(FSEventType.READING_FILE, path);

        // check if file is in cache and still exists, as well as if it's the correct type
        if (this._cache.has(path) && this.exists(path) && this._cache.get(path).as_uint === as_uint) {
            return this._cache.get(path).content;
        }

        // if not, read it from disk and cache it
        const content = this.read_file_direct(path, as_uint);
        this._cache.set(path, { readonly: this.is_readonly(path), content, as_uint });
        return content;
    }

    write_file(path: string, data: string | Uint8Array, force = false): void {
        // check if file is readonly
        let readonly = false;
        if (this.exists(path)) {
            readonly = this.is_readonly(path);
            
            if (!force && readonly) {
                throw new ReadOnlyError(path);
            }
        }

        // write to disk and cache
        this._cache.set(path, { readonly, content: data, as_uint: data instanceof Uint8Array });
        this.write_file_direct(path, data);
        this._call_callbacks(FSEventType.WROTE_FILE, path);
    }

    delete_file(path: string): void {
        // delete from cache and disk
        if (this._cache.has(path)) {
            this._cache.delete(path);
        }
        this.delete_file_direct(path);
        this._call_callbacks(FSEventType.DELETED_FILE, path);
    }

    move_file(path: string, new_path: string): void {
        // move in cache and disk
        this._cache.set(new_path, this._cache.get(path));
        this._cache.delete(path);
        this.move_file_direct(path, new_path);
        this._call_callbacks(FSEventType.MOVED_FILE, path);
    }

    set_readonly(path: string, readonly: boolean): void {
        // check if file exists
        if (!this.exists(path)) {
            throw new PathNotFoundError(path);
        }

        // set readonly in cache and disk
        if (this._cache.get(path)) {
            const entry = this._cache.get(path);
            entry.readonly = readonly;
            this._cache.set(path, entry);
        } else {
            this._cache.set(path, {readonly, content: this.read_file(path), as_uint: false});
        }

        this.set_readonly_direct(path, readonly);
        this._call_callbacks(FSEventType.SET_READONLY, path);
    }

    is_readonly(path: string): boolean {
        // check if file exists
        if (!this.exists(path)) {
            throw new PathNotFoundError(path);
        }

        // check if file is in cache
        if (this._cache.has(path)) {
            return this._cache.get(path).readonly;
        }

        // if not, check on disk (cannot cache as would need to read content, causes recursive call)
        return this.is_readonly_direct(path);
    }


    abstract list_dir(path: string): string[];
    abstract make_dir(path: string): void;
    abstract delete_dir_direct(path: string, recursive: boolean): void;
    abstract move_dir(path: string, new_path: string): void;

    delete_dir(path: string, recursive = false): void {
        this.delete_dir_direct(path, recursive);

        // smart purge cache
        this.purge_cache(true);
    }

    get_cwd(): string {
        this._call_callbacks(FSEventType.GETTING_CWD, this._cwd);
        return this._cwd;
    }

    set_cwd(path: string): void {
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


    abstract exists_direct(path: string): boolean;
    abstract dir_exists(path: string): boolean;

    exists(path: string): boolean {
        // check if file is in cache
        if (this._cache.has(path)) {
            return true;
        }

        // if not, check if it exists on disk
        this._call_callbacks(FSEventType.CHECKING_EXISTS, path);
        return this.exists_direct(path);
    }

    absolute(path: string): string {
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

    join(base_dir: string, path: string): string {
        // join base_dir and path, keeping in mind that base_dir might not end with /
        return base_dir + (base_dir.endsWith("/") ? "" : "/") + path;
    }

    constructor() {
        // check if the cache should be purged from remote changes
        setInterval(() => this._remote_listener(), 100);
    }
}
