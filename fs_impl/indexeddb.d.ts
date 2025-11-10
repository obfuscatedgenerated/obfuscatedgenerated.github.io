import { AbstractFileSystem } from "../filesystem";
export declare class IndexedDBFS extends AbstractFileSystem {
    _idb: IDBDatabase;
    get_unique_fs_type_name(): string;
    erase_all(): void;
    make_dir(path: string): void;
    delete_dir_direct(path: string, recursive: boolean): void;
    move_dir_direct(path: string, new_path: string): void;
    list_dir(path: string): string[];
    read_file_direct(path: string): string;
    write_file_direct(path: string, data: string): void;
    delete_file_direct(path: string): void;
    move_file_direct(path: string, new_path: string): void;
    set_readonly_direct(path: string, readonly: boolean): void;
    is_readonly_direct(path: string): boolean;
    exists_direct(path: string): boolean;
    dir_exists(path: string): boolean;
    _finish_init(req: IDBOpenDBRequest): void;
    constructor();
}
