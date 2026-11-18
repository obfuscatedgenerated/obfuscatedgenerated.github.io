import type { Program } from "../types";

import {Kernel} from "../kernel";
import {AbstractFileSystem} from "../kernel/filesystem";
import {AbstractTerminal, KeyEvent, UserspaceTerminal} from "../kernel/term_ctl";
import {RemoteProxy} from "../kernel/rpc";

class VMFileSystem extends AbstractFileSystem {
    constructor() {
        super();
        this._initialised = true;
    }


    delete_dir_direct(path: string, recursive: boolean): Promise<void> {
        return Promise.resolve(undefined);
    }

    delete_file_direct(path: string): Promise<void> {
        return Promise.resolve(undefined);
    }

    dir_exists(path: string): Promise<boolean> {
        return Promise.resolve(false);
    }

    erase_all(): Promise<void> {
        return Promise.resolve(undefined);
    }

    exists_direct(path: string): Promise<boolean> {
        return Promise.resolve(false);
    }

    get_unique_fs_type_name(): string {
        return "";
    }

    is_readonly_direct(path: string): Promise<boolean> {
        return Promise.resolve(false);
    }

    is_ready(): Promise<boolean> {
        return Promise.resolve(false);
    }

    list_dir(path: string, dirs_first?: boolean): Promise<string[]> {
        return Promise.resolve([]);
    }

    make_dir(path: string): Promise<void> {
        return Promise.resolve(undefined);
    }

    move_dir_direct(src: string, dest: string, force_move_inside: boolean): Promise<void> {
        return Promise.resolve(undefined);
    }

    move_file_direct(src: string, new_path: string): Promise<void> {
        return Promise.resolve(undefined);
    }

    read_file_direct(path: string, as_uint: boolean): Promise<string | Uint8Array> {
        return Promise.resolve("noop");
    }

    set_readonly_direct(path: string, readonly: boolean): Promise<void> {
        return Promise.resolve(undefined);
    }

    write_file_direct(path: string, data: string | Uint8Array): Promise<void> {
        return Promise.resolve(undefined);
    }

}

// TODO: dir scoped fs is useful in other scenarios, move it to the kernel

class VMTerminal extends AbstractTerminal {
    readonly #parent: RemoteProxy<UserspaceTerminal>;

    constructor(parent: RemoteProxy<UserspaceTerminal>) {
        super();
        this.#parent = parent;
    }

    write(data: string | Uint8Array, callback?: () => void): void {
        this.#parent.write(data, callback);
    }
    writeln(data: string | Uint8Array, callback?: () => void): void {
        this.#parent.writeln(data, callback);
    }
    clear(): void {
        this.#parent.clear();
    }
    reset(): void {
        this.#parent.reset();
    }
    get_selection(): string {
        console.error("VMTerminal.get_selection() is not implemented");
        return "";
    }
    clear_selection(): void {
        console.error("VMTerminal.clear_selection() is not implemented");
    }
    has_selection(): boolean {
        console.error("VMTerminal.has_selection() is not implemented");
        return false;
    }
    copy(): void {
        console.error("VMTerminal.copy() is not implemented");
    }
    paste(): void {
        console.error("VMTerminal.paste() is not implemented");
    }
    focus(): void {
        console.error("VMTerminal.focus() is not implemented");
    }
    dispose(): void {
        console.error("VMTerminal.dispose() is not implemented");
    }
    get input_enabled(): boolean {
        console.error("VMTerminal.input_enabled getter is not implemented");
        return true;
    }
    set input_enabled(value: boolean) {
        console.error("VMTerminal.input_enabled setter is not implemented");
    }
    pause_input_processing(): void {
        console.error("VMTerminal.pause_input_processing() is not implemented");
    }
    resume_input_processing(): void {
        console.error("VMTerminal.resume_input_processing() is not implemented");
    }
    protected _read_raw_key(): Promise<KeyEvent> {
        console.error("VMTerminal._read_raw_key() is not implemented");
        return Promise.resolve({key: "", domEvent: new KeyboardEvent("keydown")});
    }
    get cols(): number {
        return this.#parent.cols;
    }
    get rows(): number {
        return this.#parent.rows;
    }
    get cursor_x(): number {
        console.error("VMTerminal.cursor_x getter is not implemented");
        return 0;
    }
    get cursor_y(): number {
        console.error("VMTerminal.cursor_y getter is not implemented");
        return 0;
    }
    get_custom_flag(flag: string) {
        return this.#parent.get_custom_flag(flag);
    }
    set_custom_flag(flag: string, value: any): void {
        this.#parent.set_custom_flag(flag, value);
    }
    supports_custom_flag(flag: string): boolean {
        //return this.#parent.supports_custom_flag(flag);
        console.error("VMTerminal.supports_custom_flag() is not implemented");
        return false;
    }
}

// TODO: move the core "get me the kernel but in an isothread" to the os itself as a hypervisor type module rather than exploiting the fact we can do imports here

export default {
    name: "vm_test",
    description: "",
    usage_suffix: "",
    arg_descriptions: {},
    compat: "3.0.0",
    completion: async () => [],
    main: async (data) => {
        const { kernel, term } = data;

        const virtual_fs = new VMFileSystem();

        // wait for virtual fs._initialised to be true
        // TODO: this is a bad hack, we also need to do this for the main boot as its a race condition too
        while (!virtual_fs._initialised) {
            await new Promise((resolve) => setTimeout(resolve, 10));
        }

        // inherit virtual programs
        //const virtual_programs = kernel.get_virtual_programs();

        const virtual_term = new VMTerminal(term);

        const vm_kernel = new Kernel({term: virtual_term, fs: virtual_fs});

        const { version } = kernel.get_env_info();
        vm_kernel.set_env_info(version, "virtual");

        await vm_kernel.boot(async () => {
            term.writeln("vm_test: virtual kernel booted.");
            //term.writeln("Inducing virtual panic...");
            //vm_kernel.panic("This is a test panic from within the virtual machine.");
        });

        return 0;
    }
} satisfies Program;
