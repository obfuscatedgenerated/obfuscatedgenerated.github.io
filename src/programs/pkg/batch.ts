import {ANSI} from "../../lib/ansi";
import type {KernelFuncData} from "../../types";
import type {UserspaceKernel} from "../../kernel";
import type {UserspaceFileSystem} from "../../kernel/filesystem";
import type {UserspaceTerminal} from "../../kernel/term_ctl";
import type {Remote} from "../../kernel/rpc";
import {BIN_DIR, graph_query, PROGRAMS_MANIFEST} from "./index";

// extract from ANSI to make code less verbose
const {STYLE, PREFABS, FG} = ANSI;

interface ProgramFiles {
    js: Uint8Array;
    json: Uint8Array;
}

interface BinChanges {
    install: Record<string, ProgramFiles>;
    remove: string[];
}

/**
 * Everything a pkg command changes on disk, collected so it is applied at the end. Changing BIN_DIR needs a kernel func, and collecting the changes means the user is asked once per command, not once per package.
 * The graph is updated as the command runs (later installs and removals depend on it), and restored from the snapshot if the batch can't be applied.
 */
export interface PkgBatch {
    graph_snapshot: string;
    install: Map<string, ProgramFiles>;
    remove: Set<string>;
    // package files and triggers, run in order once BIN_DIR has been changed
    steps: (() => Promise<void>)[];
}

export const create_pkg_batch = (): PkgBatch => ({
    graph_snapshot: graph_query.snapshot(),
    install: new Map(),
    remove: new Set(),
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
 * Applies the batch: one kernel func request to change BIN_DIR, then the remaining steps in order. If BIN_DIR can't be changed, nothing else runs and the graph is restored.
 * The batch is left empty, so applying it again does nothing.
 * @returns Whether the batch was applied.
 */
export const apply_pkg_batch = async (batch: PkgBatch, kernel: Remote<UserspaceKernel>, term: Remote<UserspaceTerminal>): Promise<boolean> => {
    const fs = kernel.get_fs();

    const changes: BinChanges = {install: Object.fromEntries(batch.install), remove: [...batch.remove]};
    const steps = batch.steps;

    batch.install = new Map();
    batch.remove = new Set();
    batch.steps = [];

    const install_names = Object.keys(changes.install);
    if (install_names.length > 0 || changes.remove.length > 0) {
        const summary: string[] = [];
        if (changes.remove.length > 0) {
            summary.push(`remove ${changes.remove.join(", ")}`);
        }

        if (install_names.length > 0) {
            summary.push(`install ${install_names.join(", ")}`);
        }

        term.writeln(`${FG.yellow}Updating installed programs...${STYLE.reset_all}`);

        try {
            await kernel.request_kernel_func("apply_bin_changes", `Change installed programs: ${summary.join(", then ")}`, changes);
        } catch (e) {
            if (e.name === "NotAllowedError") {
                term.writeln(`${PREFABS.error}Permission to change installed programs was denied. No packages were changed.${STYLE.reset_all}`);
            } else {
                term.writeln(`${PREFABS.error}Failed to change installed programs: ${e.message}. No packages were changed.${STYLE.reset_all}`);
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
    // the only part of pkg that runs in kernel space. userspace can't write BIN_DIR, as programs there can be started with privilege by name
    apply_bin_changes: async ({kernel}: KernelFuncData, input: BinChanges) => {
        // pkg's userspace side handles downloaded data, so its input is checked again in full before anything changes
        if (typeof input !== "object" || input === null || typeof input.install !== "object" || input.install === null || !Array.isArray(input.remove)) {
            throw new TypeError("apply_bin_changes expects programs to install and program names to remove");
        }

        const remove = input.remove;
        const install = Object.entries(input.install);

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

        for (const [name, files] of install) {
            await fs.write_file(`${BIN_DIR}/${name}.js`, files.js, true);
            await fs.write_file(`${BIN_DIR}/${name}.json`, files.json, true);
        }
    },
};
