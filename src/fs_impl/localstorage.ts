import { AbstractFileSystem, FSEventType, NonRecursiveDirectoryError, PathNotFoundError } from "../filesystem";

// TODO: may get laggy with large files and many files or dirs
// NOTE: not using implements (TS) so the real methods can be used
// indexeddb fs is superior
// TODO: unsolveable prototype pollution without banning filenames. tried using map, but recursive traversal wont work as the instances are distinct (not writing to the original state dict)
export class LocalStorageFS extends AbstractFileSystem {
    get_unique_fs_type_name(): string {
        return "localstorage";
    }

    async is_ready() {
        return true;
    }

    async erase_all() {
        localStorage.removeItem("fs");
        localStorage.removeItem("fs_readonly_paths");
        localStorage.removeItem("fs_migrations");
    }

    async make_dir(path: string) {
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

    async delete_dir_direct(path: string, recursive: boolean) {
        const state = JSON.parse(localStorage.getItem("fs"));
        let current_dir = state;

        // split path into parts, if root, use single empty string to avoid doubling
        const parts = path === this._root ? [""] : path.split("/");

        // delete innermost directory
        for (let part_idx = 0; part_idx < parts.length; part_idx++) {
            const part = parts[part_idx];
            const absolute_path = parts.slice(0, parts.indexOf(part) + 1).join("/");

            if (!recursive && (await this.list_dir(absolute_path)).length > 0) {
                throw new NonRecursiveDirectoryError(part);
            }

            // check if directory exists
            if (!current_dir[part]) {
                throw new PathNotFoundError(absolute_path);
            }

            // delete directory if it's the last part
            if (part_idx === parts.length - 1) {
                delete current_dir[part];
                this._call_callbacks(FSEventType.DELETED_DIR, absolute_path);
            }

            // recurse into directory to discover the next part
            current_dir = current_dir[part];
        }

        // save state
        localStorage.setItem("fs", JSON.stringify(state));
    }

    async move_dir_direct(src: string, dest: string, no_overwrite: boolean, move_inside: boolean) {
        const state = JSON.parse(localStorage.getItem("fs"));

        // using unix style rules, i.e
        
        // mv dir1 dir2 -> rename dir1 to dir2, or move dir1 into dir2 if dir2 already exists (THIS IS WHEN MOVE_INSIDE IS FALSE)
        // overwrite any files in the destination directory if they exist in the source directory if no_overwrite is false
        // and of course move across any files from the source directory to the destination directory and leave any only in the destination directory alone
        
        // mv dir1 dir2/ -> move dir1 into dir2 (dir2 must exist, dir1 must not exist in dir2) (THIS IS WHEN MOVE_INSIDE IS TRUE, THERE WILL NOT BE A TRAILING / IN THE DESTINATION PATH)

        // split path into parts, if root, use single empty string to avoid doubling
        const src_parts = src === this._root ? [""] : src.split("/");
        const dest_parts = dest.split("/");

        // get directory for each part inside the previous one
        let current_dir = state;
        let current_dir_parent = null;
        for (const part of src_parts) {
            if (!current_dir[part]) {
                throw new PathNotFoundError(src);
            }
            current_dir_parent = current_dir;
            current_dir = current_dir[part];
        }

        // check if source is a directory
        if (typeof current_dir !== "object") {
            throw new PathNotFoundError(src);
        }

        // get directory for each part inside the previous one
        let dest_current_dir = state;
        //let dest_current_dir_parent = null;
        for (const part of dest_parts) {
            if (!dest_current_dir[part]) {
                // if this is the last part, create the directory, otherwise throw an error
                // TODO: is this correct? it acts correct, but is it too lax?
                if (part === dest_parts[dest_parts.length - 1]) {
                    dest_current_dir[part] = {};
                } else {
                    throw new PathNotFoundError(dest);
                }
            }
            //dest_current_dir_parent = dest_current_dir;
            dest_current_dir = dest_current_dir[part];
        }

        // check if destination is a directory
        if (typeof dest_current_dir !== "object") {
            throw new PathNotFoundError(dest);
        }

        // if we have equivalent paths, do nothing (so we don't accidentally delete the directory when calling delete after move)
        if (src === dest) {
            console.warn("source and destination are the same");
            return;
        }

        // TODO: significant fixes required! moving directories is just a mess
        // TODO: need to consolidate exactly when we should be merging directories. its not exactly clear and chatgpt contradicts itself when asking for a formal definition!

        if (move_inside) {
            // if moving inside, check that the directory named the same as the source does not exist in the destination
            if (dest_current_dir[src_parts[src_parts.length - 1]]) {
                throw new Error(`Directory already exists in destination: ${dest}`);
            }

            // move directory inside destination
            dest_current_dir[src_parts[src_parts.length - 1]] = current_dir;

            // delete source directory
            delete current_dir_parent[src_parts[src_parts.length - 1]];
        } else {
            // not moving inside, so merge files and directories from source into destination
            for (const key of Object.keys(current_dir)) {
                if (dest_current_dir[key] && no_overwrite) {
                    throw new Error(`File or directory already exists in destination: ${dest}`);
                }

                dest_current_dir[key] = current_dir[key];
            }

            // delete source directory
            delete current_dir_parent[src_parts[src_parts.length - 1]];
        }

        // save state
        localStorage.setItem("fs", JSON.stringify(state));
    }

    async list_dir(path: string, dirs_first = false) {
        this._call_callbacks(FSEventType.LISTING_DIR, path);

        const state = JSON.parse(localStorage.getItem("fs"));
        let current_dir = state;

        // split path into parts, if root, use single empty string to avoid doubling
        const parts = path === this._root ? [""] : path.split("/");

        // trim trailing slash
        if (parts[parts.length - 1] === "") {
            parts.pop();
        }

        // get directory for each part inside the previous one
        for (const part of parts) {
            if (current_dir[part]) {
                current_dir = current_dir[part];
            } else {
                throw new PathNotFoundError(path);
            }
        }

        // if this is the root we will have an empty parts array, so we need to access the root directory
        // our whole fs is stored under an empty top level key because im stupid
        // we might have to do this elsewhere
        if (parts.length === 0) {
            current_dir = state[""];
        }

        // return list of files in directory
        const keys = Object.keys(current_dir);

        if (dirs_first) {
            for (const key of keys) {
                // promote directories to the front of the list
                if (typeof current_dir[key] === "object") {
                    keys.splice(keys.indexOf(key), 1);
                    keys.unshift(key);
                }
            }
        }

        return keys;
    }


    async read_file_direct(path: string, as_uint = false) {
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
        if (current_part !== undefined) {
            // if file is empty, return empty string / uint8array (or else it will be read as null byte)
            if (current_part.length === 0) {
                if (as_uint) {
                    return new Uint8Array();
                } else {
                    return "";
                }
            }

            const binary_string = atob(current_part);
            const bytes = Uint8Array.from(binary_string, m => m.charCodeAt(0));

            if (as_uint) {
                return bytes;
            } else {
                return new TextDecoder().decode(bytes);
            }
        }

        throw new PathNotFoundError(path);
    }

    async write_file_direct(path: string, data: string | ArrayBuffer | Uint8Array) {
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

        // convert uint8array to base64
        // uint.toBase64() isnt mainstream yet
        current_dir[file_name] = btoa(String.fromCharCode.apply(null, uint));
        localStorage.setItem("fs", JSON.stringify(state));
    }

    async delete_file_direct(path: string) {
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

    async move_file_direct(src: string, dest: string) {
        const state = JSON.parse(localStorage.getItem("fs"));

        // split paths into parts, if root, use single empty string to avoid doubling
        const src_parts = src === this._root ? [""] : src.split("/");
        const dest_parts = dest === this._root ? [""] : dest.split("/");
        const file_name = src_parts[src_parts.length - 1];
        const new_file_name = dest_parts[dest_parts.length - 1];

        // get directory for each part inside the previous one
        let current_dir = state;
        for (const part of src_parts.slice(0, -1)) {
            if (!current_dir[part]) {
                throw new PathNotFoundError(src);
            }
            current_dir = current_dir[part];
        }

        // check if file exists
        if (current_dir[file_name] === undefined) {
            throw new PathNotFoundError(src);
        }

        // get directory for each part inside the previous one
        let new_current_dir = state;
        for (const part of dest_parts.slice(0, -1)) {
            if (!new_current_dir[part]) {
                throw new PathNotFoundError(dest);
            }
            new_current_dir = new_current_dir[part];
        }

        // if we have equivalent paths, do nothing (so we don't accidentally delete the file when calling delete after move)
        if (file_name === new_file_name && current_dir === new_current_dir) {
            console.warn("source and destination are the same");
            return;
        }

        // move file from source to destination
        new_current_dir[new_file_name] = current_dir[file_name];
        delete current_dir[file_name];
        localStorage.setItem("fs", JSON.stringify(state));

        // relocate in readonly list if it is there
        const readonly_list = JSON.parse(localStorage.getItem("fs_readonly_paths"));
        if (readonly_list.includes(src)) {
            readonly_list.splice(readonly_list.indexOf(src), 1);
            readonly_list.push(dest);
            localStorage.setItem("fs_readonly_paths", JSON.stringify(readonly_list));
        }
    }

    async set_readonly_direct(path: string, readonly: boolean) {
        const state = JSON.parse(localStorage.getItem("fs_readonly_paths"));

        if (readonly && !state.includes(path)) {
            state.push(path);
        } else if (!readonly && state.includes(path)) {
            state.splice(state.indexOf(path), 1);
        }

        localStorage.setItem("fs_readonly_paths", JSON.stringify(state));
    }

    async is_readonly_direct(path: string) {
        const state = JSON.parse(localStorage.getItem("fs_readonly_paths"));
        return state.includes(path);
    }

    async exists_direct(path: string) {
        const state = JSON.parse(localStorage.getItem("fs"));
        let current_part = state;

        // split path into parts, if root, use single empty string to avoid doubling
        const parts = path === this._root ? [""] : path.split("/");

        // remove trailing /
        if (parts[parts.length - 1] === "") {
            parts.pop();
        }

        // get directory for each part inside the previous one
        for (const part of parts) {
            // important! empty strings are falsy so we need to specifically check for undefined
            if (current_part[part] !== undefined) {
                current_part = current_part[part];
            } else {
                return false;
            }
        }

        return true;
    }

    async dir_exists(path: string) {
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

        const existing_migrations = localStorage.getItem("fs_migrations");
        if (!existing_migrations) {
            localStorage.setItem("fs_migrations", JSON.stringify({
                string_to_array: false,
                array_to_b64: false,
            }));
        }

        const migrations = JSON.parse(localStorage.getItem("fs_migrations"));

        if (!migrations.string_to_array) {
            // eslint-disable-next-line @typescript-eslint/no-use-before-define
            migrate_old_string_fs(JSON.parse(localStorage.getItem("fs")), true);
        }

        if (!migrations.array_to_b64) {
            // eslint-disable-next-line @typescript-eslint/no-use-before-define
            migrate_old_array_fs(JSON.parse(localStorage.getItem("fs")));
        }

        // mark all migrations as done
        migrations.string_to_array = true;
        migrations.array_to_b64 = true;
        localStorage.setItem("fs_migrations", JSON.stringify(migrations));

        // initialise root and home directory
        this.make_dir(this._home).then(() => {
            this._initialised = true;
        }).catch((err) => {
            console.error("Failed to create home directory:", err);
        });
    }
}

const migrate_old_string_fs = (state: object, is_outer = false) => {
    // migration step: we used to use a string but now we use an array for files
    // need to iterate DEEPLY into nested objects and convert string values to arrays
    // (so recurse)
    // TODO make iterative

    for (const key of Object.keys(state)) {
        if (typeof state[key] === "object" && !Array.isArray(state[key])) {
            migrate_old_string_fs(state[key]);
        } else if (typeof state[key] === "string") {
            console.log(`Migration: converting ${key} to array`);
            state[key] = state[key].split(",").map((x) => parseInt(x));
        }
    }

    if (is_outer) {
        // only save if we are at the outermost level
        localStorage.setItem("fs", JSON.stringify(state));
    }
}

const migrate_old_array_fs = (state: object) => {
    // migration step: we used to use an array for files but now we use base64 strings
    // need to iterate DEEPLY into nested objects and convert array values to strings

    // use a stack to avoid recursion limit issues
    const stack = [state];

    while (stack.length > 0) {
        // get the next object to process
        const current_obj = stack.pop();

        if (current_obj === null || typeof current_obj !== "object" || Array.isArray(current_obj)) {
            continue;
        }

        // iterate over the keys of the current object
        for (const key of Object.keys(current_obj)) {
            const value = current_obj[key];

            if (!value) {
                continue;
            } else if (typeof value === "object" && !Array.isArray(value)) {
                // if the value is a nested object, add it to the stack to be processed later (depth first)
                stack.push(value);
            } else if (Array.isArray(value)) {
                console.log(`Migration: converting ${key} to b64 string`);

                try {
                    const values = value.map((x: string) => parseInt(x));
                    const uint = new Uint8Array(values);
                    // uint.toBase64() isnt mainstream yet
                    current_obj[key] = btoa(String.fromCharCode.apply(null, uint));
                } catch (e) {
                    console.error(`Migration failed for key "${key}":`, e);
                }
            }
        }
    }

    // only save after the whole traversal
    localStorage.setItem("fs", JSON.stringify(state));
}
