export abstract class AbstractShell {
    // edit_doc_title should default to true in implementations
    abstract execute (line: string, edit_doc_title?: boolean, program_final_completion_callback?: (exit_code?: number) => void): Promise<boolean>;
}
