import type { AbstractShellMemory } from "../../../abstract_shell";
export declare class AshMemory implements AbstractShellMemory {
    _history: string[];
    _current_history_index: number;
    _vars: Map<string, string>;
    _aliases: Map<string, string>;
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
