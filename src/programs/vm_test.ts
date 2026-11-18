import type { Program } from "../types";

import {Kernel} from "../kernel";
import {AbstractTerminal, KeyEvent, UserspaceTerminal} from "../kernel/term_ctl";
import {RemoteProxy} from "../kernel/rpc";
import {ScopedFileSystem} from "../fs_impl/scoped";
import {initial_fs_setup} from "../initial_fs_setup";

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

        const host_fs = kernel.get_fs();
        const virtual_fs = await ScopedFileSystem.create(host_fs, {root: "/vms/test"});

        // wait for virtual fs._initialised to be true
        // TODO: this is a bad hack, we also need to do this for the main boot as its a race condition too
        while (!virtual_fs._initialised) {
            await new Promise((resolve) => setTimeout(resolve, 10));
        }

        // setup vfs
        await initial_fs_setup(virtual_fs, {});

        // copy host /bin to virtual /bin
        const host_bin_dir = await host_fs.list_dir("/bin");
        for (const file of host_bin_dir) {
            const path = `/bin/${file}`;

            const contents = await host_fs.read_file(path) as string;
            await virtual_fs.write_file(path, contents);
        }

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
