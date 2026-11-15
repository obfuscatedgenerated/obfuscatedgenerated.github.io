import {define_local} from "./locals";

interface ReadLineBufferSource {
    current_line: string;
    current_index: number;
}

/**
 * Sets the line in a read_line buffer. Runs where it is called, so a program reads its own change straight away.
 * @group Userspace
 * @category Terminal
 */
export const set_buffer_line = define_local("read_line_buffer.set_current_line", function (this: ReadLineBufferSource, new_line: string): void {
    this.current_line = new_line;
});

/**
 * Sets the cursor index in a read_line buffer. Runs where it is called, so a program reads its own change straight away.
 * @group Userspace
 * @category Terminal
 */
export const set_buffer_index = define_local("read_line_buffer.set_current_index", function (this: ReadLineBufferSource, new_index: number): void {
    this.current_index = new_index;
});
