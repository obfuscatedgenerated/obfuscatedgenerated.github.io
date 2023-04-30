import { FileSystem, FSEventType, NonRecursiveDirectoryError, PathNotFoundError } from "../filesystem";

// TODO: may get laggy with large files and many files or dirs
// NOTE: not using implements (TS) so the real methods can be used
// indexeddb fs is superior
// TODO: unsolveable prototype pollution without banning filenames. tried using map, but recursive traversal wont work as the instances are distinct (not writing to the original state dict)
// on the plus side, the base64 encoding seems to prevent this from happening since they arent strings, but the cache will disagree
export class LocalStorageFS extends FileSystem {
    get_unique_fs_type_name(): string {
        return "localstorage";
    }

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

    delete_dir_direct(path: string, recursive: boolean): void {
        const state = JSON.parse(localStorage.getItem("fs"));
        let current_dir = state;

        // split path into parts, if root, use single empty string to avoid doubling
        const parts = path === this._root ? [""] : path.split("/");

        // delete innermost directory
        for (let part_idx = 0; part_idx < parts.length; part_idx++) {
            const part = parts[part_idx];
            const absolute_path = parts.slice(0, parts.indexOf(part) + 1).join("/");

            if (!recursive && this.list_dir(absolute_path).length > 0) {
                throw new NonRecursiveDirectoryError(part);
            }

            // check if directory exists
            if (!current_dir[part]) {
                throw new PathNotFoundError(absolute_path);
            }

            // delete directory if it's the last part
            if (part_idx === parts.length - 1) {
                console.log("deleting", absolute_path);
                delete current_dir[part];
                this._call_callbacks(FSEventType.DELETED_DIR, absolute_path);
            }

            // recurse into directory to discover the next part
            current_dir = current_dir[part];
        }

        // save state
        localStorage.setItem("fs", JSON.stringify(state));
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


    read_file_direct(path: string, as_uint = false): string | Uint8Array {
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
            // decode data from base64 to avoid errors with special characters
            const b64 = atob(current_part);
            const uint = new Uint8Array(b64.length);
            uint.map((_, i) => uint[i] = b64.charCodeAt(i));

            if (as_uint) {
                return uint;
            } else {
                return new TextDecoder().decode(uint);
            }
        }

        throw new PathNotFoundError(path);
    }

    write_file_direct(path: string, data: string | ArrayBuffer | Uint8Array): void {
        let uint: Uint8Array;

        // convert string to uint8array
        if (typeof data === "string") {
            uint = new TextEncoder().encode(data);
        }

        // convert array buffer to uint8array
        if (data instanceof ArrayBuffer) {
            uint = new Uint8Array(data);
        }

        if (data instanceof Uint8Array) {
            uint = data;
        }

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

        
        // encode data with base64 to avoid errors with special characters
        const b64 = btoa(uint.reduce((prev, byte) => prev + String.fromCharCode(byte), ""))

        // write file to directory
        current_dir[file_name] = b64;
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

        // remove from readonly list if it is there
        const readonly_list = JSON.parse(localStorage.getItem("fs_readonly_paths"));
        if (readonly_list.includes(path)) {
            readonly_list.splice(readonly_list.indexOf(path), 1);
            localStorage.setItem("fs_readonly_paths", JSON.stringify(readonly_list));
        }
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

        // relocate in readonly list if it is there
        const readonly_list = JSON.parse(localStorage.getItem("fs_readonly_paths"));
        if (readonly_list.includes(path)) {
            readonly_list.splice(readonly_list.indexOf(path), 1);
            readonly_list.push(new_path);
            localStorage.setItem("fs_readonly_paths", JSON.stringify(readonly_list));
        }
    }

    set_readonly_direct(path: string, readonly: boolean): void {
        const state = JSON.parse(localStorage.getItem("fs_readonly_paths"));

        if (readonly && !state.includes(path)) {
            state.push(path);
        } else if (!readonly && state.includes(path)) {
            state.splice(state.indexOf(path), 1);
        }

        localStorage.setItem("fs_readonly_paths", JSON.stringify(state));
    }

    is_readonly_direct(path: string): boolean {
        const state = JSON.parse(localStorage.getItem("fs_readonly_paths"));
        return state.includes(path);
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

        // if path ends with /, remove it
        if (path.endsWith("/")) {
            path = path.slice(0, -1);
        }

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

        if (!localStorage.getItem("fs_readonly_paths")) {
            localStorage.setItem("fs_readonly_paths", JSON.stringify([]));
        }

        // initialise root and home directory
        this.make_dir(this._home);

        this._initialised = true;
    }
}