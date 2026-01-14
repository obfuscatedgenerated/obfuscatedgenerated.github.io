import {ProgramRegistry, recurse_mount_and_register_with_output, UserspaceProgramRegistry} from "./prog_registry";
import {AbstractFileSystem, type UserspaceFileSystem} from "./filesystem";

import {SoundRegistry} from "./sfx_registry";
import {AbstractWindowManager, UserspaceWindowManager} from "./windowing";
import {
    IPCManager,
    KERNEL_FAKE_PID,
    ProcessContext,
    ProcessManager,
    UserspaceIPCManager, UserspaceOtherProcessContext,
    UserspaceProcessManager
} from "./processes";
import type {AbstractShell} from "../abstract_shell";

import {NEWLINE, type WrappedTerminal} from "./term_ctl";

import semver_validate from "semver/functions/valid";
import semver_compare from "semver/functions/compare"

const CURRENT_API_COMPAT = "2.0.0";

/**
 * Result of a spawned process.
 * @property process The {@link ProcessContext} of the spawned process.
 * @property completion A promise that resolves to the exit code of the process. Note that the program has already started executing by the time this promise is returned. Awaiting it is not necessary to start execution.
 *
 * @group Userspace
 * @category Kernel
 */
export interface SpawnResult {
    process: ProcessContext;
    completion: Promise<number>;
}

/**
 * Interface for interacting with the kernel from userspace.
 *
 * @group Userspace
 * @category Kernel
 */
export interface UserspaceKernel {
    /**
     * Whether this kernel interface has privileged access (false for UserspaceKernel interface).
     */
    readonly privileged: boolean;

    /**
     * Access the {@link UserspaceProgramRegistry} for this kernel.
     */
    get_program_registry(): UserspaceProgramRegistry;

    /**
     * Access the {@link SoundRegistry} for this kernel.
     */
    get_sound_registry(): SoundRegistry;

    /**
     * Access the chosen {@link UserspaceFileSystem} for this kernel.
     */
    get_fs(): UserspaceFileSystem;

    /**
     * Access the chosen {@link UserspaceWindowManager} for this kernel, if any.
     */
    get_window_manager(): UserspaceWindowManager | null;

    /**
     * Determine if a window manager is present.
     */
    has_window_manager(): boolean;

    /**
     * Access the {@link UserspaceProcessManager} for this kernel.
     */
    get_process_manager(): UserspaceProcessManager;

    /**
     * Access the {@link UserspaceIPCManager} for this kernel.
     */
    get_ipc(): UserspaceIPCManager;

    /**
     * Access the version and environment info assigned to this kernel.
     */
    get_env_info(): {version: string, env: string};

    /**
     * Spawn a new process.
     * @param cmd_or_line_parse Either a command string or a pre-parsed command line to execute.
     * @param explicit_args Ignored if cmd_or_line_parse is a {@link ParsedCommandLine}. Otherwise, the explicit arguments to pass to the command.
     * @param shell The shell that is spawning this process, if any.
     * @returns A {@link SpawnResult} containing the process context and a promise for its completion. You are responsible for terminating the process on an error or after execution.
     */
    spawn(cmd_or_line_parse: string | ParsedCommandLine, explicit_args?: string[], shell?: AbstractShell): SpawnResult; // TODO: how safe will this be to expose?

    /**
     * Request privileged access from the kernel.
     * @param reason The reason for requesting privileged access.
     * @returns A promise that resolves to a privileged {@link Kernel} interface if approved, or false if denied.
     */
    request_privilege(reason: string): Promise<Kernel | false>;
}

/**
 * Parsed command line structure.
 * @property command The command (program name) to execute.
 * @property args The arguments to pass to the command, trimmed and with any substitutions applied (e.g. variables).
 * @property unsubbed_args The arguments to pass to the command, trimmed but without any substitutions applied.
 * @property raw_parts The raw parts of the command line, including the command and all unparsed but split arguments, without trimming or substitutions applied.
 * @property run_in_bg Whether the command is to be run in the background.
 *
 * @group Userspace
 * @category Kernel
 */
export interface ParsedCommandLine {
    command: string;
    args: string[];
    unsubbed_args: string[];
    raw_parts: string[];
    run_in_bg: boolean;
}

/**
 * Interface for interacting with the kernel.
 *
 * @group Kernel (Privileged)
 * @category Kernel
 */
export class Kernel {
    readonly #term: WrappedTerminal;
    readonly #process_manager: ProcessManager;
    readonly #prog_registry: ProgramRegistry;
    readonly #sfx_registry: SoundRegistry;
    readonly #fs: AbstractFileSystem;
    readonly #wm: AbstractWindowManager | null = null;

    #panicked = false;
    #after_panic: (message: string, debug_info?: string) => void | null = null;

    #env_info = {
        version: "unknown",
        env: "unknown"
    };

    #init_program_name: string | null = null;

    /**
     * Whether this kernel interface has privileged access (always true for Kernel class).
     */
    get privileged(): boolean {
        return true;
    }

    /**
     * Whether the kernel has panicked.
     */
    get panicked(): boolean {
        return this.#panicked;
    }

    /**
     * Access the {@link ProgramRegistry} for this kernel.
     */
    get_program_registry(): ProgramRegistry {
        return this.#prog_registry;
    }

    /**
     * Access the {@link SoundRegistry} for this kernel.
     */
    get_sound_registry(): SoundRegistry {
        return this.#sfx_registry;
    }

    /**
     * Access the chosen {@link AbstractFileSystem} implementation for this kernel.
     */
    get_fs(): AbstractFileSystem {
        return this.#fs;
    }

    /**
     * Access the chosen {@link AbstractWindowManager} implementation for this kernel, if any.
     */
    get_window_manager(): AbstractWindowManager | null {
        return this.#wm;
    }

    /**
     * Determine if a window manager is present.
     */
    has_window_manager(): boolean {
        return this.#wm !== null;
    }

    /**
     * Access the {@link ProcessManager} for this kernel.
     */
    get_process_manager(): ProcessManager {
        return this.#process_manager;
    }

    /**
     * Access the {@link IPCManager} for this kernel.
     */
    get_ipc(): IPCManager {
        return this.#process_manager.ipc_manager;
    }

    /**
     * Access the version and environment info assigned to this kernel.
     */
    get_env_info(): {version: string, env: string} {
        return {...this.#env_info};
    }

    /**
     * Assign version and environment info to this kernel.
     * @param version The version of OllieOS running.
     * @param env Custom string representing the environment OllieOS is running in (i.e. "web", "node", etc).
     */
    set_env_info(version: string, env: string) {
        this.#env_info.version = version;
        this.#env_info.env = env;
    }

    // TODO: cleaner spawn interface, shame theres no function overloading (but could make two more methods)

    /**
     * Spawn a new process.
     * @param cmd_or_parse Either a command string or a pre-parsed command line to execute.
     * @param explicit_args Ignored if cmd_or_parse is a {@link ParsedCommandLine}. Otherwise, the explicit arguments to pass to the command.
     * @param shell The shell that is spawning this process, if any.
     * @param start_privileged Whether to start the process with privileged kernel access. The process will not need to use {@link request_privilege} if this is true!!!
     * @returns A {@link SpawnResult} containing the process context and a promise for its completion. You are responsible for terminating the process on an error or after execution.
     */
    spawn = (cmd_or_parse: string | ParsedCommandLine, explicit_args?: string[], shell?: AbstractShell, start_privileged?: boolean): SpawnResult => {
        // TODO: is passing shell around annoying? how can it be alleviated without affecting separation of concerns?
        // TODO: replace the above with process ownership :)

        // we may not be provided a parsed line (if this is a direct call, not from execute()), but we can create one by assumption
        // args are only used if cmd_or_parse is a string
        // by ensuring only 1 source of truth is used at a time, we avoid manipulation from conflicting data
        let parsed_line: ParsedCommandLine;
        if (typeof cmd_or_parse === "string") {
            if (!explicit_args) {
                explicit_args = [];
            }

            parsed_line = {
                command: cmd_or_parse,
                args: [...explicit_args],
                unsubbed_args: [...explicit_args],
                raw_parts: [cmd_or_parse, ...explicit_args],
                run_in_bg: false
            };
        } else {
            parsed_line = cmd_or_parse;
        }

        const {command} = parsed_line;

        // shallow clone args to avoid mutation exploits (you never know)
        const args = parsed_line.args.slice();

        // search for the command in the registry
        const program = this.#prog_registry.getProgram(command);
        if (program === undefined) {
            throw new Error(`Command not found: ${command}`);
        }

        // validate that the name stored in the program matches the command called
        // under normal circumstances this should always be true, but doing this prevents obscure spoofing exploits
        if (program.name !== command) {
            throw new Error(`Program name mismatch for command ${command}: expected ${command}, got ${program.name}`);
        }

        let compat = "1.0.0";
        if (typeof program.compat === "string") {
            compat = program.compat;
        }

        if (!semver_validate(compat)) {
            throw new Error(`Program ${program.name} has an invalid compat SemVer: ${compat}`);
        }

        if (semver_compare(compat, CURRENT_API_COMPAT) < 0) {
            throw new Error(`Program ${program.name} is not compatible with OllieOS 2. (Add compat: "2.0.0" to the program object to mark it as ported.)`);
        }

        // create new process context
        const process = this.#process_manager.create_process(parsed_line, shell);

        // protect from pollution
        const data = Object.create(null);

        // provide either privileged or userspace kernel access
        if (start_privileged) {
            data.kernel = this;
        } else {
            data.kernel = this.create_userspace_proxy(process);
        }

        data.term = this.#term;
        data.args = args;
        data.shell = shell;
        data.unsubbed_args = parsed_line.unsubbed_args;
        data.raw_parts = parsed_line.raw_parts;
        data.process = process;

        Object.freeze(data);

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

    /**
     * Throw all the toys out of the pram.
     * @param message The panic message to show at the top of the panic screen.
     * @param debug_info Optional debug information to show below the panic message. It is usually helpful to pass the error message and stack trace here.
     */
    panic(message: string, debug_info?: string) {
        if (this.#panicked) {
            return;
        }

        this.#panicked = true;

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
        this.#term.handle_kernel_panic(message, process_info, debug_info);

        if (this.#after_panic) {
            this.#after_panic(message, debug_info);
        }
    }

    /**
     * Boot the kernel by starting the init system.
     * @param on_init_spawned Optional callback that is called once the init program has been spawned.
     * @param after_panic Optional callback that is called after a panic occurs.
     * @returns A promise that resolves at the end of all OllieOS execution (i.e. when init exits). Returns true for a successful finish, false for an unexpected exit (but neither case is good if expecting the system to keep running!).
     */
    async boot(on_init_spawned?: (kernel: Kernel) => Promise<void>, after_panic?: (message: string, debug_info?: string) => void): Promise<boolean> {
        this.#after_panic = after_panic || null;

        const fs = this.get_fs();

        // mount all programs in any subdirectory of /usr/bin
        // TODO: get rid of the concept of a programregistry being the sole way to run programs. mounting is a bad concept. it should be a cache, not the sole execution method. may need to redesign how programs are stored to have it be more part of the filesystem
        // TODO: smarter system that has files to be mounted so any stray js files don't get mounted? or maybe it doesn't matter and is better mounting everything for hackability!
        const usr_bin = fs.absolute("/usr/bin");
        if (await fs.exists(usr_bin)) {
            await recurse_mount_and_register_with_output(fs, usr_bin, this.get_program_registry(), this.#term);
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
            const init = this.spawn(init_program, init_args, undefined, true);

            this.#init_program_name = init_program;
            this.#term.focus();

            if (on_init_spawned) {
                on_init_spawned(this).catch((e) => {
                    console.error(e);
                });
            }

            if (init.process.pid !== 1) {
                this.panic(`init program ${init_program} did not start as PID 1!`);
                return false;
            }

            try {
                const exit_code = await init.completion;

                this.panic(`init program ${init_program} exited ${exit_code === 0 ? "unexpectedly" : "with an error"}!`, `Exit code: ${exit_code}`);
                return false;
            } catch (e) {
                console.error(e);
                this.panic(`init program ${init_program} error!`, e.toString() + NEWLINE + e.stack);
                return false;
            }
        } catch (e) {
            console.error(e);
            this.panic(`Failed to start init program ${init_program}!`, e.toString() + NEWLINE + e.stack);
            return false;
        }

        return true;
    }

    /**
     * Request privileged access from the kernel.
     * @param reason The reason for requesting privileged access.
     * @param process The process requesting privileged access.
     * @returns A promise that resolves to a privileged {@link Kernel} interface if approved, or false if denied.
     */
    async request_privilege(reason: string, process: ProcessContext): Promise<Kernel | false> {
        // TODO: a way to skip this when already privileged? or by pid?
        // TODO: remember my answer option when /sys security is implemented
        // TODO: implement killing in the proxies so that when the process dies, any privileged access is revoked

        // read /sys/privilege_agent to determine privilege agent
        const fs = this.get_fs();
        let agent_program = "default_privilege_agent";
        try {
            const agent_data = await fs.read_file("/sys/privilege_agent") as string;
            agent_program = agent_data.trim();
        } catch {
            // ignore, use default
            console.warn("Failed to read /sys/privilege_agent, using default privilege agent.");
        }

        if (!agent_program) {
            agent_program = "default_privilege_agent";
            console.warn("/sys/privilege_agent is empty, using default privilege agent.");
        }

        // create an unassigned ipc channel
        const ipc = this.get_ipc();
        const channel_id = ipc.reserve_kernel_channel();

        // spawn the privilege agent program, passing the channel id, and assign the channel to it
        const agent_proc = this.spawn(agent_program, [channel_id.toString()]);
        ipc.assign_kernel_channel(channel_id, agent_proc.process.pid);

        let handling_request = false;
        let approved: boolean | null = null;

        // listen for response on the channel
        ipc.channel_listen(channel_id, KERNEL_FAKE_PID, async (msg) => {
            const data = msg.data as { process: UserspaceOtherProcessContext; granted?: boolean; handling?: boolean; };

            // validate approved pid matches requesting pid
            if (data.process.pid !== process.pid) {
                console.warn(`Privilege request response pid ${data.process.pid} does not match requesting pid ${process.pid}, ignoring response.`);
                return;
            }

            // check if handling acknowledgement
            if (data.handling) {
                handling_request = true;
                return;
            }

            // otherwise, check for granted/denied
            if (data.granted !== undefined) {
                approved = data.granted;
            }
        });

        const process_proxy = process.create_userspace_proxy_as_other_process();

        // wait to handle for up to 10 seconds, repeating the request if not yet being handled
        // overall timeout up to 60 seconds
        const start_time = Date.now();
        // TODO: cleaner logic here
        while ((Date.now() - start_time) < 60000 && approved === null && (handling_request || (Date.now() - start_time) < 10000)) {
            if (!handling_request) {
                ipc.channel_send(channel_id, KERNEL_FAKE_PID, {
                    process: process_proxy,
                    reason
                });
            }

            await new Promise((resolve) => setTimeout(resolve, 500));
        }

        ipc.destroy_channel(channel_id);

        if (approved === null) {
            console.warn("Privilege request timed out.");
        }

        agent_proc.process.kill(approved === null ? 1 : 0);

        // return result
        if (approved) {
            return this;
        } else {
            return false;
        }
    }

    constructor(term: WrappedTerminal, fs: AbstractFileSystem, prog_registry?: ProgramRegistry, sound_registry?: SoundRegistry, wm?: AbstractWindowManager) {
        this.#term = term;
        this.#fs = fs;
        this.#prog_registry = prog_registry || new ProgramRegistry();
        this.#sfx_registry = sound_registry || new SoundRegistry();
        this.#wm = wm || null;
        this.#process_manager = new ProcessManager(this.#wm);
    }

    /**
     * Create a userspace proxy of this kernel for use in a userspace process.
     * @param process The process to create the proxy for.
     * @returns A {@link UserspaceKernel} proxy of this kernel.
     */
    create_userspace_proxy(process: ProcessContext): Promise<UserspaceKernel> {
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const self = this;
        const proxy = Object.create(null);

        const kernel_fs = self.get_fs();

        const proc_mgr_proxy = self.get_process_manager().create_userspace_proxy(process.pid);
        const prog_reg_proxy = self.get_program_registry().create_userspace_proxy(this.#init_program_name, kernel_fs);
        const fs_proxy = AbstractFileSystem.create_userspace_proxy(kernel_fs);

        Object.defineProperties(proxy, {
            privileged: { value: false, enumerable: true },
            get_program_registry: { value: () => prog_reg_proxy, enumerable: true },
            get_sound_registry: { value: () => self.get_sound_registry(), enumerable: true },
            get_fs: { value: () => fs_proxy, enumerable: true },
            get_window_manager: {
                value: () => {
                    const wm = self.get_window_manager();
                    return wm ? wm.create_userspace_proxy() : null;
                },
                enumerable: true
            },
            has_window_manager: { value: () => self.has_window_manager(), enumerable: true },
            get_process_manager: { value: () => proc_mgr_proxy, enumerable: true },
            get_ipc: { value: () => proc_mgr_proxy.ipc_manager, enumerable: true },
            get_env_info: { value: () => self.get_env_info(), enumerable: true },
            spawn: {
                value: (command: string | ParsedCommandLine, args?: string[], shell?: AbstractShell) =>
                    self.spawn(command, args, shell, false),
                enumerable: true
            },
            request_privilege: {
                value: (reason: string) => self.request_privilege(reason, process),
                enumerable: true
            }
        });

        return Object.freeze(proxy);
    }
}

// TODO: document the other kernel classes etc
