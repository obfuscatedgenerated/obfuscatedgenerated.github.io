import type {AbstractShellMemory} from "../../../abstract_shell";

export class AshMemory implements AbstractShellMemory {
    // TODO: backup history in a file
    _history: string[] = [];
    _current_history_index = 0;

    _vars: Map<string, string> = new Map();
    _aliases: Map<string, string> = new Map();

    clear_history(): void {
        this._history = [];
        this._current_history_index = 0;
    }

    get_previous_history_entry(): string | undefined {
        if (this._history.length === 0 || this._current_history_index >= this._history.length) {
            return undefined;
        }

        const entry = this._history[this._history.length - 1 - this._current_history_index];
        this._current_history_index += 1;
        return entry;
    }

    get_next_history_entry(): string | undefined {
        if (this._history.length === 0 || this._current_history_index <= 0) {
            return undefined;
        }

        this._current_history_index -= 1;
        if (this._current_history_index === 0) {
            return "";
        }

        return this._history[this._history.length - 1 - this._current_history_index];
    }

    add_history_entry(entry: string): void {
        this._history.push(entry);
        this._current_history_index = 0;
    }

    list_variables(): Map<string, string> {
        return this._vars;
    }

    get_variable(name: string): string | undefined {
        return this._vars.get(name);
    }

    set_variable(name: string, value: string): void {
        this._vars.set(name, value);
    }

    unset_variable(name: string): boolean {
        return this._vars.delete(name);
    }

    list_aliases(): Map<string, string> {
        return this._aliases;
    }

    get_alias(name: string): string | undefined {
        return this._aliases.get(name);
    }

    set_alias(name: string, value: string): void {
        this._aliases.set(name, value);
    }

    unset_alias(name: string): boolean {
        return this._aliases.delete(name);
    }
}
