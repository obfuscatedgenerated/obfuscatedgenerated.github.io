/**
 * Pure path helpers shared by the filesystem and the RPC shim, so both resolve paths identically.
 *
 * @module
 */

export interface PathContext {
    root: string;
    home: string;
    cwd?: string;
}

export const join_path = (base_dir: string, ...paths: string[]): string => {
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
};

export const absolute_path = (path: string, context: PathContext): string => {
    const {root, home} = context;
    let cwd = context.cwd;

    if (!cwd) {
        console.warn("Warning: no cwd passed to absolute");
    }

    // absoluteify cwd if it doesnt begin with root, to prevent weird edge cases
    if (cwd && !cwd.startsWith(root)) {
        cwd = absolute_path(cwd, {root, home});
    }

    // if path is blank, path is root
    if (path === "") {
        return root;
    }

    // if path is ., return cwd
    // TODO: is it safer to run this assumption then do the rest of the code rather than do the following root/cwd checks?
    if (path === ".") {
        if (!cwd) {
            throw new Error("Cannot resolve relative path without cwd");
        }

        return cwd;
    }

    // if path is ~, return home
    // TODO: again, same for this and the later ~/ check
    if (path === "~") {
        return home;
    }

    // if path starts with cwd and doesn't contain .., it is absolute
    if (cwd && path.startsWith(cwd) && !path.includes("..")) {
        return path;
    }

    // if path starts with root and doesn't contain .., it is absolute
    if (path.startsWith(root) && !path.includes("..")) {
        return path;
    }

    // drop leading ./
    if (path.startsWith("./")) {
        path = path.slice(2);
    }

    if (!cwd) {
        cwd = root;
    }

    let effective_cwd = cwd;

    // if path starts with .., step up the cwd
    while (path.startsWith("..") && effective_cwd !== root) {
        path = path.slice(2);

        // drop leading /
        if (path.startsWith("/")) {
            path = path.slice(1);
        }

        effective_cwd = effective_cwd.slice(0, effective_cwd.lastIndexOf("/"));
    }

    // TODO: doesn't support middle of path ..
    // if path ends with .., remove the last part of the full path
    while (path.endsWith("..")) {
        path = path.slice(0, path.lastIndexOf(".."));

        // drop trailing /
        if (path.endsWith("/")) {
            path = path.slice(0, path.length - 1);
        }

        // slice path, slicing effective_cwd if path is empty
        if (path === "") {
            effective_cwd = effective_cwd.slice(0, effective_cwd.lastIndexOf("/"));
        } else {
            path = path.slice(0, path.lastIndexOf("/"));

            if (path === "") {
                effective_cwd = effective_cwd.slice(0, effective_cwd.lastIndexOf("/"));
            }
        }
    }

    // if path starts with ~/, replace it with home
    if (path.startsWith("~/")) {
        path = path.slice(2);
        effective_cwd = home;
    }

    // if path still starts with /, drop it
    if (path.startsWith("/")) {
        path = path.slice(1);
    }

    return join_path(effective_cwd, path);
};
