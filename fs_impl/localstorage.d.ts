import { AbstractFileSystem } from "../filesystem";
export declare class LocalStorageFS extends AbstractFileSystem {
    get_unique_fs_type_name(): string;
    erase_all(): void;
    make_dir(path: string): void;
    delete_dir_direct(path: string, recursive: boolean): void;
    move_dir_direct(src: string, dest: string, no_overwrite: boolean, move_inside: boolean): void;
    list_dir(path: string, dirs_first?: boolean): string[];
    read_file_direct(path: string, as_uint?: boolean): string | Uint8Array;
    write_file_direct(path: string, data: string | ArrayBuffer | Uint8Array): void;
    delete_file_direct(path: string): void;
    move_file_direct(src: string, dest: string): void;
    set_readonly_direct(path: string, readonly: boolean): void;
    is_readonly_direct(path: string): boolean;
    exists_direct(path: string): boolean;
    dir_exists(path: string): boolean;
    constructor();
}
