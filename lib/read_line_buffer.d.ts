export interface ReadLineBufferSource {
    current_line: string;
    current_index: number;
}
/**
 * Sets the line in a read_line buffer. Runs where it is called, so a program reads its own change straight away.
 * @group Userspace
 * @category Terminal
 */
export declare const set_buffer_line: (this: ReadLineBufferSource, new_line: string) => void;
/**
 * Sets the cursor index in a read_line buffer. Runs where it is called, so a program reads its own change straight away.
 * @group Userspace
 * @category Terminal
 */
export declare const set_buffer_index: (this: ReadLineBufferSource, new_index: number) => void;
