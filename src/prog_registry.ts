import type { Program, ProgramRegistrant } from "./types";
import type { AbstractFileSystem } from "./filesystem";
import { ANSI, WrappedTerminal } from "./term_ctl";

export class ProgramRegistry {
    _program_regs: Map<string, ProgramRegistrant> = new Map();

    
    registerProgram(program_reg: ProgramRegistrant) {
        const program = program_reg.program;

        if (this._program_regs.has(program.name)) {
            throw new Error(`Program with name ${program.name} already exists.`);
        }

        if (globalThis.OLLIEOS_NODE && program.node_opt_out) {
            // don't register this program if it is not compatible with node.js
            return;
        }

        this._program_regs.set(program.name, program_reg);
    }


    getProgramRegistrant(name: string): ProgramRegistrant | undefined {
        return this._program_regs.get(name);
    }

    getProgram(name: string): Program | undefined {
        const program_reg = this.getProgramRegistrant(name);
        if (program_reg === undefined) {
            return undefined;
        }

        return program_reg.program;
    }


    listProgramRegistrants(includes_builtin = true, includes_mounted = false): ProgramRegistrant[] {
        const arr = Array.from(this._program_regs.values());

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
        const arr = Array.from(this._program_regs.keys());

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


    forceUnregister(name: string) {
        this._program_regs.delete(name);
    }

    unregister(name: string) {
        if (!this._program_regs.has(name)) {
            throw new Error(`Program with name ${name} does not exist.`);
        }

        this.forceUnregister(name);
    }
}

const encode_js_to_url = (js_code: string): string => {
    const encoded = encodeURIComponent(js_code);
    return `data:text/javascript;charset=utf-8,${encoded}`;
}

export const build_registrant_from_js = async (js_code: string, built_in = false): Promise<ProgramRegistrant> => {
    // inspect the js code to see if it starts with "import". if so, this is outdated, put a deprecation warning
    let warn_deprecation = false;
    if (js_code.startsWith("import")) {
        // delay the warning as we might find out the program name later
        warn_deprecation = true;
    }

    // note: the webpackIgnore bypasses webpack's import() function and uses the browser's native import() function
    // this is because webpack's import() function does not support data urls

    const data_url = encode_js_to_url(js_code);
    // note: risk to user, show warning
    const imp = await import(/* webpackIgnore: true */data_url);
    let program = imp.default;

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

    program = program as object;

    if (typeof program.name !== "string") {
        if (warn_deprecation) {
            console.warn("Program has JS code starts with 'import'. Please update the package to use the new global externals system. This will be removed in the future.");
        }

        throw new Error("Program does not have a name.");
    }

    if (warn_deprecation) {
        console.warn(`Program ${program.name} has JS code starts with 'import'. Please update the package to use the new global externals system. This will be removed in the future.`);
    }

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
export const mount_and_register_with_output = async (filename: string, content: string, prog_reg: ProgramRegistry, term: WrappedTerminal, output_success = false) => {
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
        prog_reg.registerProgram(reg);

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
export const recurse_mount_and_register_with_output = async (fs: AbstractFileSystem, dir_path: string, prog_registry: ProgramRegistry, term: WrappedTerminal) => {
    const entries = fs.list_dir(dir_path);

    for (const entry of entries) {
        const entry_path = fs.join(dir_path, entry);

        if (fs.dir_exists(entry_path)) {
            await recurse_mount_and_register_with_output(fs, entry_path, prog_registry, term);
        } else {
            if (!entry.endsWith(".js")) {
                continue;
            }

            const content = fs.read_file(entry_path) as string;
            await mount_and_register_with_output(entry, content, prog_registry, term);
        }
    }
}

// TODO: these 2 methods are a bit messy! perhaps remove the output stuff and just have the user deal with it
