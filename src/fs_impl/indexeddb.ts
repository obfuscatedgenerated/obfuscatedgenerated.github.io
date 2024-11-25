import {AbstractFileSystem, FSEventType, PathNotFoundError, NonRecursiveDirectoryError} from "../filesystem";

import {Dexie} from "dexie";

const DB_NAME = "ollieos_idb_fs";
const DB_VERSION = 1;

export class IndexedDBFS extends AbstractFileSystem {
    _db: Dexie;

    get_unique_fs_type_name(): string {
        return "indexeddb";
    }

    erase_all(): void {
        return;
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

    move_dir_direct(path: string, new_path: string): void {
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

    constructor() {
        super();

        this._db = new Dexie(DB_NAME);
    }
}