import type { Program } from "./types";

export class ProgramRegistry {
    programs: Map<string, Program> = new Map();

    registerProgram(program: Program) {
        if (this.programs.has(program.name)) {
            throw new Error(`Program with name ${program.name} already exists.`);
        }

        this.programs.set(program.name, program);
    }

    getProgram(name: string) {
        return this.programs.get(name);
    }
}