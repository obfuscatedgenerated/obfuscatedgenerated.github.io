import type {AbstractShell} from "../../../abstract_shell";
import type {Kernel, SpawnResult} from "../../../kernel";

import {ANSI, NEWLINE, type WrappedTerminal} from "../../../term_ctl";

import {AshMemory} from "./memory";
import {parse_line} from "./parser";

const {PREFABS, FG, STYLE} = ANSI;

export class AshShell implements AbstractShell {
    _kernel: Kernel;
    _term: WrappedTerminal;
    _memory = new AshMemory();

    _prompt_suffix = "$ ";

    // TODO: find a better place/way to handle this, maybe tab completion should be a class that stores its own state
    _discard_cached_matches = false;

    constructor(term: WrappedTerminal, kernel: Kernel) {
        this._term = term;
        this._kernel = kernel;
    }

    get memory(): AshMemory {
        return this._memory;
    }

    // returns success flag (or error if critical)
    execute = async (line: string, edit_doc_title = true, program_final_completion_callback?: (exit_code?: number) => void): Promise<boolean> => {
        const kernel = this._kernel;
        const term = this._term;
        const memory = this._memory;

        if (kernel.panicked) {
            return false;
        }

        // TODO: semicolon to run multiple commands regardless of success
        // TODO: double ampersand to run multiple commands only if previous succeeded
        // TODO: double pipe to run multiple commands only if previous failed
        // TODO: single pipe to pipe output of previous command to next command
        // TODO: allow certain control characters to be escaped e.g. $
        // TODO: support sh files

        if (line.length === 0) {
            // if the line is empty, just move to the next line (additional check if called from external source)
            return true;
        }

        const parsed_line = parse_line(line, memory);

        if (parsed_line === null) {
            // if the line is a comment or empty, do nothing
            return true;
        }

        // handle variable assignment
        if (parsed_line.type === "var") {
            memory.set_variable(parsed_line.var_name, parsed_line.var_value);
            return true;
        }

        // otherwise, it's a command. destructure it
        const { command } = parsed_line;

        // check if the command exists
        const prog_reg = kernel.get_program_registry();
        if (!prog_reg.getProgram(command)) {
            term.writeln(`${PREFABS.error}Command not found: ${FG.white + STYLE.italic}${command}${STYLE.reset_all}`);
            return false;
        }

        let old_title = "";
        if (edit_doc_title) {
            old_title = document.title;
            document.title = command;
        }

        // spawn the process
        let spawn_result: SpawnResult;
        try {
            spawn_result = kernel.spawn(command, parsed_line.args, this, parsed_line);
        } catch (e) {
            if (edit_doc_title) {
                document.title = old_title;
            }

            term.writeln(`${PREFABS.error}Failed to execute command: ${FG.white + STYLE.italic}${command}${STYLE.reset_all}`);
            console.error(e);
            return false;
        }

        const { process, completion } = spawn_result;

        const on_execute_completion = (exit_code?: number) => {
            if (exit_code === undefined) {
                exit_code = -2;
                console.warn(`Program ${command} did not return an exit code. Defaulting to -2.`)
            }

            memory._current_history_index = 0;

            if (edit_doc_title) {
                document.title = old_title;
            }

            if (process.is_detached) {
                process.add_exit_listener((code) => {
                    if (program_final_completion_callback) {
                        try {
                            program_final_completion_callback(code);
                        } catch (e) {
                            console.error("Error in program final completion callback for detached process:", e);
                        }
                    }

                    if (process.detaches_silently) {
                        return;
                    }

                    const status = code === 0 ? "Done" : `Exit ${code}`;
                    const color = code === 0 ? FG.green : FG.red;

                    // TODO: erase existing prompt and line
                    term.writeln("");
                    term.writeln(`${FG.gray}[${process.pid}] + ${color}${status}${FG.gray} \t ${command}${STYLE.reset_all}`);

                    // reinsert the prompt and current line
                    // TODO: respect running programs, maybe need a notification queue
                    this.insert_prompt(false);
                });

                // don't kill the process
                return;
            }

            process.kill(exit_code);

            if (program_final_completion_callback) {
                try {
                    program_final_completion_callback(exit_code);
                } catch (e) {
                    console.error("Error in program final completion callback:", e);
                }
            }

            if (process.is_background) {
                term.writeln(`\n${FG.gray}[${process.pid}] + Done \t ${command}${STYLE.reset_all}`);
            }
        }

        // now handle awaiting program completion
        try {
            if (process.is_detached) {
                if (!process.detaches_silently) {
                    term.writeln(`${FG.gray}[${process.pid}] process detached${STYLE.reset_all}`);
                }

                completion.then((exit_code) => {
                    on_execute_completion(exit_code);
                }).catch((e) => {
                    term.writeln(`${PREFABS.error}An unhandled error occurred in detached process [${process.pid}]: ${FG.white + STYLE.italic}${command}${STYLE.reset_all}`);
                    console.error(e);
                    on_execute_completion(-1);
                });
            } else if (process.is_foreground) {
                const exit_code = await completion;
                on_execute_completion(exit_code);

                // set the exit code variable
                memory.set_variable("?", exit_code.toString());
            } else {
                this._term.writeln(`${FG.gray}[${process.pid}] ${STYLE.italic}running in background${STYLE.reset_all}`);

                completion.then((exit_code) => {
                    on_execute_completion(exit_code);
                }).catch((e) => {
                    this._term.writeln(`${PREFABS.error}An unhandled error occurred in background process [${process.pid}]: ${FG.white + STYLE.italic}${command}${STYLE.reset_all}`);
                    console.error(e);

                    on_execute_completion(-1);
                });
            }
        } catch (e) {
            term.writeln(`${PREFABS.error}An unhandled error occurred while running the command: ${FG.white + STYLE.italic}${command}${STYLE.reset_all}`);
            console.error(e);

            on_execute_completion(-1);
            return false;
        }

        return true;
    }

    async run_script(path: string) {
        const fs = this._kernel.get_fs();

        if (await fs.exists(path)) {
            // iter through the lines of the file and execute them
            const content = await fs.read_file(path) as string;
            for (const line of content.split(NEWLINE)) {
                // TODO: catch errors
                await this.execute(line);
            }
        }
    }

    get_prompt_suffix(): string {
        return this._prompt_suffix;
    }

    set_prompt_suffix(suffix: string): void {
        this._prompt_suffix = suffix;
    }

    get_prompt_string(): string {
        const fs = this._kernel.get_fs();

        let path = fs.get_cwd();

        if (path.startsWith(fs.get_home())) {
            // replace home with ~ at start of path only
            path = path.replace(new RegExp(`^${fs.get_home()}`), "~");
        }

        // build result e.g. ~$
        return `${PREFABS.dir_name}${path}${STYLE.reset_all}${this._prompt_suffix}`;
    }

    async insert_prompt(newline = true) {
        const kernel = this._kernel;
        const term = this._term;

        if (kernel.panicked) {
            return;
        }

        if (newline) {
            term.write(NEWLINE);
        }

        // resolve a promise when writing is complete
        await new Promise<void>((resolve) => {
            term.write(this.get_prompt_string(), () => {
                resolve();
            });
        });
    }
}
