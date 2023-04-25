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

export enum FSEventType {
    READING_FILE,
    WROTE_FILE,
    DELETED_FILE,
    MOVED_FILE,

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

    _cache: { [path: string]: string | Uint8Array } = {};
    _callbacks: Map<FSEventType, FSEventHandler[]> = new Map();

    _root = "/";
    _home = "/home";
    _cwd = this._home;

    abstract get_unique_fs_type_name(): string;

    purge_cache(): void {
        this._cache = {};
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


    read_file(path: string, as_uint = false): string | Uint8Array {
        this._call_callbacks(FSEventType.READING_FILE, path);

        // check if file is in cache and still exists
        if (this._cache[path] && this.exists(path)) {
            return this._cache[path];
        }

        // if not, read it from disk and cache it
        return this._cache[path] = this.read_file_direct(path, as_uint);
    }

    write_file(path: string, data: string | Uint8Array): void {
        // write to disk and cache
        this._cache[path] = data;
        this.write_file_direct(path, data);
        this._call_callbacks(FSEventType.WROTE_FILE, path);
    }

    delete_file(path: string): void {
        // delete from cache and disk
        delete this._cache[path];
        this.delete_file_direct(path);
        this._call_callbacks(FSEventType.DELETED_FILE, path);
    }

    move_file(path: string, new_path: string): void {
        // move in cache and disk
        this._cache[new_path] = this._cache[path];
        delete this._cache[path];
        this.move_file_direct(path, new_path);
        this._call_callbacks(FSEventType.MOVED_FILE, path);
    }


    abstract list_dir(path: string): string[];
    abstract make_dir(path: string): void;
    abstract delete_dir(path: string, recursive: boolean): void;
    abstract move_dir(path: string, new_path: string): void;

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
        if (this._cache[path]) {
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
}
