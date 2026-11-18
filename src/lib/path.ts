/**
 * Pure path helpers shared by the filesystem and the RPC shim, so both resolve paths identically.
 *
 * @module
 */

import {define_local} from "./locals";

export interface PathContext {
    root: string;
    home: string;
    cwd?: string;
}

export const join_path = define_local("path.join", (base_dir: string, ...paths: string[]): string => {
    // drop trailing /
    if (base_dir.endsWith("/")) {
        base_dir = base_dir.slice(0, base_dir.length - 1);
    }

    // join base_dir and path, using slash if path is not empty
    for (let path of paths) {
        if (path.startsWith("/")) {
            path = path.slice(1);
        }

        if (path === "") {
            continue;
        }

        base_dir += "/" + path;
    }

    return base_dir;
});

export const absolute_path = (path: string, context: PathContext): string => {
    const {root, home} = context;

    if (!context.cwd) {
        console.warn("Warning: no cwd passed to absolute");
    }

    // if path is blank, path is root
    if (path === "") {
        return root;
    }

    // pick what the path is relative to, then resolve both together, so . and .. work anywhere in either
    let base: string;
    if (path === "~" || path.startsWith("~/")) {
        base = home;
        path = path.slice(1);
    } else if (path.startsWith(root)) {
        base = root;
    } else {
        // a relative cwd (e.g. ~) is resolved first
        base = context.cwd ? absolute_path(context.cwd, {root, home, cwd: root}) : root;
    }

    const segments: string[] = [];
    for (const segment of `${base}/${path}`.split("/")) {
        if (segment === "" || segment === ".") {
            continue;
        }

        // .. at the root stays at the root, as on linux
        if (segment === "..") {
            segments.pop();
            continue;
        }

        segments.push(segment);
    }

    return root + segments.join("/");
};

/**
 * Anything that can report the root, home and current directory, e.g. a filesystem proxy or its stub.
 */
export interface PathSource {
    get_root(): string;
    get_home(): string;
    get_cwd(): string;
}

/**
 * Resolves a path using the root, home and cwd of `this`. Lets filesystem stubs resolve paths without calling the kernel.
 */
export const absolute_from_source = define_local("path.absolute", function (this: PathSource, path: string): string {
    return absolute_path(path, {root: this.get_root(), home: this.get_home(), cwd: this.get_cwd()});
});
