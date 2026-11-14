// TODO: as these are just interfaces, where do they belong? not particularly part of the kernel but feels odd to have them loose. maybe part of a types directory with types.ts?

import {finalise_userspace_proxy} from "./kernel/rpc";

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

    // TODO: expose parse method
}

// only used by the rpc layer to send a shell to a program running behind rpc
export const create_shell_memory_rpc_proxy = (memory: AbstractShellMemory): AbstractShellMemory => {
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

    return finalise_userspace_proxy(proxy) as AbstractShellMemory;
};

// only used by the rpc layer to send a shell to a program running behind rpc (shells are already userspace)
export const create_shell_rpc_proxy = (shell: AbstractShell): AbstractShell => {
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

    return finalise_userspace_proxy(proxy, {
        name: "constant",
        memory: "eager_handle",
    }) as AbstractShell;
};
