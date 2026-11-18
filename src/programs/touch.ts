import type {KernelFuncs, Program} from "../types";
import {ANSI} from "../lib/ansi";

// the userspace filesystem refuses kernel protected paths, so this uses the kernel's own, after the user has allowed it
export const kernel_funcs = {
    create_protected_file: async ({kernel}, input: {path: string}) => {
        // input comes from userspace, so nothing about it is assumed
        if (typeof input?.path !== "string" || !input.path.startsWith("/")) {
            throw new TypeError("create_protected_file expects an absolute path");
        }

        const fs = kernel.get_fs();
        const path = fs.absolute(input.path, "/");

        // only ever creates, never empties an existing file
        if (!(await fs.exists(path))) {
            await fs.write_file(path, "");
        }
    },
} satisfies KernelFuncs;

// yes, the actual touch command is used to modify access time and has more flags, but this os doesn't have access times and this is meant to be simple

export default {
    name: "touch",
    description: "Creates a file.",
    usage_suffix: "file",
    arg_descriptions: {
        "Arguments:": {
            "file": "The file to create."
        }
    },
    compat: "3.0.0",
    main: async (data) => {
        // extract from data to make code less verbose
        const {kernel, args, term} = data;

        // extract from ANSI to make code less verbose
        const {STYLE, PREFABS} = ANSI;

        // get filesystem
        const fs = kernel.get_fs();

        // if no arguments, print error
        if (args.length === 0) {
            term.writeln(`${PREFABS.error}Missing file operand.${STYLE.reset_all}`);
            return 1;
        }

        // if more than one argument, print error
        // TODO: i think this is the only program that checks this, the others drop the extra arguments. do something about this!
        if (args.length > 1) {
            term.writeln(`${PREFABS.error}Too many arguments${STYLE.reset_all}`);
            return 1;
        }

        // if the file already exists, do nothing
        const file = args[0];
        const absolute_file = fs.absolute(file);

        if (await fs.exists(absolute_file)) {
            return 0;
        }

        // check if the directory exists
        // TODO: should abstractfilesystem have basename and dirname functions? check other programs for similar code!
        const dir = absolute_file.split("/").slice(0, -1).join("/");
        if (!(await fs.dir_exists(dir))) {
            term.writeln(`${PREFABS.error}No such directory: ${dir}${STYLE.reset_all}`);
            return 1;
        }

        // protected paths are created through the kernel, asking the user first
        if (await fs.is_protected(absolute_file)) {
            try {
                await kernel.request_kernel_func("create_protected_file", `Create the protected file ${absolute_file}`, {path: absolute_file});
            } catch (e) {
                if (e instanceof Error && e.name === "NotAllowedError") {
                    term.writeln(`${PREFABS.error}Permission denied.${STYLE.reset_all}`);
                    return 1;
                }

                throw e;
            }

            return 0;
        }

        // create the file
        await fs.write_file(absolute_file, "");

        return 0;
    }
} satisfies Program<{kernel_funcs: typeof kernel_funcs}>;