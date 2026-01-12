import {
    AbstractFileSystem,
    MoveDestinationDirectoryNotEmptyError,
    NonRecursiveDirectoryError,
    PathNotFoundError
} from "../kernel/filesystem";

export class OPFSFileSystem extends AbstractFileSystem {
    private _opfs_handle: FileSystemDirectoryHandle | null = null;

    get_unique_fs_type_name(): string {
        return "opfs";
    }

    constructor() {
        super();

        if (!localStorage.getItem("fs_readonly_paths")) {
            localStorage.setItem("fs_readonly_paths", JSON.stringify([]));
        }

        // get the root directory handle
        navigator.storage.getDirectory().then((handle) => {
            this._opfs_handle = handle;
            this._initialised = true;
        }).catch((err) => {
            console.error("Failed to get OPFS directory handle:", err);
        });
    }

    async is_ready() {
        return this._opfs_handle !== null;
    }

    private get_root_handle(): FileSystemDirectoryHandle {
        if (!this._opfs_handle) {
            throw new Error("OPFS directory handle is not initialised.");
        }

        return this._opfs_handle;
    }

    async make_dir(path: string) {
        const root = this.get_root_handle();
        const parts = path.split("/").filter(part => part.length > 0);

        let current_handle = root;
        for (const part of parts) {
            current_handle = await current_handle.getDirectoryHandle(part, { create: true });
        }
    }

    async dir_exists(path: string): Promise<boolean> {
        // should return true only for directories

        const root = this.get_root_handle();
        const parts = path.split("/").filter(part => part.length > 0);

        let current_handle = root;
        for (const part of parts) {
            try {
                current_handle = await current_handle.getDirectoryHandle(part);
            } catch (err) {
                if (err instanceof DOMException && (err.name === "NotFoundError" || err.name === "TypeMismatchError")) {
                    return false;
                }
                throw err;
            }
        }

        return true;
    }

    async exists_direct(path: string) {
        // should return true for both files and directories

        const root = this.get_root_handle();
        const parts = path.split("/").filter(part => part.length > 0);

        let current_handle = root;
        for (const part of parts) {
            try {
                current_handle = await current_handle.getDirectoryHandle(part);
            } catch (err) {
                try {
                    await current_handle.getFileHandle(part);
                    return true;
                } catch (err2) {
                    if (err2 instanceof DOMException && err2.name === "NotFoundError") {
                        return false;
                    }
                    throw err2;
                }
            }
        }

        return true;
    }

    async delete_dir_direct(path: string, recursive: boolean) {
        const root = this.get_root_handle();
        const parts = path.split("/").filter(part => part.length > 0);

        try {
            // recurse into directories
            let current_handle = root;
            for (let i = 0; i < parts.length - 1; i++) {
                current_handle = await current_handle.getDirectoryHandle(parts[i]);
            }

            await current_handle.removeEntry(parts[parts.length - 1], { recursive });
        } catch (err) {
            if (err instanceof DOMException && err.name === "NotFoundError") {
                throw new PathNotFoundError(path);
            }

            if (err instanceof DOMException && err.name === "InvalidModificationError" && !recursive) {
                throw new NonRecursiveDirectoryError(path);
            }

            throw err;
        }
    }

    async list_dir(path: string) {
        const root = this.get_root_handle();
        const parts = path.split("/").filter(part => part.length > 0);

        let current_handle = root;
        for (const part of parts) {
            try {
                current_handle = await current_handle.getDirectoryHandle(part);
            } catch (err) {
                if (err instanceof DOMException && err.name === "NotFoundError") {
                    throw new PathNotFoundError(path);
                }

                throw err;
            }
        }

        const entries: string[] = [];
        for await (const [name, handle] of current_handle.entries()) {
            entries.push(name);
        }

        return entries;
    }

    async is_readonly_direct(path: string) {
        const readonly_list = JSON.parse(localStorage.getItem("fs_readonly_paths") || "[]");
        return readonly_list.includes(path);
    }

    async set_readonly_direct(path: string, readonly: boolean) {
        const readonly_list = JSON.parse(localStorage.getItem("fs_readonly_paths") || "[]");

        if (readonly) {
            if (!readonly_list.includes(path)) {
                readonly_list.push(path);
            }
        } else {
            if (readonly_list.includes(path)) {
                readonly_list.splice(readonly_list.indexOf(path), 1);
            }
        }

        localStorage.setItem("fs_readonly_paths", JSON.stringify(readonly_list));
    }

    async move_dir_direct(src: string, dest: string, force_move_inside: boolean) {
        const root = this.get_root_handle();

        // using unix style rules, i.e
        // mv dir1 dir2 ->
        // (if dir2 exists or force_move_inside) move dir1 into dir2
        // (if dir2 doesn't exist) rename dir1 to dir2
        // fail if dir2 exists and dir2/dir1 already exists

        const src_parts = src.split("/").filter(part => part.length > 0);
        const dest_parts = dest.split("/").filter(part => part.length > 0);

        const src_basename = src_parts[src_parts.length - 1];
        const dest_basename = dest_parts[dest_parts.length - 1];

        // get handle for source's parent and source directory
        let src_parent_handle = root;
        for (let i = 0; i < src_parts.length - 1; i++) {
            try {
                src_parent_handle = await src_parent_handle.getDirectoryHandle(src_parts[i]);
            } catch (err) {
                if (err instanceof DOMException && err.name === "NotFoundError") {
                    throw new PathNotFoundError(src);
                }
                throw err;
            }
        }

        let src_handle: FileSystemDirectoryHandle;
        try {
            src_handle = await src_parent_handle.getDirectoryHandle(src_basename);
        } catch (err) {
            if (err instanceof DOMException && err.name === "NotFoundError") {
                throw new PathNotFoundError(src);
            }
            throw err;
        }

        // get handle for destination's parent and try to get destination directory (but not an error yet if it doesn't exist)
        let dest_parent_handle = root;
        for (let i = 0; i < dest_parts.length - 1; i++) {
            try {
                dest_parent_handle = await dest_parent_handle.getDirectoryHandle(dest_parts[i]);
            } catch (err) {
                if (err instanceof DOMException && err.name === "NotFoundError") {
                    throw new PathNotFoundError(dest);
                }
                throw err;
            }
        }

        let dest_handle: FileSystemDirectoryHandle | null = null;
        try {
            dest_handle = await dest_parent_handle.getDirectoryHandle(dest_basename);
        } catch (err) {
            if (err instanceof DOMException && err.name !== "NotFoundError") {
                throw err;
            }
        }

        // apply the rules to determine final destination
        let final_dest_parent_handle: FileSystemDirectoryHandle;
        let final_dest_name: string;

        if (dest_handle || force_move_inside) {
            // if destination already exists or force_move_inside is true, move source inside destination

            if (!dest_handle) {
                throw new PathNotFoundError(dest);
            }

            final_dest_parent_handle = dest_handle;
            final_dest_name = src_basename;
        } else {
            // rename source to destination

            final_dest_parent_handle = dest_parent_handle;
            final_dest_name = dest_basename;
        }

        // ensure destination is empty
        try {
            await final_dest_parent_handle.getDirectoryHandle(final_dest_name);
            throw new MoveDestinationDirectoryNotEmptyError(dest);
        } catch (err) {
            if (err instanceof DOMException && err.name !== "NotFoundError") {
                throw err;
            }
        }

        // perform move, first check if the browser supports handle.move, and if not recursively copy and delete
        if ("move" in src_handle) {
            // @ts-ignore - not part of spec yet
            await src_handle.move(final_dest_parent_handle, final_dest_name);
        } else {
            // copy recursively
            const new_dest_handle = await final_dest_parent_handle.getDirectoryHandle(final_dest_name, { create: true });
            await this.#copy_directory_recursive(src_handle, new_dest_handle);

            // delete source directory
            await src_parent_handle.removeEntry(src_basename, { recursive: true });
        }
    }

    async #copy_directory_recursive(src_handle: FileSystemDirectoryHandle, dest_handle: FileSystemDirectoryHandle) {
        for await (const [name, handle] of src_handle.entries()) {
            if (handle.kind === "file") {
                const file_handle = await src_handle.getFileHandle(name);
                const file = await file_handle.getFile();
                const array_buffer = await file.arrayBuffer();
                const dest_file_handle = await dest_handle.getFileHandle(name, { create: true });
                const writable = await dest_file_handle.createWritable();
                await writable.write(array_buffer);
                await writable.close();
            } else if (handle.kind === "directory") {
                const src_subdir_handle = await src_handle.getDirectoryHandle(name);
                const dest_subdir_handle = await dest_handle.getDirectoryHandle(name, { create: true });
                await this.#copy_directory_recursive(src_subdir_handle, dest_subdir_handle);
            }
        }
    }

    async read_file_direct(path: string, as_uint: boolean) {
        const root = this.get_root_handle();
        const parts = path.split("/").filter(part => part.length > 0);

        // recurse into directories
        let current_handle = root;
        for (let i = 0; i < parts.length - 1; i++) {
            try {
                current_handle = await current_handle.getDirectoryHandle(parts[i]);
            } catch (err) {
                if (err instanceof DOMException && err.name === "NotFoundError") {
                    throw new PathNotFoundError(path);
                }

                throw err;
            }
        }

        let file_handle: FileSystemFileHandle;
        try {
            file_handle = await current_handle.getFileHandle(parts[parts.length - 1]);
        } catch (err) {
            if (err instanceof DOMException && err.name === "NotFoundError") {
                throw new PathNotFoundError(path);
            }
            throw err;
        }

        const file = await file_handle.getFile();
        const array_buffer = await file.arrayBuffer();

        if (as_uint) {
            return new Uint8Array(array_buffer);
        } else {
            const decoder = new TextDecoder();
            return decoder.decode(array_buffer);
        }
    }

    async write_file_direct(path: string, data: string | Uint8Array) {
        const root = this.get_root_handle();
        const parts = path.split("/").filter(part => part.length > 0);
        
        // recurse into directories
        let current_handle = root;
        for (let i = 0; i < parts.length - 1; i++) {
            current_handle = await current_handle.getDirectoryHandle(parts[i], { create: true });
        }

        const file_handle = await current_handle.getFileHandle(parts[parts.length - 1], { create: true });
        const writable = await file_handle.createWritable();

        const data_to_write = (data instanceof Uint8Array) ? data : new TextEncoder().encode(data);

        await writable.write(data_to_write.buffer as ArrayBuffer);
        await writable.close();
    }

    async delete_file_direct(path: string) {
        const root = this.get_root_handle();
        const parts = path.split("/").filter(part => part.length > 0);

        // recurse into directories
        let current_handle = root;
        for (let i = 0; i < parts.length - 1; i++) {
            try {
                current_handle = await current_handle.getDirectoryHandle(parts[i]);
            } catch (err) {
                if (err instanceof DOMException && err.name === "NotFoundError") {
                    throw new PathNotFoundError(path);
                }
                throw err;
            }
        }

        try {
            await current_handle.removeEntry(parts[parts.length - 1]);
        } catch (err) {
            if (err instanceof DOMException && err.name === "NotFoundError") {
                throw new PathNotFoundError(path);
            }
            throw err;
        }

        // remove from readonly list if it is there
        const readonly_list = JSON.parse(localStorage.getItem("fs_readonly_paths"));
        if (readonly_list.includes(path)) {
            readonly_list.splice(readonly_list.indexOf(path), 1);
            localStorage.setItem("fs_readonly_paths", JSON.stringify(readonly_list));
        }
    }

    async move_file_direct(src: string, dest: string) {
        const root = this.get_root_handle();
        const src_parts = src.split("/").filter(part => part.length > 0);
        const dest_parts = dest.split("/").filter(part => part.length > 0);

        // get source file handle
        let current_handle = root;
        for (let i = 0; i < src_parts.length - 1; i++) {
            try {
                current_handle = await current_handle.getDirectoryHandle(src_parts[i]);
            } catch (err) {
                if (err instanceof DOMException && err.name === "NotFoundError") {
                    throw new PathNotFoundError(src);
                }
                throw err;
            }
        }

        let file_handle: FileSystemFileHandle;
        try {
            file_handle = await current_handle.getFileHandle(src_parts[src_parts.length - 1]);
        } catch (err) {
            if (err instanceof DOMException && err.name === "NotFoundError") {
                throw new PathNotFoundError(src);
            }
            throw err;
        }

        const file = await file_handle.getFile();
        const array_buffer = await file.arrayBuffer();

        // write to destination
        current_handle = root;
        for (let i = 0; i < dest_parts.length - 1; i++) {
            current_handle = await current_handle.getDirectoryHandle(dest_parts[i], { create: true });
        }

        const dest_file_handle = await current_handle.getFileHandle(dest_parts[dest_parts.length - 1], { create: true });
        const writable = await dest_file_handle.createWritable();
        await writable.write(array_buffer);
        await writable.close();

        // delete source file
        await this.delete_file_direct(src);
    }

    async erase_all() {
        const root = this.get_root_handle();

        for await (const [name, handle] of root.entries()) {
            if (handle.kind === "file") {
                await root.removeEntry(name);
            } else if (handle.kind === "directory") {
                await root.removeEntry(name, { recursive: true });
            }
        }

        localStorage.removeItem("fs_readonly_paths");
    }
}

// TODO: emit events
