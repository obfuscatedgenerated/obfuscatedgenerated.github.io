// import {AbstractFileSystem} from "../filesystem";
//
// export class OPFSFileSystem extends AbstractFileSystem {
//     private _opfs_handle: FileSystemDirectoryHandle | null = null;
//
//     get_unique_fs_type_name(): string {
//         return "opfs";
//     }
//
//     constructor() {
//         super();
//
//         // get the root directory handle
//         navigator.storage.getDirectory().then((handle) => {
//             this._opfs_handle = handle;
//         }).catch((err) => {
//             console.error("Failed to get OPFS directory handle:", err);
//         });
//     }
//
//     private get_root_handle(): FileSystemDirectoryHandle {
//         if (!this._opfs_handle) {
//             throw new Error("OPFS directory handle is not initialised.");
//         }
//
//         return this._opfs_handle;
//     }
//
//     async make_dir(path: string) {
//         const root = this.get_root_handle();
//         const parts = path.split("/").filter(part => part.length > 0);
//
//         let current_handle = root;
//         for (const part of parts) {
//             current_handle = await current_handle.getDirectoryHandle(part, { create: true });
//         }
//     }
//
//     async dir_exists(path: string): Promise<boolean> {
//         try {
//             const root = this.get_root_handle();
//             const parts = path.split("/").filter(part => part.length > 0);
//
//             let current_handle = root;
//             for (const part of parts) {
//                 current_handle = await current_handle.getDirectoryHandle(part);
//             }
//
//             return true;
//         } catch (err) {
//             return false;
//         }
//     }
// }
