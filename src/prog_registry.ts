import type { Program, ProgramRegistrant } from "./types";

export class ProgramRegistry {
    _program_regs: Map<string, ProgramRegistrant> = new Map();

    registerProgram(program_reg: ProgramRegistrant) {
        const program = program_reg.program;

        if (this._program_regs.has(program.name)) {
            throw new Error(`Program with name ${program.name} already exists.`);
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
}

const encode_js_to_url = (js_code: string): string => {
    const encoded = encodeURIComponent(js_code);
    return `data:text/javascript;charset=utf-8,${encoded}`;
}

export const build_registrant_from_js = async (js_code: string, built_in = false): Promise<ProgramRegistrant> => {
    // note: the webpackIgnore bypasses webpack's import() function and uses the browser's native import() function
    // this is because webpack's import() function does not support data urls

    const data_url = encode_js_to_url(js_code);
    // note: risk to user, show warning
    const imp = await import(/* webpackIgnore: true */data_url);
    let program = imp.default;

    if (program === undefined) {
        throw new Error("Program is not the default export.");
    }

    // validate program
    if (typeof program !== "object") {
        throw new Error("Program is not an object.");
    }

    program = program as object;

    if (typeof program.name !== "string") {
        throw new Error("Program does not have a name.");
    }

    if (typeof program.description !== "string") {
        throw new Error("Program does not have a description.");
    }

    if (typeof program.usage_suffix !== "string") {
        throw new Error("Program does not have a usage suffix.");
    }

    if (typeof program.arg_descriptions !== "object") {
        throw new Error("Program does not have argument descriptions.");
    }

    if (!program.main && !program.async_main) {
        throw new Error("Program does not have a main function.");
    }

    if (program.main !== undefined && program.async_main !== undefined) {
        throw new Error("Program has both a synchronous and asynchronous main function.");
    }

    program = program as Program;
        
    // can't check what it takes and returns because javascript!
    // just register it and the user can deal with the error if it doesn't work

    return {
        program,
        built_in,
    };
}
