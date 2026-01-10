import {ProgramRegistry, recurse_mount_and_register_with_output} from "./prog_registry";
import type {AbstractFileSystem} from "./filesystem";

// TODO: organise this stuff to a kernel directory?
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

    _env_info = {
        version: "unknown",
        env: "unknown"
    }

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

    get_env_info(): {version: string, env: string} {
        return this._env_info;
    }

    set_env_info(version: string, env: string) {
        this._env_info.version = version;
        this._env_info.env = env;
    }

    spawn = (command: string, args: string[] = [], shell?: AbstractShell, original_line_parse?: LineParseResultCommand): SpawnResult => {
        // search for the command in the registry
        const program = this._prog_registry.getProgram(command);
        if (program === undefined) {
            throw new Error(`Command not found: ${command}`);
        }

        let compat = "1.0.0";
        if (typeof program.compat === "string") {
            compat = program.compat;
        }

        if (compat !== "2.0.0") {
            throw new Error(`Program ${program.name} is not compatible with OllieOS 2. (Add compat: "2.0.0" to the program object to mark it as ported.)`);
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

    async boot(): Promise<boolean> {
        const fs = this.get_fs();

        // mount all programs in any subdirectory of /usr/bin
        // TODO: get rid of the concept of a programregistry being the sole way to run programs. mounting is a bad concept. it should be a cache, not the sole execution method. may need to redesign how programs are stored to have it be more part of the filesystem
        // TODO: smarter system that has files to be mounted so any stray js files don't get mounted? or maybe it doesn't matter and is better mounting everything for hackability!
        const usr_bin = fs.absolute("/usr/bin");
        if (await fs.exists(usr_bin)) {
            await recurse_mount_and_register_with_output(fs, usr_bin, this.get_program_registry(), this._term);
        }

        // read /boot/init to determine init system
        let init_program: string;
        let init_args: string[] = [];

        try {
            const init_data = await fs.read_file("/boot/init") as string;
            init_program = init_data.trim();
        } catch {
            this.panic("Failed to read /boot/init to determine init system!");
            return false;
        }

        if (!init_program) {
            this.panic("No init program specified in /boot/init!");
            return false;
        }

        // separate args if any
        const init_parts = init_program.split(" ");
        init_program = init_parts[0];

        if (init_parts.length > 1) {
            init_args = init_parts.slice(1);
        }

        // run init program
        try {
            const init = this.spawn(init_program, init_args);

            if (init.process.pid !== 1) {
                this.panic(`init program ${init_program} did not start as PID 1!`);
                return false;
            }

            try {
                const exit_code = await init.completion;

                this.panic(`init program ${init_program} exited ${exit_code === 0 ? "unexpectedly" : "with an error"}!`, `Exit code: ${exit_code}`);
                return false;
            } catch (e) {
                this.panic(`init program ${init_program} error!`, e.toString());
                return false;
            }
        } catch (e) {
            this.panic(`Failed to start init program ${init_program}!`, e.toString());
            return false;
        }

        return true;
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
