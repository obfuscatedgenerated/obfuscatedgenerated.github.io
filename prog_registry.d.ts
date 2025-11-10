import type { Program, ProgramRegistrant } from "./types";
import type { AbstractFileSystem } from "./filesystem";
import { WrappedTerminal } from "./term_ctl";
export declare class ProgramRegistry {
    _program_regs: Map<string, ProgramRegistrant>;
    registerProgram(program_reg: ProgramRegistrant): void;
    getProgramRegistrant(name: string): ProgramRegistrant | undefined;
    getProgram(name: string): Program | undefined;
    listProgramRegistrants(includes_builtin?: boolean, includes_mounted?: boolean): ProgramRegistrant[];
    listProgramNames(includes_builtin?: boolean, includes_mounted?: boolean): string[];
    listPrograms(includes_builtin?: boolean, includes_mounted?: boolean): Program[];
    forceUnregister(name: string): void;
    unregister(name: string): void;
}
export declare const build_registrant_from_js: (js_code: string, built_in?: boolean) => Promise<ProgramRegistrant>;
export declare const determine_program_name_from_js: (js_code: string) => Promise<string>;
export declare const mount_and_register_with_output: (filename: string, content: string, prog_reg: ProgramRegistry, term: WrappedTerminal, output_success?: boolean) => Promise<void>;
export declare const recurse_mount_and_register_with_output: (fs: AbstractFileSystem, dir_path: string, prog_registry: ProgramRegistry, term: WrappedTerminal) => Promise<void>;
