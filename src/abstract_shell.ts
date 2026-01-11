import type {UserspaceOtherProcessContext} from "./processes";

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
    abstract get memory(): AbstractShellMemory;

    // edit_doc_title should default to true in implementations
    abstract execute(line: string, edit_doc_title?: boolean, program_final_completion_callback?: (exit_code?: number) => void): Promise<boolean>;
}
