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