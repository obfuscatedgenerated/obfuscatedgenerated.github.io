import {ANSI} from "../../lib/ansi";
import type {KernelFuncData} from "../../types";
import type {UserspaceKernel} from "../../kernel";
import type {UserspaceFileSystem} from "../../kernel/filesystem";
import type {UserspaceTerminal} from "../../kernel/term_ctl";
import type {Remote} from "../../kernel/rpc";
import {BIN_DIR, graph_query, is_valid_pkg_file_path, is_valid_pkg_name, LIB_DIR, PROGRAMS_MANIFEST} from "./index";

// extract from ANSI to make code less verbose
const {STYLE, PREFABS, FG} = ANSI;

interface ProgramFiles {
    js: Uint8Array;
    json: Uint8Array;
}

// a package's files for LIB_DIR/<package>/, by path inside it
type PackageFiles = Record<string, Uint8Array>;

interface InstallChanges {
    install: Record<string, ProgramFiles>;
    remove: string[];
    install_packages: Record<string, PackageFiles>;
    remove_packages: string[];
}

/**
 * Everything a pkg command changes on disk, collected so it is applied at the end. Changing BIN_DIR and LIB_DIR needs a kernel func, and collecting the changes means the user is asked once per command, not once per package.
 * The graph is updated as the command runs (later installs and removals depend on it), and restored from the snapshot if the batch can't be applied.
 */
export interface PkgBatch {
    graph_snapshot: string;
    // programs in BIN_DIR, by name
    install: Map<string, ProgramFiles>;
    remove: Set<string>;
    // package dirs in LIB_DIR, by package name. removals are applied before installs, so a package can be reinstalled in one batch
    install_packages: Map<string, PackageFiles>;
    remove_packages: Set<string>;
    // triggers and messages, run in order once BIN_DIR and LIB_DIR have been changed
    steps: (() => Promise<void>)[];
}

export const create_pkg_batch = (): PkgBatch => ({
    graph_snapshot: graph_query.snapshot(),
    install: new Map(),
    remove: new Set(),
    install_packages: new Map(),
    remove_packages: new Set(),
    steps: [],
});

/**
 * Whether a program name is taken in BIN_DIR, counting the changes already in the batch.
 */
export const bin_name_taken = async (fs: UserspaceFileSystem, batch: PkgBatch, program_name: string): Promise<boolean> => {
    if (batch.install.has(program_name)) {
        return true;
    }

    if (batch.remove.has(program_name)) {
        return false;
    }

    return await fs.exists(`${BIN_DIR}/${program_name}.json`) || await fs.exists(`${BIN_DIR}/${program_name}.js`);
};

/**
 * Applies the batch: one kernel func request to change BIN_DIR and LIB_DIR, then the remaining steps in order. If they can't be changed, nothing else runs and the graph is restored.
 * The batch is left empty, so applying it again does nothing.
 * @returns Whether the batch was applied.
 */
export const apply_pkg_batch = async (batch: PkgBatch, kernel: Remote<UserspaceKernel>, term: Remote<UserspaceTerminal>): Promise<boolean> => {
    const fs = kernel.get_fs();

    const changes: InstallChanges = {
        install: Object.fromEntries(batch.install),
        remove: [...batch.remove],
        install_packages: Object.fromEntries(batch.install_packages),
        remove_packages: [...batch.remove_packages],
    };
    const steps = batch.steps;

    batch.install = new Map();
    batch.remove = new Set();
    batch.install_packages = new Map();
    batch.remove_packages = new Set();
    batch.steps = [];

    const install_names = Object.keys(changes.install);
    const install_package_names = Object.keys(changes.install_packages);
    if (install_names.length > 0 || changes.remove.length > 0 || install_package_names.length > 0 || changes.remove_packages.length > 0) {
        const summary: string[] = [];
        if (changes.remove_packages.length > 0) {
            summary.push(`remove ${changes.remove_packages.join(", ")}`);
        }

        if (install_package_names.length > 0) {
            summary.push(`install ${install_package_names.join(", ")}`);
        }

        const program_summary: string[] = [];
        if (changes.remove.length > 0) {
            program_summary.push(`removing ${changes.remove.join(", ")}`);
        }

        if (install_names.length > 0) {
            program_summary.push(`adding ${install_names.join(", ")}`);
        }

        const programs_note = program_summary.length > 0 ? ` (programs: ${program_summary.join("; ")})` : "";

        term.writeln(`${FG.yellow}Updating installed packages...${STYLE.reset_all}`);

        try {
            await kernel.request_kernel_func("apply_changes", `Change installed packages: ${summary.join(", then ")}${programs_note}`, changes);
        } catch (e) {
            if (e.name === "NotAllowedError") {
                term.writeln(`${PREFABS.error}Permission to change installed packages was denied. No packages were changed.${STYLE.reset_all}`);
            } else {
                term.writeln(`${PREFABS.error}Failed to change installed packages: ${e.message}. No packages were changed.${STYLE.reset_all}`);
            }

            await graph_query.restore(fs, batch.graph_snapshot);
            return false;
        }
    }

    for (const step of steps) {
        await step();
    }

    batch.graph_snapshot = graph_query.snapshot();
    return true;
};

const is_valid_program_name = (name: unknown): name is string =>
    typeof name === "string" &&
    name !== "" &&
    name !== "." &&
    name !== ".." &&
    !name.includes("/") &&
    !name.includes("\\") &&
    // these names would collide with the files pkg writes into the package dir
    !["pkg", "meta", PROGRAMS_MANIFEST.replace(/\.json$/, "")].includes(name);

export const kernel_funcs = {
    // the only part of pkg that runs in kernel space. userspace can't write BIN_DIR, as programs there can be started with privilege by name, or LIB_DIR, as those programs trust what their package ships
    apply_changes: async ({kernel}: KernelFuncData, input: InstallChanges) => {
        // pkg's userspace side handles downloaded data, so its input is checked again in full before anything changes
        const is_record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;
        if (!is_record(input) || !is_record(input.install) || !Array.isArray(input.remove) || !is_record(input.install_packages) || !Array.isArray(input.remove_packages)) {
            throw new TypeError("apply_changes expects programs and packages to install and names of each to remove");
        }

        const remove = input.remove;
        const install = Object.entries(input.install);
        const remove_packages = input.remove_packages;
        const install_packages = Object.entries(input.install_packages);

        for (const pkg of remove_packages) {
            if (typeof pkg !== "string" || !is_valid_pkg_name(pkg)) {
                throw new Error(`Illegal package name '${String(pkg)}'`);
            }
        }

        for (const [pkg, files] of install_packages) {
            if (!is_valid_pkg_name(pkg)) {
                throw new Error(`Illegal package name '${pkg}'`);
            }

            if (!is_record(files)) {
                throw new TypeError(`Package '${pkg}' must have its files`);
            }

            for (const [file, contents] of Object.entries(files)) {
                if (!is_valid_pkg_file_path(file)) {
                    throw new Error(`Illegal file path '${file}' in package '${pkg}'`);
                }

                if (!(contents instanceof Uint8Array)) {
                    throw new TypeError(`File '${file}' in package '${pkg}' must have contents`);
                }
            }
        }

        for (const name of remove) {
            if (!is_valid_program_name(name)) {
                throw new Error(`Illegal program name '${String(name)}'`);
            }
        }

        const fs = kernel.get_fs();
        const decoder = new TextDecoder();

        for (const [name, files] of install) {
            if (!is_valid_program_name(name)) {
                throw new Error(`Illegal program name '${name}'`);
            }

            if (!(files?.js instanceof Uint8Array) || !(files.json instanceof Uint8Array)) {
                throw new TypeError(`Program '${name}' must have .js and .json contents`);
            }

            let metadata: unknown;
            try {
                metadata = JSON.parse(decoder.decode(files.json));
            } catch {
                throw new Error(`Program metadata for '${name}' is not valid JSON`);
            }

            if ((metadata as {name?: unknown} | null)?.name !== name) {
                throw new Error(`Program metadata for '${name}' has a different name`);
            }

            if (await fs.exists(`/bin/${name}.json`)) {
                throw new Error(`Program '${name}' conflicts with a builtin program`);
            }

            const taken = await fs.exists(`${BIN_DIR}/${name}.json`) || await fs.exists(`${BIN_DIR}/${name}.js`);
            if (taken && !remove.includes(name)) {
                throw new Error(`Program '${name}' is already provided by another package`);
            }
        }

        if (!(await fs.dir_exists(BIN_DIR))) {
            await fs.make_dir(BIN_DIR);
        }

        for (const name of remove) {
            for (const file of [`${name}.js`, `${name}.json`]) {
                if (await fs.exists(`${BIN_DIR}/${file}`)) {
                    await fs.delete_file(`${BIN_DIR}/${file}`);
                }
            }
        }

        for (const pkg of remove_packages) {
            if (await fs.dir_exists(`${LIB_DIR}/${pkg}`)) {
                await fs.delete_dir(`${LIB_DIR}/${pkg}`, true);
            }
        }

        for (const [pkg, files] of install_packages) {
            const pkg_dir = `${LIB_DIR}/${pkg}`;
            await fs.make_dir(pkg_dir);

            for (const [file, contents] of Object.entries(files)) {
                await fs.write_file(`${pkg_dir}/${file}`, contents, true);
            }
        }

        for (const [name, files] of install) {
            await fs.write_file(`${BIN_DIR}/${name}.js`, files.js, true);
            await fs.write_file(`${BIN_DIR}/${name}.json`, files.json, true);
        }
    },
};
