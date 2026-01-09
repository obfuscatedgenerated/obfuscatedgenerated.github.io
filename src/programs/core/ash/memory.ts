export class AshMemory {
    // TODO: backup history in a file
    _history: string[] = [];
    _current_history_index = 0;

    _vars: Map<string, string> = new Map();
    _aliases: Map<string, string> = new Map();

    clear_history(): void {
        this._history = [];
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
