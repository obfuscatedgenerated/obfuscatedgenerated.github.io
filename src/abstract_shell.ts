export abstract class AbstractShellMemory {
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

let version = "unknown";
let env = "unknown";

export const set_special_vars = (new_version: string, new_env: string) => {
    version = new_version;
    env = new_env;
};

export const apply_special_vars = (shell: AbstractShell) => {
    shell.memory.set_variable("VERSION", version);
    shell.memory.set_variable("ENV", env);
}

// bit of a hack to get version and env into shells without assumptions (about shell choice or about if its running in the browser), so long as the shell calls it at startup
// it works at least
