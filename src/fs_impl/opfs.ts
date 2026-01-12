import {AbstractFileSystem, NonRecursiveDirectoryError, PathNotFoundError} from "../kernel/filesystem";

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

    async move_dir_direct(src: string, dest: string, no_overwrite: boolean, move_inside: boolean) {
        // TODO: implement
        return Promise.resolve(undefined);
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
