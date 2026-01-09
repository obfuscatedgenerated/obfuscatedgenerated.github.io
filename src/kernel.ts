import {ProgramRegistry} from "./prog_registry";
import type {AbstractFileSystem} from "./filesystem";

import {SoundRegistry} from "./sfx_registry";
import {AbstractWindowManager} from "./windowing";
import {IPCManager, ProcessContext, ProcessManager} from "./processes";
import type {AbstractShell} from "./abstract_shell";

// TODO: decouple, either make generic interface or dont use at all
import type {LineParseResultCommand} from "./programs/core/ash/parser";

import {NEWLINE, type WrappedTerminal} from "./term_ctl";

export interface SpawnResult {
    process: ProcessContext;
    completion: Promise<number>;
}

export class Kernel {
    _term: WrappedTerminal;
    _process_manager: ProcessManager;
    _prog_registry: ProgramRegistry;
    _sfx_registry: SoundRegistry;
    _fs: AbstractFileSystem;
    _wm: AbstractWindowManager | null = null;

    _panicked = false;

    get panicked(): boolean {
        return this._panicked;
    }

    get_program_registry(): ProgramRegistry {
        return this._prog_registry;
    }

    get_sound_registry(): SoundRegistry {
        return this._sfx_registry;
    }

    get_fs(): AbstractFileSystem {
        return this._fs;
    }

    get_window_manager(): AbstractWindowManager | null {
        return this._wm;
    }

    has_window_manager(): boolean {
        return this._wm !== null;
    }

    get_process_manager(): ProcessManager {
        return this._process_manager;
    }

    get_ipc(): IPCManager {
        return this._process_manager.ipc_manager;
    }

    spawn = (command: string, args: string[] = [], shell?: AbstractShell, original_line_parse?: LineParseResultCommand): SpawnResult => {
        // search for the command in the registry
        const program = this._prog_registry.getProgram(command);
        if (program === undefined) {
            throw new Error(`Command not found: ${command}`);
        }

        // we may not be provided a parsed line (if this is a direct call, not from execute()), but we can create one by assumption
        const parsed_line: LineParseResultCommand = original_line_parse ?? {
            type: "command",
            command,
            args,
            unsubbed_args: args,
            raw_parts: [command, ...args],
            run_in_bg: false
        };

        // create new process context
        const process = this._process_manager.create_process(parsed_line);

        // if the command is found, run it
        const data = {
            kernel: this,
            term: this._term,
            args,
            shell,
            unsubbed_args: parsed_line.unsubbed_args,
            raw_parts: parsed_line.raw_parts,
            process
        };

        // TODO: is passing shell around annoying? how can it be alleviated without affecting separation of concerns?

        // create a promise that resolves when the program completes
        let result_promise: Promise<number>;
        if ("main" in program) {
            result_promise = Promise.resolve(program.main(data));
        } else {
            throw new Error("Invalid program type");
        }

        return {
            process,
            completion: result_promise
        };
    }

    panic(message: string, debug_info?: string) {
        if (this._panicked) {
            return;
        }

        this._panicked = true;

        // print formatted panic to js console
        console.error(`%cPANIC: ${message}\n${debug_info || ""}`, "background: red; color: white; font-weight: bold;");

        const proc_mgr = this.get_process_manager();
        const pids = proc_mgr.list_pids();

        let process_info = ""

        for (const pid of pids) {
            const proc = proc_mgr.get_process(pid);

            if (proc) {
                process_info += `- PID ${proc.pid}: ${proc.source_command.command} (started at ${proc.created_at.toISOString()})${NEWLINE}`;
            }
        }

        // remove last NEWLINE
        process_info = process_info.trimEnd();

        proc_mgr.dispose_all();
        this._term.handle_kernel_panic(message, process_info, debug_info);
    }

    constructor(term: WrappedTerminal, fs: AbstractFileSystem, prog_registry?: ProgramRegistry, sound_registry?: SoundRegistry, wm?: AbstractWindowManager) {
        this._term = term;
        this._fs = fs;
        this._prog_registry = prog_registry || new ProgramRegistry();
        this._sfx_registry = sound_registry || new SoundRegistry();
        this._wm = wm || null;
        this._process_manager = new ProcessManager(this._wm);
    }
}
