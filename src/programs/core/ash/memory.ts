import type {AbstractShellMemory} from "../../../abstract_shell";

export class AshMemory implements AbstractShellMemory {
    // TODO: backup history in a file
    #history: string[] = [];

    current_history_index = 0;

    readonly #vars: Map<string, string> = new Map();
    readonly #aliases: Map<string, string> = new Map();

    clear_history(): void {
        this.#history = [];
        this.current_history_index = 0;
    }

    get_previous_history_entry(): string | undefined {
        if (this.#history.length === 0 || this.current_history_index >= this.#history.length) {
            return undefined;
        }

        const entry = this.#history[this.#history.length - 1 - this.current_history_index];
        this.current_history_index += 1;
        return entry;
    }

    get_next_history_entry(): string | undefined {
        if (this.#history.length === 0 || this.current_history_index <= 0) {
            return undefined;
        }

        this.current_history_index -= 1;
        if (this.current_history_index === 0) {
            return "";
        }

        return this.#history[this.#history.length - 1 - this.current_history_index];
    }

    add_history_entry(entry: string): void {
        this.#history.push(entry);
        this.current_history_index = 0;
    }

    list_variables(): Map<string, string> {
        return this.#vars;
    }

    get_variable(name: string): string | undefined {
        return this.#vars.get(name);
    }

    set_variable(name: string, value: string): void {
        this.#vars.set(name, value);
    }

    unset_variable(name: string): boolean {
        return this.#vars.delete(name);
    }

    list_aliases(): Map<string, string> {
        return this.#aliases;
    }

    get_alias(name: string): string | undefined {
        return this.#aliases.get(name);
    }

    set_alias(name: string, value: string): void {
        this.#aliases.set(name, value);
    }

    unset_alias(name: string): boolean {
        return this.#aliases.delete(name);
    }
}
