import { FileSystem, FSEventType, PathNotFoundError, NonRecursiveDirectoryError } from "../filesystem";

const DB_NAME = "ollieos_idb_fs";
const DB_VERSION = 1;

// TODO: finish this later, try implement file storage in localstorage first

// NOTE: https://github.com/ebidel/idb.filesystem.js

export class IndexedDBFS extends FileSystem {
    _idb: IDBDatabase;

    get_unique_fs_type_name(): string {
        return "indexeddb";
    }

    make_dir(path: string): void {
        const transaction = this._idb.transaction(["files"], "readwrite");

        // split path into parts, if root, use single empty string to avoid doubling
        const parts = path === this._root ? [""] : path.split("/");

        // create directory for each part inside the previous one
        for (const part of parts) {
            const absolute_path = parts.slice(0, parts.indexOf(part) + 1).join("/");
            
            // create directory as object store
            transaction.objectStore(absolute_path);
        }

    }

    delete_dir_direct(path: string, recursive: boolean): void {
        return;
    }

    move_dir(path: string, new_path: string): void {
        return;
    }

    list_dir(path: string): string[] {
        return [];
    }


    read_file_direct(path: string): string {
        return "";
    }

    write_file_direct(path: string, data: string): void {
        return;
    }

    delete_file_direct(path: string): void {
        return;
    }

    move_file_direct(path: string, new_path: string): void {
        return;
    }

    set_readonly_direct(path: string, readonly: boolean): void {
        return;
    }

    is_readonly_direct(path: string): boolean {
        return false;
    }

    exists_direct(path: string): boolean {
        return false;
    }

    dir_exists(path: string): boolean {
        return false;
    }

    _finish_init(req: IDBOpenDBRequest): void {
        this._idb = req.result;

        // initialise root and home directory
        this.make_dir(this._home);

        this._initialised = true;
    }

    constructor() {
        super();

        // initialise db
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = () => {
            // no object stores needed, created on demand
        }

        request.onsuccess = () => {
            this._finish_init(request);
        }

        request.onerror = () => {
            throw new Error("Could not open IndexedDB: " + request.error);
        }
    }
}