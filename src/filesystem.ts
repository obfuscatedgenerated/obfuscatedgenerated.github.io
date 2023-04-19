export class PathNotFoundError extends Error {
    constructor(path: string) {
        super(`Path not found: ${path}`);
    }
}

export abstract class FileSystem {
    _initialised = false;

    _cache: { [path: string]: string } = {};

    _home = "/";
    _cwd = this._home;


    abstract read_file_direct(path: string): string;
    abstract write_file_direct(path: string, data: string): void;
    abstract delete_file_direct(path: string): void;
    abstract move_file_direct(path: string, new_path: string): void;


    read_file(path: string): string {
        // check if file is in cache
        if (this._cache[path]) {
            return this._cache[path];
        }
        
        // if not, read it from disk and cache it
        return this._cache[path] = this.read_file_direct(path);
    }

    write_file(path: string, data: string): void {
        // write to disk and cache
        this._cache[path] = data;
        this.write_file_direct(path, data);
    }

    delete_file(path: string): void {
        // delete from cache and disk
        delete this._cache[path];
        this.delete_file_direct(path);
    }

    move_file(path: string, new_path: string): void {
        // move in cache and disk
        this._cache[new_path] = this._cache[path];
        delete this._cache[path];
        this.move_file_direct(path, new_path);
    }


    abstract list_dir(path: string): string[];
    abstract make_dir(path: string): void;
    abstract delete_dir(path: string): void;
    abstract move_dir(path: string, new_path: string): void;

    get_cwd(): string {
        return this._cwd;
    }

    set_cwd(path: string): void {
        this._cwd = path;
    }

    
    get_home(): string {
        return this._home;
    }

    set_home(path: string): void {
        this._home = path;
    }
    

    abstract exists_direct(path: string): boolean;
    abstract dir_exists(path: string): boolean;

    exists(path: string): boolean {
        // check if file is in cache
        if (this._cache[path]) {
            return true;
        }

        // if not, check if it exists on disk
        return this.exists_direct(path);
    }
}


// TODO: could implement directory as ... implements Storage to mimic localStorage

// NOTE: not using implements (TS) so the real methods can be used
export class LocalStorageFS extends FileSystem {
    make_dir(path: string): void {
        if (!this.exists(path)) {
            // create empty directory object
            localStorage.setItem(path, "{}");
        }
    }

    delete_dir(path: string): void {
        if (this.exists(path)) {
            localStorage.removeItem(path);
        }
    }

    move_dir(path: string, new_path: string): void {
        if (this.exists(path)) {
            // copy value and remove old key
            localStorage.setItem(new_path, localStorage.getItem(path));
            localStorage.removeItem(path);
        }
    }

    list_dir(path: string): string[] {
        if (this.exists(path)) {
            // return keys of directory object
            return Object.keys(JSON.parse(localStorage.getItem(path)));
        }

        return [];
    }


    read_file_direct(path: string): string {
        // resolve directory path
        const dir_path = path.substring(0, path.lastIndexOf("/"));
        const file_name = path.substring(path.lastIndexOf("/") + 1);

        // get directory object
        const dir = JSON.parse(localStorage.getItem(dir_path));

        // check dir exists and file exists
        if (dir && dir[file_name]) {
            return dir[file_name];
        }

        throw new PathNotFoundError(path);
    }

    write_file_direct(path: string, data: string): void {
        // resolve directory path
        const dir_path = path.substring(0, path.lastIndexOf("/"));
        const file_name = path.substring(path.lastIndexOf("/") + 1);

        // get directory object
        const dir = JSON.parse(localStorage.getItem(dir_path));

        // check dir exists
        if (dir) {
            // add file to directory object
            dir[file_name] = data;
            localStorage.setItem(dir_path, JSON.stringify(dir));
        } else {
            throw new PathNotFoundError(path);
        }
    }

    delete_file_direct(path: string): void {
        // resolve directory path
        const dir_path = path.substring(0, path.lastIndexOf("/"));
        const file_name = path.substring(path.lastIndexOf("/") + 1);

        // get directory object
        const dir = JSON.parse(localStorage.getItem(dir_path));

        // check dir exists and file exists
        if (dir && dir[file_name]) {
            // remove file from directory object
            delete dir[file_name];
            localStorage.setItem(dir_path, JSON.stringify(dir));
        } else {
            throw new PathNotFoundError(path);
        }
    }

    move_file_direct(path: string, new_path: string): void {
        // resolve directory paths
        const dir_path = path.substring(0, path.lastIndexOf("/"));
        const file_name = path.substring(path.lastIndexOf("/") + 1);
        const new_dir_path = new_path.substring(0, new_path.lastIndexOf("/"));
        const new_file_name = new_path.substring(new_path.lastIndexOf("/") + 1);

        // get directory objects
        const dir = JSON.parse(localStorage.getItem(dir_path));
        const new_dir = JSON.parse(localStorage.getItem(new_dir_path));

        // check dir exists and file exists
        if (dir && dir[file_name]) {
            // check new dir exists
            if (new_dir) {
                // add file to new directory object
                new_dir[new_file_name] = dir[file_name];
                localStorage.setItem(new_dir_path, JSON.stringify(new_dir));

                // remove file from old directory object
                delete dir[file_name];
                localStorage.setItem(dir_path, JSON.stringify(dir));
            } else {
                throw new PathNotFoundError(new_path);
            }
        } else {
            throw new PathNotFoundError(path);
        }
    }

    exists_direct(path: string): boolean {
        // resolve directory path
        const dir_path = path.substring(0, path.lastIndexOf("/"));
        const file_name = path.substring(path.lastIndexOf("/") + 1);

        // get directory object
        const dir = JSON.parse(localStorage.getItem(dir_path));

        // check dir exists and file exists
        if (dir && dir[file_name]) {
            return true;
        }

        return false;
    }

    dir_exists(path: string): boolean {
        // check if directory object exists
        if (localStorage.getItem(path)) {
            return true;
        }

        return false;
    }

    constructor() {
        super();

        // initialise home directory
        this.make_dir(this._home);

        this._initialised = true;
    }
}