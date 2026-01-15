// note: program registry is due to be replaced with a much simpler, memory efficient, more flexible, and more secure approach
// of traditional on demand program loading from the file system

import type {Program} from "../types";
import type {AbstractFileSystem} from "./filesystem";
import {ANSI, WrappedTerminal} from "./term_ctl";
import {import_sandboxed_module} from "./sandbox";

export interface ProgramRegistrant {
    program: Program<unknown>,
    built_in: boolean,
}

export const build_registrant_from_js = async (js_code: string, built_in = false): Promise<ProgramRegistrant> => {
    // inspect the js code to see if it starts with "import". if so, this is outdated, put a deprecation warning
    let warn_deprecation = false;
    if (js_code.startsWith("import")) {
        // delay the warning as we might find out the program name later
        warn_deprecation = true;
    }

    // detect esm style module
    // TODO: this is flimsy. maybe use program or package compat flag instead?
    if (!js_code.startsWith("//skip_esm_check") && (js_code.includes("export{") || js_code.includes("export default"))) {
        if (warn_deprecation) {
            console.warn("Program has JS code starts with 'import'. Please update the package to use the new global externals system. This will be removed in the future.");
        }

        throw new Error("Program appears to be an ES module (contained either export{ or export default). Please update pkgbuild and rebuild the package. If this detection is an error, add the comment //skip_esm_check to the very start of the JS code.");
    }

    const imp = await import_sandboxed_module(js_code);
    let program = imp.default as any;

    if (program === undefined) {
        if (warn_deprecation) {
            console.warn("Program has JS code starts with 'import'. Please update the package to use the new global externals system. This will be removed in the future.");
        }

        throw new Error("Program is not the default export.");
    }

    // validate program
    if (typeof program !== "object") {
        if (warn_deprecation) {
            console.warn("Program has JS code starts with 'import'. Please update the package to use the new global externals system. This will be removed in the future.");
        }

        throw new Error("Program is not an object.");
    }

    if (typeof program.name !== "string") {
        if (warn_deprecation) {
            console.warn("Program has JS code starts with 'import'. Please update the package to use the new global externals system. This will be removed in the future.");
        }

        throw new Error("Program does not have a name.");
    }

    if (warn_deprecation) {
        console.warn(`Program ${program.name} has JS code starts with 'import'. Please update the package to use the new global externals system. This will be removed in the future.`);
    }

    // not warning about compat here to make it more obvious to end users when they try to run an incompatible program

    if (globalThis.OLLIEOS_NODE && program.node_opt_out) {
        throw new Error(`Program ${program.name} is not compatible with Node.js.`);
    }

    if (typeof program.description !== "string") {
        throw new Error(`Program ${program.name} does not have a description.`);
    }

    if (typeof program.usage_suffix !== "string") {
        throw new Error(`Program ${program.name} does not have a usage suffix.`);
    }

    if (typeof program.arg_descriptions !== "object") {
        throw new Error(`Program ${program.name} does not have argument descriptions.`);
    }

    // migration: we got rid of syncprogram (with main) and asyncprogram (async_main)
    // now there is a single async type called program
    // problem: older packages have a field called async_main, and some have main that doesn't return a promise
    if (!program.main) {
        if (!program.async_main) {
            throw new Error(`Program ${program.name} does not have a main function.`);
        }

        console.warn(`Program ${program.name} has an async_main function. This is deprecated and will be removed in the future. Please use main instead.`);

        // migrate: rename async_main to main
        program.main = program.async_main;
        delete program.async_main;
    }

    if (program.main !== undefined && program.async_main !== undefined) {
        throw new Error(`Program ${program.name} has both a main and async_main (deprecated) function.`);
    }

    // check if main is async
    if (program.main !== undefined && program.main.constructor.name !== "AsyncFunction") {
        console.warn(`Program ${program.name} has a main function that is not async. This is deprecated and will be removed in the future. Please make main async.`);

        // migrate: wrap main in an async function
        const old_main = program.main;
        program.main = async (data) => {
            return old_main(data);
        }
    }

    program = program as Program;

    // can't check what it takes and returns because javascript!
    // just register it and the user can deal with the error if it doesn't work

    return {
        program,
        built_in,
    };
}

export const determine_program_name_from_js = async (js_code: string): Promise<string> => {
    const reg = await build_registrant_from_js(js_code);
    return reg.program.name;
}


// mounts and registers a program and outputs errors to the terminal
export const mount_and_register_with_output = async (filename: string, content: string, prog_reg: ProgramRegistry | UserspaceProgramRegistry, term: WrappedTerminal, output_success = false) => {
    const { PREFABS, FG, STYLE } = ANSI;

    let reg: ProgramRegistrant;

    try {
        reg = await build_registrant_from_js(content);
    } catch (e) {
        if (e.message.endsWith("is not compatible with Node.js.")) {
            // silently skip node.js incompatible programs
            // yes this is a weird way to do it, but better than changing how build_registrant works
            return;
        }

        term.writeln(`${PREFABS.error}Failed to prepare program from '${filename}'.${STYLE.reset_all}`);
        term.writeln(`${PREFABS.error}${e}${STYLE.reset_all}`);
        term.writeln(`${PREFABS.error}Skipping mount...${STYLE.reset_all}`);
        return;
    }

    try {
        await prog_reg.registerProgram(reg);

        if (output_success) {
            term.writeln(`${FG.cyan}(+) ${reg.program.name}${STYLE.reset_all}`);
        }
    } catch (e) {
        term.writeln(`${PREFABS.error}Failed to mount program '${reg.program.name}'.${STYLE.reset_all}`);
        term.writeln(`${PREFABS.error}${e}${STYLE.reset_all}`);
        term.writeln(`${PREFABS.error}Skipping mount...${STYLE.reset_all}`);
    }
}

// recurses through a directory and mounts and registers all programs in it as well as its subdirectories
export const recurse_mount_and_register_with_output = async (fs: AbstractFileSystem, dir_path: string, prog_registry: ProgramRegistry | UserspaceProgramRegistry, term: WrappedTerminal) => {
    const entries = await fs.list_dir(dir_path);

    for (const entry of entries) {
        const entry_path = fs.join(dir_path, entry);

        if (await fs.dir_exists(entry_path)) {
            await recurse_mount_and_register_with_output(fs, entry_path, prog_registry, term);
        } else {
            if (!entry.endsWith(".js")) {
                continue;
            }

            const content = await fs.read_file(entry_path) as string;
            await mount_and_register_with_output(entry, content, prog_registry, term);
        }
    }
}

// TODO: these 2 methods are a bit messy! perhaps remove the output stuff and just have the user deal with it

export interface UserspaceProgramRegistry {
    getProgram(name: string): Program | undefined;
    listProgramNames(includes_builtin?: boolean, includes_mounted?: boolean): string[];
    registerProgram(program_reg: ProgramRegistrant): Promise<void>;
    unregister(name: string): Promise<void>;
    forceUnregister(name: string): Promise<void>;
    build_registrant_from_js(js_code: string, built_in?: boolean): Promise<ProgramRegistrant>;
    determine_program_name_from_js(js_code: string): Promise<string>;
    mount_and_register_with_output(filename: string, content: string, term: WrappedTerminal, output_success?: boolean): Promise<void>;
    recurse_mount_and_register_with_output(fs: AbstractFileSystem, dir_path: string, term: WrappedTerminal): Promise<void>;
}

export class ProgramRegistry {
    readonly #program_regs: Map<string, ProgramRegistrant> = new Map();

    async registerProgram(program_reg: ProgramRegistrant) {
        const program = program_reg.program;

        if (this.#program_regs.has(program.name)) {
            throw new Error(`Program with name ${program.name} already exists.`);
        }

        if (globalThis.OLLIEOS_NODE && program.node_opt_out) {
            // don't register this program if it is not compatible with node.js
            return;
        }

        this.#program_regs.set(program.name, program_reg);
    }


    getProgramRegistrant(name: string): ProgramRegistrant | undefined {
        return this.#program_regs.get(name);
    }

    getProgram(name: string): Program | undefined {
        const program_reg = this.getProgramRegistrant(name);
        if (program_reg === undefined) {
            return undefined;
        }

        return program_reg.program;
    }


    listProgramRegistrants(includes_builtin = true, includes_mounted = false): ProgramRegistrant[] {
        const arr = Array.from(this.#program_regs.values());

        if (includes_builtin && includes_mounted) {
            return arr;
        }

        if (includes_builtin && !includes_mounted) {
            return arr.filter((program_reg) => program_reg.built_in);
        }

        if (!includes_builtin && includes_mounted) {
            return arr.filter((program_reg) => !program_reg.built_in);
        }
    }

    listProgramNames(includes_builtin = true, includes_mounted = false): string[] {
        const arr = Array.from(this.#program_regs.keys());

        if (includes_builtin && includes_mounted) {
            return arr;
        }

        if (includes_builtin && !includes_mounted) {
            return arr.filter((program_name) => this.getProgramRegistrant(program_name)?.built_in);
        }

        if (!includes_builtin && includes_mounted) {
            return arr.filter((program_name) => !this.getProgramRegistrant(program_name)?.built_in);
        }
    }

    listPrograms(includes_builtin = true, includes_mounted = false): Program[] {
        return this.listProgramRegistrants(includes_builtin, includes_mounted).map((program_reg) => program_reg.program);
    }


    async forceUnregister(name: string) {
        this.#program_regs.delete(name);
    }

    async unregister(name: string) {
        if (!this.#program_regs.has(name)) {
            throw new Error(`Program with name ${name} does not exist.`);
        }

        await this.forceUnregister(name);
    }

    // note that some methods above are async because the userspace proxy needs them to be async

    // TODO: move usage of above methods to use class methods instead of the standalone functions

    async build_registrant_from_js(js_code: string, built_in = false): Promise<ProgramRegistrant> {
        return build_registrant_from_js(js_code, built_in);
    }

    async determine_program_name_from_js(js_code: string): Promise<string> {
        return determine_program_name_from_js(js_code);
    }

    async mount_and_register_with_output(filename: string, content: string, term: WrappedTerminal, output_success = false) {
        return mount_and_register_with_output(filename, content, this, term, output_success);
    }

    async recurse_mount_and_register_with_output(fs: AbstractFileSystem, dir_path: string, term: WrappedTerminal) {
        return recurse_mount_and_register_with_output(fs, dir_path, this, term);
    }

    create_userspace_proxy(init_program: string, fs: AbstractFileSystem): UserspaceProgramRegistry {
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const self = this;
        const proxy = Object.create(null);

        const check_protected = async (name: string) => {
            const reg = self.getProgramRegistrant(name);

            // userspace cannot unregister built-in programs
            if (reg?.built_in) {
                throw new Error(`Security Error: Built-in program '${name}' is protected and cannot be modified.`);
            }

            // userspace cannot unregister the loaded init system
            // TODO: is this actually necessary security wise? it wont get run as kernel til next boot anyway. maybe the boot file should be protected instead?
            if (name === init_program) {
                throw new Error(`Security Error: The init system program '${name}' cannot be modified.`);
            }

            // userspace cannot unregister program referenced by /sys/privilege_agent
            let privilege_agent_program = "default_privilege_agent";
            try {
                const pa_data = await fs.read_file("/sys/privilege_agent") as string;
                privilege_agent_program = pa_data.trim();
            } catch {
                // ignore error
            }

            if (!privilege_agent_program) {
                privilege_agent_program = "default_privilege_agent";
            }

            if (name === privilege_agent_program) {
                throw new Error(`Security Error: The privilege agent program '${name}' cannot be modified.`);
            }
        }

        Object.defineProperties(proxy, {
            getProgram: {
                value: (name: string) => self.getProgram(name),
                enumerable: true
            },
            listProgramNames: {
                value: (inc_builtin?: boolean, inc_mounted?: boolean) =>
                    self.listProgramNames(inc_builtin, inc_mounted),
                enumerable: true
            },
            registerProgram: {
                value: async (program_reg: ProgramRegistrant) => {
                    if (program_reg.built_in) {
                        throw new Error("Security Error: Cannot register built-in programs from userspace.");
                    }

                    await check_protected(program_reg.program.name);
                    await self.registerProgram(program_reg);
                },
                enumerable: true
            },
            unregister: {
                value: async (name: string) => {
                    await check_protected(name);
                    await self.unregister(name);
                },
                enumerable: true
            },
            forceUnregister: {
                value: async (name: string) => {
                    await check_protected(name);
                    await self.forceUnregister(name);
                },
                enumerable: true
            },

            // its fine to build the registrant as builtin, but not fine to register it
            build_registrant_from_js: {
                value: async (js_code: string, built_in = false) =>
                    self.build_registrant_from_js(js_code, built_in),
                enumerable: true
            },
            determine_program_name_from_js: {
                value: async (js_code: string) =>
                    self.determine_program_name_from_js(js_code),
                enumerable: true
            },

            // ensure the proxy is used for these methods to enforce protections
            mount_and_register_with_output: {
                value: async (filename: string, content: string, term: WrappedTerminal, output_success = false) =>
                    mount_and_register_with_output(filename, content, proxy, term, output_success),
                enumerable: true
            },
            recurse_mount_and_register_with_output: {
                value: async (dir_path: string, term: WrappedTerminal) =>
                    recurse_mount_and_register_with_output(fs, dir_path, proxy, term),
                enumerable: true
            },
        });

        return Object.freeze(proxy);
    }
}

// TODO: restructure methods to not need fs (i.e. move this closer to the kernel where fs is accessible)

