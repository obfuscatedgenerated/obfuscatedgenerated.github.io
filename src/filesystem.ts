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

export class NotBase64Error extends Error {
    constructor(path: string) {
        super(`File is not base64 encoded: ${path}`);
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

    _cache: { [path: string]: string } = {};
    _callbacks: Map<FSEventType, FSEventHandler[]> = new Map();

    _root = "/";
    _home = "/home";
    _cwd = this._home;


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


    abstract read_file_direct(path: string): string;
    abstract write_file_direct(path: string, data: string): void;
    abstract delete_file_direct(path: string): void;
    abstract move_file_direct(path: string, new_path: string): void;


    // TODO: make less messy, DRY
    read_file(path: string, as_b64 = false, convert_b64 = true): string {
        this._call_callbacks(FSEventType.READING_FILE, path);

        // check if file is in cache and still exists
        if (this._cache[path] && this.exists(path)) {
            const data = this._cache[path];

            if (as_b64) {
                // check first 3 chars are "B64"
                if (data.substr(0, 3) !== "B64") {
                    throw new NotBase64Error(path);
                }

                const trimmed = data.substr(3);

                if (convert_b64) {
                    return decodeURIComponent(escape(atob(trimmed)));
                } else {
                    return trimmed;
                }
            } else {
                return data;
            }
        }

        // if not, read it from disk and cache it
        const data = this.read_file_direct(path);
        this._cache[path] = data;

        if (as_b64) {
            // check first 3 chars are "B64"
            if (data.substr(0, 3) !== "B64") {
                throw new NotBase64Error(path);
            }

            const trimmed = data.substr(3);

            if (convert_b64) {
                return decodeURIComponent(escape(atob(trimmed)));
            } else {
                return trimmed;
            }
        } else {
            return data;
        }
    }

    write_file(path: string, data: string, as_b64 = false, convert_b64 = false): void {
        if (as_b64) {
            const old_dat = data;
            data = "B64";

            if (convert_b64) {
                data += btoa(unescape(encodeURIComponent(old_dat)));
            } else {
                data += old_dat;
            }
        }

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
        // if path starts with cwd, it is absolute
        if (path.startsWith(this._cwd)) {
            return path;
        }

        // if path starts with root, it is absolute
        if (path.startsWith(this._root)) {
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

        // if path starts with ~/, replace it with home
        if (path.startsWith("~/")) {
            path = path.slice(2);
            effective_cwd = this._home;
        }

        return this.join(effective_cwd, path);
    }

    join(base_dir: string, path: string): string {
        // join base_dir and path, keeping in mind that base_dir might not end with /
        return base_dir + (base_dir.endsWith("/") ? "" : "/") + path;
    }
}

// TODO: may get laggy with large files and many files or dirs
// NOTE: not using implements (TS) so the real methods can be used
export class LocalStorageFS extends FileSystem {
    make_dir(path: string): void {
        const state = JSON.parse(localStorage.getItem("fs"));
        let current_dir = state;

        // split path into parts, if root, use single empty string to avoid doubling
        const parts = path === this._root ? [""] : path.split("/");

        // create directory for each part inside the previous one
        for (const part of parts) {
            const absolute_path = parts.slice(0, parts.indexOf(part) + 1).join("/");

            if (!current_dir[part]) {
                current_dir[part] = {};
                this._call_callbacks(FSEventType.MADE_DIR, absolute_path);
            }

            current_dir = current_dir[part];
        }

        // save state
        localStorage.setItem("fs", JSON.stringify(state));
    }

    delete_dir(path: string, recursive: boolean): void {
        const state = JSON.parse(localStorage.getItem("fs"));
        let current_dir = state;

        // split path into parts, if root, use single empty string to avoid doubling
        const parts = path === this._root ? [""] : path.split("/");

        // delete directory for each part inside the previous one
        for (const part of parts) {
            const absolute_path = parts.slice(0, parts.indexOf(part) + 1).join("/");

            if (!recursive && this.list_dir(absolute_path).length > 0) {
                throw new NonRecursiveDirectoryError(part);
            }

            if (current_dir[part]) {
                delete current_dir[part];
                this._call_callbacks(FSEventType.DELETED_DIR, absolute_path);
            } else {
                throw new PathNotFoundError(absolute_path);
            }

            current_dir = current_dir[part];
        }
    }

    move_dir(path: string, new_path: string): void {
        const state = JSON.parse(localStorage.getItem("fs"));
        let current_dir = state;

        // split path into parts, if root, use single empty string to avoid doubling
        const parts = path === this._root ? [""] : path.split("/");
        const new_parts = new_path.split("/");

        // move directory for each part
        for (const part of parts) {
            const absolute_path = parts.slice(0, parts.indexOf(part) + 1).join("/");
            const new_absolute_path = new_parts.slice(0, parts.indexOf(part) + 1).join("/");

            if (current_dir[part]) {
                current_dir[new_parts[parts.indexOf(part)]] = current_dir[part];
                delete current_dir[part];
                this._call_callbacks(FSEventType.MOVED_DIR, new_absolute_path);
            } else {
                throw new PathNotFoundError(absolute_path);
            }

            current_dir = current_dir[part];
        }
    }

    list_dir(path: string): string[] {
        this._call_callbacks(FSEventType.LISTING_DIR, path);

        const state = JSON.parse(localStorage.getItem("fs"));
        let current_dir = state;

        // split path into parts, if root, use single empty string to avoid doubling
        const parts = path === this._root ? [""] : path.split("/");

        // get directory for each part inside the previous one
        for (const part of parts) {
            if (current_dir[part]) {
                current_dir = current_dir[part];
            } else {
                throw new PathNotFoundError(path);
            }
        }

        // return list of files in directory
        return Object.keys(current_dir);
    }


    read_file_direct(path: string): string {
        const state = JSON.parse(localStorage.getItem("fs"));

        // split path into parts, if root, use single empty string to avoid doubling
        const parts = path === this._root ? [""] : path.split("/");
        let current_part = state;

        // get directory for each part inside the previous one
        for (const part of parts) {
            // if this is not the last part, check if it is a directory
            if (parts.indexOf(part) !== parts.length - 1 && !current_part[part]) {
                throw new PathNotFoundError(path);
            }

            current_part = current_part[part];
        }

        // check if file exists
        if (current_part) {
            return current_part;
        }

        throw new PathNotFoundError(path);
    }

    write_file_direct(path: string, data: string): void {
        const state = JSON.parse(localStorage.getItem("fs"));
        let current_dir = state;

        // split path into parts, if root, use single empty string to avoid doubling
        const parts = path === this._root ? [""] : path.split("/");
        const file_name = parts[parts.length - 1];

        // get directory for each part inside the previous one
        for (const part of parts) {
            // go until before the last part
            if (parts.indexOf(part) !== parts.length - 1) {
                if (!current_dir[part]) {
                    throw new PathNotFoundError(path);
                }

                current_dir = current_dir[part];
            }
        }

        // write file to directory
        current_dir[file_name] = data;
        localStorage.setItem("fs", JSON.stringify(state));
    }

    delete_file_direct(path: string): void {
        const state = JSON.parse(localStorage.getItem("fs"));
        let current_dir = state;

        // split path into parts, if root, use single empty string to avoid doubling
        const parts = path === this._root ? [""] : path.split("/");
        const file_name = parts[parts.length - 1];

        // get directory for each part inside the previous one
        for (const part of parts) {
            // go until before the last part
            if (parts.indexOf(part) !== parts.length - 1) {
                if (!current_dir[part]) {
                    throw new PathNotFoundError(path);
                }

                current_dir = current_dir[part];
            }
        }

        // delete file from directory
        delete current_dir[file_name];
        localStorage.setItem("fs", JSON.stringify(state));
    }

    move_file_direct(path: string, new_path: string): void {
        const state = JSON.parse(localStorage.getItem("fs"));
        let current_dir = state;

        // split paths into parts, if root, use single empty string to avoid doubling
        const parts = path === this._root ? [""] : path.split("/");
        const new_parts = new_path === this._root ? [""] : new_path.split("/");
        const file_name = parts[parts.length - 1];
        const new_file_name = new_parts[new_parts.length - 1];

        // get directory for each part inside the previous one
        for (const part of parts) {
            // go until before the last part
            if (parts.indexOf(part) !== parts.length - 1) {
                if (!current_dir[part]) {
                    throw new PathNotFoundError(path);
                }

                current_dir = current_dir[part];
            }
        }

        // get directory for each part inside the previous one
        for (const part of new_parts) {
            // go until before the last part
            if (new_parts.indexOf(part) !== new_parts.length - 1) {
                if (!current_dir[part]) {
                    current_dir[part] = {};
                }

                current_dir = current_dir[part];
            }
        }

        // move file to directory
        current_dir[new_file_name] = current_dir[file_name];
        delete current_dir[file_name];
        localStorage.setItem("fs", JSON.stringify(state));
    }

    exists_direct(path: string): boolean {
        const state = JSON.parse(localStorage.getItem("fs"));
        let current_part = state;

        // split path into parts, if root, use single empty string to avoid doubling
        const parts = path === this._root ? [""] : path.split("/");

        // get directory for each part inside the previous one
        for (const part of parts) {
            if (current_part[part]) {
                current_part = current_part[part];
            } else {
                return false;
            }
        }

        return true;
    }

    dir_exists(path: string): boolean {
        const state = JSON.parse(localStorage.getItem("fs"));
        let current_part = state;

        // split path into parts, if root, use single empty string to avoid doubling
        const parts = path === this._root ? [""] : path.split("/");

        // get directory for each part inside the previous one
        for (const part of parts) {
            if (current_part[part]) {
                current_part = current_part[part];
            } else {
                return false;
            }
        }

        return typeof current_part === "object";
    }

    constructor() {
        super();

        // initialise file system
        if (!localStorage.getItem("fs")) {
            localStorage.setItem("fs", JSON.stringify({}));
        }

        // initialise root and home directory
        this.make_dir(this._home);

        this._initialised = true;
    }
}