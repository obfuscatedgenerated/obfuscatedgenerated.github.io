import { type Remote, type sync_members } from "./kernel/rpc";
export declare abstract class AbstractShellMemory {
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
    abstract unset_alias(name: string): boolean;
}
export declare abstract class AbstractShell {
    abstract name: string;
    abstract get memory(): AbstractShellMemory;
    abstract execute(line: string, edit_doc_title?: boolean, program_final_completion_callback?: (exit_code?: number) => void): Promise<boolean>;
}
/**
 * The userspace proxy of a shell's memory. Programs running in an isothread receive it as {@link Remote}<UserspaceShellMemory>.
 */
export interface UserspaceShellMemory {
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
export declare const USERSPACE_SHELL_ANNOTATIONS: {
    readonly name: "constant";
    readonly memory: "eager_handle";
};
/**
 * The userspace proxy of the shell that invoked a program. Programs running in an isothread receive it as {@link Remote}<UserspaceShell>.
 */
export interface UserspaceShell {
    /** @hidden */
    readonly [sync_members]?: (member: keyof typeof USERSPACE_SHELL_ANNOTATIONS) => void;
    readonly name: string;
    readonly memory: UserspaceShellMemory;
    execute(line: string, edit_doc_title?: boolean, program_final_completion_callback?: (exit_code?: number) => void): Promise<boolean>;
}
/**
 * Kernel only. Resolves a shell given by a program back to the real shell (a stub the program passes arrives as its proxy). Returns undefined for a proxy the kernel didn't make.
 */
export declare const unwrap_shell: (shell: AbstractShell | UserspaceShell | Remote<UserspaceShell>) => AbstractShell | undefined;
export declare const create_shell_memory_rpc_proxy: (memory: AbstractShellMemory) => UserspaceShellMemory;
export declare const create_shell_rpc_proxy: (shell: AbstractShell) => UserspaceShell;
