import type { Program } from "./types";

export class ProgramRegistry {
    _programs: Map<string, Program> = new Map();

    registerProgram(program: Program) {
        if (this._programs.has(program.name)) {
            throw new Error(`Program with name ${program.name} already exists.`);
        }

        this._programs.set(program.name, program);
    }

    getProgram(name: string) {
        return this._programs.get(name);
    }

    listPrograms() {
        return Array.from(this._programs.keys());
    }
}