import type { Program, ProgramRegistrant } from "../types";
import type { AbstractFileSystem } from "./filesystem";
import { WrappedTerminal } from "./term_ctl";
export declare const build_registrant_from_js: (js_code: string, built_in?: boolean) => Promise<ProgramRegistrant>;
export declare const determine_program_name_from_js: (js_code: string) => Promise<string>;
export declare const mount_and_register_with_output: (filename: string, content: string, prog_reg: ProgramRegistry | UserspaceProgramRegistry, term: WrappedTerminal, output_success?: boolean) => Promise<void>;
export declare const recurse_mount_and_register_with_output: (fs: AbstractFileSystem, dir_path: string, prog_registry: ProgramRegistry | UserspaceProgramRegistry, term: WrappedTerminal) => Promise<void>;
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
export declare class ProgramRegistry {
    #private;
    registerProgram(program_reg: ProgramRegistrant): Promise<void>;
    getProgramRegistrant(name: string): ProgramRegistrant | undefined;
    getProgram(name: string): Program | undefined;
    listProgramRegistrants(includes_builtin?: boolean, includes_mounted?: boolean): ProgramRegistrant[];
    listProgramNames(includes_builtin?: boolean, includes_mounted?: boolean): string[];
    listPrograms(includes_builtin?: boolean, includes_mounted?: boolean): Program[];
    forceUnregister(name: string): Promise<void>;
    unregister(name: string): Promise<void>;
    build_registrant_from_js(js_code: string, built_in?: boolean): Promise<ProgramRegistrant>;
    determine_program_name_from_js(js_code: string): Promise<string>;
    mount_and_register_with_output(filename: string, content: string, term: WrappedTerminal, output_success?: boolean): Promise<void>;
    recurse_mount_and_register_with_output(fs: AbstractFileSystem, dir_path: string, term: WrappedTerminal): Promise<void>;
    create_userspace_proxy(init_program: string, fs: AbstractFileSystem): UserspaceProgramRegistry;
}
