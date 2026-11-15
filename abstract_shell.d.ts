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
export declare const create_shell_memory_rpc_proxy: (memory: AbstractShellMemory) => AbstractShellMemory;
export declare const create_shell_rpc_proxy: (shell: AbstractShell) => AbstractShell;
