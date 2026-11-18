import type { KernelFuncs, Program } from "../types";
import {ANSI} from "../lib/ansi";

// the userspace filesystem refuses kernel protected paths, so this uses the kernel's own, after the user has allowed it
export const kernel_funcs = {
    make_protected_dir: async ({kernel}, input: {path: string}) => {
        // input comes from userspace, so nothing about it is assumed
        if (typeof input?.path !== "string" || !input.path.startsWith("/")) {
            throw new TypeError("make_protected_dir expects an absolute path");
        }

        const fs = kernel.get_fs();
        await fs.make_dir(fs.absolute(input.path, "/"));
    },
} satisfies KernelFuncs;

export default {
    name: "mkdir",
    description: "Creates a directory.",
    usage_suffix: "[-p] directory",
    arg_descriptions: {
        "Flags:": {
            "-p": "Create parent directories (recursive) if they don't exist."
        },
        "Arguments:": {
            "directory": "The directory to create."
        }
    },
    compat: "3.0.0",
    completion: async () => [],
    main: async (data) => {
        // extract from data to make code less verbose
        const { kernel, args, term } = data;

        // extract from ANSI to make code less verbose
        const { PREFABS, STYLE } = ANSI;

        // get fs
        const fs = kernel.get_fs();


        // check if -p flag was passed
        let recursive = false;
        if (args[0] === "-p") {
            recursive = true;
            args.shift();
        }

        // check if there is only one argument after parsing flag
        if (args.length !== 1) {
            term.writeln(`${PREFABS.error}Invalid arguments.${STYLE.reset_all}`);
            return 1;
        }

        // get directory
        const dir = args[0];
        const abs_dir = fs.absolute(dir);

        // check if directory already exists
        if (await fs.dir_exists(abs_dir)) {
            return 0;
        }

        // make_dir is recursive by default, so just check the directories exist already if NOT recursive
        if (!recursive) {
            const parent = abs_dir.split("/").slice(0, -1).join("/");
            if (!(await fs.dir_exists(parent))) {
                term.writeln(`${PREFABS.error}No such directory: ${parent}${STYLE.reset_all}`);
                return 1;
            }
        }

        // protected paths are created through the kernel, asking the user first
        if (await fs.is_protected(abs_dir)) {
            try {
                await kernel.request_kernel_func("make_protected_dir", `Create the protected directory ${abs_dir}`, {path: abs_dir});
            } catch (e) {
                if (e instanceof Error && e.name === "NotAllowedError") {
                    term.writeln(`${PREFABS.error}Permission denied.${STYLE.reset_all}`);
                    return 1;
                }

                throw e;
            }

            return 0;
        }

        await fs.make_dir(abs_dir);
        return 0;
    }
} satisfies Program<{kernel_funcs: typeof kernel_funcs}>;
