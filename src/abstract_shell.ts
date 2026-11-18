// TODO: as these are just interfaces, where do they belong? not particularly part of the kernel but feels odd to have them loose. maybe part of a types directory with types.ts?

import {finalise_userspace_proxy, is_userspace_proxy, type Remote, type sync_members, to_rpc_value} from "./kernel/rpc";

/**
 * The memory part of a {@link ShellHandle}. The history index is a getter and setter pair, as a property can't call back into the shell.
 * @hidden
 */
export interface ShellMemoryHandle {
    get_current_history_index(): number;
    set_current_history_index(index: number): void;
    clear_history(): void;
    get_previous_history_entry(): string | undefined;
    get_next_history_entry(): string | undefined;
    add_history_entry(entry: string): void;
    list_variables(): Map<string, string>;
    get_variable(name: string): string | undefined;
    set_variable(name: string, value: string): void;
    unset_variable(name: string): boolean;
    list_aliases(): Map<string, string>;
    get_alias(name: string): string | undefined;
    set_alias(name: string, value: string): void;
    unset_alias(name: string): boolean;
}

/**
 * What a shell is sent over RPC as, since a class instance can't be. Its functions become callbacks into the shell.
 * @hidden
 */
export interface ShellHandle {
    readonly name: string;
    readonly memory: ShellMemoryHandle;
    execute(line: string, edit_doc_title?: boolean, program_final_completion_callback?: (exit_code?: number) => void): Promise<boolean>;
}

// the same handle every time, so the kernel sees the same callbacks and resolves them to the same shell
const handles_by_shell = new WeakMap<AbstractShell, ShellHandle>();

// what a shell becomes when sent over RPC
const create_shell_handle = (shell: AbstractShell): ShellHandle => {
    const existing = handles_by_shell.get(shell);
    if (existing) {
        return existing;
    }

    const handle: ShellHandle = {
        name: shell.name,
        memory: {
            get_current_history_index: () => shell.memory.current_history_index,
            set_current_history_index: (index) => { shell.memory.current_history_index = index; },
            clear_history: () => shell.memory.clear_history(),
            get_previous_history_entry: () => shell.memory.get_previous_history_entry(),
            get_next_history_entry: () => shell.memory.get_next_history_entry(),
            add_history_entry: (entry) => shell.memory.add_history_entry(entry),
            list_variables: () => shell.memory.list_variables(),
            get_variable: (name) => shell.memory.get_variable(name),
            set_variable: (name, value) => shell.memory.set_variable(name, value),
            unset_variable: (name) => shell.memory.unset_variable(name),
            list_aliases: () => shell.memory.list_aliases(),
            get_alias: (name) => shell.memory.get_alias(name),
            set_alias: (name, value) => shell.memory.set_alias(name, value),
            unset_alias: (name) => shell.memory.unset_alias(name),
        },
        execute: (line, edit_doc_title, program_final_completion_callback) => shell.execute(line, edit_doc_title, program_final_completion_callback),
    };

    handles_by_shell.set(shell, handle);
    return handle;
};

export abstract class AbstractShellMemory {
    abstract get current_history_index(): number;
    abstract set current_history_index(index: number);

    abstract clear_history(): void;

    abstract get_previous_history_entry(): string | undefined;

    abstract get_next_history_entry(): string | undefined;

    abstract add_history_entry(entry: string): void;

    abstract list_variables(): Map<string, string>;

    abstract get_variable(name: string): string | undefined;

    abstract set_variable(name: string, value: string): void;

    abstract unset_variable(name: string): boolean;

    abstract list_aliases(): Map<string, string>;

    abstract get_alias(name: string): string | undefined;

    abstract set_alias(name: string, value: string): void;

    // TODO: move aliases to builtin shell program

    abstract unset_alias(name: string): boolean;
}

export abstract class AbstractShell {
    abstract name: string;

    abstract get memory(): AbstractShellMemory;

    // edit_doc_title should default to true in implementations
    abstract execute(line: string, edit_doc_title?: boolean, program_final_completion_callback?: (exit_code?: number) => void): Promise<boolean>;

    /**
     * A shell crosses RPC (e.g. when passed to spawn) as callbacks into itself, so shells can be passed around like any other value.
     * @hidden
     */
    [to_rpc_value](): ShellHandle {
        return create_shell_handle(this);
    }

    // TODO: expose parse method
}

/**
 * The userspace proxy of a shell's memory. Programs running in an isothread receive it as {@link Remote}<UserspaceShellMemory>.
 *
 * @group Userspace
 * @category Shells
 */
export interface ParentShellMemory {
    /** @hidden */
    readonly [sync_members]?: (member: never) => void;
    clear_history(): void;
    get_previous_history_entry(): string | undefined;
    get_next_history_entry(): string | undefined;
    add_history_entry(entry: string): void;
    list_variables(): Map<string, string>;
    get_variable(name: string): string | undefined;
    set_variable(name: string, value: string): void;
    unset_variable(name: string): boolean;
    list_aliases(): Map<string, string>;
    get_alias(name: string): string | undefined;
    set_alias(name: string, value: string): void;
    unset_alias(name: string): boolean;
}

/**
 * How the RPC layer accesses a shell's userspace proxy: these members read synchronously, everything else goes to the kernel.
 * @hidden
 */
export const USERSPACE_SHELL_ANNOTATIONS = {
    name: "constant",
    memory: "eager_handle",
} as const;

/**
 * The userspace proxy of the shell that invoked a program. Programs running in an isothread receive it as {@link Remote}<UserspaceShell>.
 *
 * @group Userspace
 * @category Shells
 */
export interface ParentShell {
    /** @hidden */
    readonly [sync_members]?: (member: keyof typeof USERSPACE_SHELL_ANNOTATIONS) => void;
    readonly name: string;
    readonly memory: ParentShellMemory;
    execute(line: string, edit_doc_title?: boolean, program_final_completion_callback?: (exit_code?: number) => void): Promise<boolean>;
}

// kernel side of a shell handle. its callbacks into the program return promises, which is fine as only userspace reads a shell's memory (through its proxy, where everything is awaited anyway)
class HandleShell extends AbstractShell {
    readonly name: string;
    readonly #handle: ShellHandle;
    readonly #memory: AbstractShellMemory;

    constructor(handle: ShellHandle) {
        super();

        this.name = handle.name;
        this.#handle = handle;

        const handle_memory = handle.memory;
        this.#memory = {
            get current_history_index() {
                return handle_memory.get_current_history_index();
            },
            set current_history_index(index: number) {
                void handle_memory.set_current_history_index(index);
            },
            clear_history: () => handle_memory.clear_history(),
            get_previous_history_entry: () => handle_memory.get_previous_history_entry(),
            get_next_history_entry: () => handle_memory.get_next_history_entry(),
            add_history_entry: (entry: string) => handle_memory.add_history_entry(entry),
            list_variables: () => handle_memory.list_variables(),
            get_variable: (name: string) => handle_memory.get_variable(name),
            set_variable: (name: string, value: string) => handle_memory.set_variable(name, value),
            unset_variable: (name: string) => handle_memory.unset_variable(name),
            list_aliases: () => handle_memory.list_aliases(),
            get_alias: (name: string) => handle_memory.get_alias(name),
            set_alias: (name: string, value: string) => handle_memory.set_alias(name, value),
            unset_alias: (name: string) => handle_memory.unset_alias(name),
        } as AbstractShellMemory;
    }

    get memory(): AbstractShellMemory {
        return this.#memory;
    }

    execute(line: string, edit_doc_title?: boolean, program_final_completion_callback?: (exit_code?: number) => void): Promise<boolean> {
        return this.#handle.execute(line, edit_doc_title, program_final_completion_callback);
    }
}

// a handle arrives as a fresh copy each call, but its callbacks are the same each time, so its shell is looked up by one of them
const shells_by_handle_execute = new WeakMap<ShellHandle["execute"], HandleShell>();

const is_shell_handle = (value: unknown): value is ShellHandle => {
    const candidate = value as Partial<ShellHandle>;
    return typeof candidate.name === "string" && typeof candidate.execute === "function" && typeof candidate.memory === "object" && candidate.memory !== null;
};

// a shell is always given out as the same proxy, and a proxy handed back (e.g. to spawn) resolves to its shell
const proxies_by_shell = new WeakMap<AbstractShell, ParentShell>();
const shells_by_proxy = new WeakMap<ParentShell, AbstractShell>();

/**
 * Kernel only. Resolves a shell given by a program back to the real shell: a stub the program passes arrives as its proxy, and a {@link ShellHandle} from a shell running in an isothread is wrapped as a shell. Returns undefined for anything else.
 */
export const unwrap_shell = (shell: AbstractShell | ParentShell | Remote<ParentShell>): AbstractShell | undefined => {
    const unwrapped = shells_by_proxy.get(shell as ParentShell);
    if (unwrapped) {
        return unwrapped;
    }

    if (is_userspace_proxy(shell)) {
        return undefined;
    }

    // a real shell is a class instance, while a handle arrives as a plain object
    const prototype = Object.getPrototypeOf(shell);
    if (prototype !== Object.prototype && prototype !== null) {
        return shell as AbstractShell;
    }

    const handle: unknown = shell;
    if (!is_shell_handle(handle)) {
        return undefined;
    }

    const existing = shells_by_handle_execute.get(handle.execute);
    if (existing) {
        return existing;
    }

    const wrapped = new HandleShell(handle);
    shells_by_handle_execute.set(handle.execute, wrapped);
    return wrapped;
};

// only used by the rpc layer to send a shell to a program running behind rpc
export const create_shell_memory_rpc_proxy = (memory: AbstractShellMemory): ParentShellMemory => {
    const proxy = Object.create(null);

    Object.defineProperties(proxy, {
        current_history_index: { get: () => memory.current_history_index, set: (index: number) => { memory.current_history_index = index; }, enumerable: true },
        clear_history: { value: () => memory.clear_history(), enumerable: true },
        get_previous_history_entry: { value: () => memory.get_previous_history_entry(), enumerable: true },
        get_next_history_entry: { value: () => memory.get_next_history_entry(), enumerable: true },
        add_history_entry: { value: (entry: string) => memory.add_history_entry(entry), enumerable: true },
        list_variables: { value: () => memory.list_variables(), enumerable: true },
        get_variable: { value: (name: string) => memory.get_variable(name), enumerable: true },
        set_variable: { value: (name: string, value: string) => memory.set_variable(name, value), enumerable: true },
        unset_variable: { value: (name: string) => memory.unset_variable(name), enumerable: true },
        list_aliases: { value: () => memory.list_aliases(), enumerable: true },
        get_alias: { value: (name: string) => memory.get_alias(name), enumerable: true },
        set_alias: { value: (name: string, value: string) => memory.set_alias(name, value), enumerable: true },
        unset_alias: { value: (name: string) => memory.unset_alias(name), enumerable: true },
    });

    return finalise_userspace_proxy(proxy) as ParentShellMemory;
};

// only used by the rpc layer to send a shell to a program running behind rpc (shells are already userspace)
export const create_shell_rpc_proxy = (shell: AbstractShell): ParentShell => {
    const existing = proxies_by_shell.get(shell);
    if (existing) {
        return existing;
    }

    const proxy = Object.create(null);

    // a shell's memory never changes, so the same proxy is always returned
    const memory_proxy = create_shell_memory_rpc_proxy(shell.memory);

    Object.defineProperties(proxy, {
        name: { get: () => shell.name, enumerable: true },
        memory: { get: () => memory_proxy, enumerable: true },
        execute: {
            value: (line: string, edit_doc_title?: boolean, program_final_completion_callback?: (exit_code?: number) => void) =>
                shell.execute(line, edit_doc_title, program_final_completion_callback),
            enumerable: true,
        },
    });

    const finalised = finalise_userspace_proxy(proxy, USERSPACE_SHELL_ANNOTATIONS) as ParentShell;

    proxies_by_shell.set(shell, finalised);
    shells_by_proxy.set(finalised, shell);

    return finalised;
};
