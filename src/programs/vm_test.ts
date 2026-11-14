import type { Program } from "../types";

export default {
    name: "vm_test",
    description: "",
    usage_suffix: "",
    arg_descriptions: {},
    space: "kernel",
    reason: "Virtualise the kernel.",
    compat: "2.0.0",
    completion: async () => [],
    main: async (data) => {
        const { kernel, term } = data;

        // get constructors we need
        const fs_cons = kernel.get_fs().constructor;
        const kernel_cons = kernel.constructor;

        //@ts-ignore
        const virtual_fs = new fs_cons();

        // wait for virtual fs._initialised to be true
        // TODO: this is a bad hack, we also need to do this for the main boot as its a race condition too
        while (!virtual_fs._initialised) {
            await new Promise((resolve) => setTimeout(resolve, 10));
        }

        // inherit virtual programs
        const virtual_programs = kernel.get_virtual_programs();

        // TODO: run kernel in an isothread somehow? might need isolated sections or manual isothread spawning in isothreads upstream

        // could use import here but want to simulate it as an option for 3rd party programs
        // TODO: option to change fs root path to allow virtualisation at different paths, could also make a special fs_impl for this
        //@ts-ignore
        const vm_kernel = new kernel_cons({term, fs: virtual_fs, virtual_programs}) as typeof kernel;

        const { version } = kernel.get_env_info();
        vm_kernel.set_env_info(version, "virtual");

        await vm_kernel.boot(async () => {
            term.writeln("vm_test: virtual kernel booted.");
            //term.writeln("Inducing virtual panic...");
            //vm_kernel.panic("This is a test panic from within the virtual machine.");
        });

        return 0;
    }
} as Program;