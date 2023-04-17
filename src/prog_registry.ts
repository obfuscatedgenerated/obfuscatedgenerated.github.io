import type { Program } from "./types";

export class ProgramRegistry {
    programs: { [name: string]: Program } = {};

    registerProgram(program: Program) {
        this.programs[program.name] = program;
    }

    getProgram(name: string) {
        return this.programs[name];
    }
}