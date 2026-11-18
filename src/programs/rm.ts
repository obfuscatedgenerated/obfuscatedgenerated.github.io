import type { KernelFuncs, Program } from "../types";
import {ANSI} from "../lib/ansi";

// errors lose their class crossing from the kernel, so they are recognised by name or message
const is_error_like = (error: unknown, name: string, message_prefix: string) =>
    error instanceof Error && (error.name === name || error.message.startsWith(message_prefix));

const is_denied = (error: unknown) => error instanceof Error && error.name === "NotAllowedError";

// the userspace filesystem refuses kernel protected paths, so this uses the kernel's own, after the user has allowed it
export const kernel_funcs = {
    delete_protected: async ({kernel}, input: {path: string, recursive: boolean, force: boolean}) => {
        // input comes from userspace, so nothing about it is assumed
        if (typeof input?.path !== "string" || !input.path.startsWith("/") || typeof input.recursive !== "boolean" || typeof input.force !== "boolean") {
            throw new TypeError("delete_protected expects an absolute path and the recursive and force flags");
        }

        const fs = kernel.get_fs();
        const path = fs.absolute(input.path, "/");

        if (await fs.dir_exists(path)) {
            await fs.delete_dir(path, input.recursive);
            return;
        }

        // the read-only flag can only be checked here, as userspace sees every protected path as read-only
        if (!input.force && await fs.is_readonly(path)) {
            throw new Error(`Path is read-only: ${path}`);
        }

        await fs.delete_file(path);
    },
} satisfies KernelFuncs;

export default {
    name: "rm",
    description: "Deletes a file or directory.",
    usage_suffix: "[-rf | -f] path",
    arg_descriptions: {
        "Arguments:": {
            "path": "The path to the file or directory to delete."
        },
        "Flags:": {
            "-rf": "Recursively and forcibly delete directories (ignoring if directory has content, treated as -f if a file is passed).",
            "-f": "Forcibly delete files (ignoring readonly state, NOT treated as -rf if a directory is passed)."
        }
    },
    compat: "3.0.0",
    main: async (data) => {
        // extract from data to make code less verbose
        const { kernel, args, term } = data;

        // extract from ANSI to make code less verbose
        const { PREFABS, STYLE } = ANSI;

        // get fs
        const fs = kernel.get_fs();

        // determine if -rf OR -f was passed
        let rimraf = false;
        let force = false;

        if (args[0] === "-rf") {
            rimraf = true;
            force = true;
            args.shift();
        } else if (args[0] === "-f") {
            force = true;
            args.shift();
        }

        // check if there is only one argument after parsing flag
        if (args.length !== 1) {
            term.writeln(`${PREFABS.error}Invalid arguments.${STYLE.reset_all}`);
            return 1;
        }

        // get path
        const path = args[0];
        const abs_path = fs.absolute(path);

        // check if path exists
        if (!(await fs.exists(abs_path))) {
            term.writeln(`${PREFABS.error}Path does not exist.${STYLE.reset_all}`);
            return 1;
        }

        // check if path is a directory
        const is_dir = await fs.dir_exists(abs_path);

        try {
            // protected paths are deleted through the kernel, asking the user first
            if (await fs.is_protected(abs_path)) {
                await kernel.request_kernel_func("delete_protected", `Delete the protected path ${abs_path}`, {path: abs_path, recursive: rimraf, force});
                return 0;
            }

            if (is_dir) {
                await fs.delete_dir(abs_path, rimraf);
                return 0;
            }
        } catch (e) {
            if (is_denied(e)) {
                term.writeln(`${PREFABS.error}Permission denied.${STYLE.reset_all}`);
                return 1;
            }

            if (is_error_like(e, "NonRecursiveDirectoryError", "Refusing to delete non-empty directory")) {
                term.writeln(`${PREFABS.error}Directory is not empty. Refusing to delete without -rf flag.${STYLE.reset_all}`);
                return 1;
            }

            if (is_error_like(e, "ReadOnlyError", "Path is read-only")) {
                term.writeln(`${PREFABS.error}File is readonly. Refusing to delete without -f flag.${STYLE.reset_all}`);
                return 1;
            }

            if (is_error_like(e, "PathNotFoundError", "Path not found")) {
                term.writeln(`${PREFABS.error}Path no longer exists.${STYLE.reset_all}`);
                return 1;
            }

            throw e;
        }

        // a file: if not forcing, check if it's readonly
        if (!force && await fs.is_readonly(abs_path)) {
            term.writeln(`${PREFABS.error}File is readonly. Refusing to delete without -f flag.${STYLE.reset_all}`);
            return 1;
        }

        await fs.delete_file(abs_path);
        return 0;
    }
} satisfies Program<{kernel_funcs: typeof kernel_funcs}>;