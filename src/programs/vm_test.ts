import type { Program } from "../types";

export default {
    name: "vm_test",
    description: "",
    usage_suffix: "",
    arg_descriptions: {},
    compat: "2.0.0",
    completion: async () => [],
    main: async (data) => {
        const { kernel: userspace_kernel, term } = data;

        const kernel = await userspace_kernel.request_privilege("Virtualise the kernel.");
        if (!kernel) {
            term.writeln("vm_test: could not acquire kernel privilege.");
            return 1;
        }

        // get constructors we need
        const fs_cons = kernel.get_fs().constructor;
        const kernel_cons = kernel.constructor;

        // will inherit programregistry and terminal
        const prog_reg = kernel.get_program_registry();

        //@ts-ignore
        const virtual_fs = new fs_cons();

        // wait for virtual fs._initialised to be true
        // TODO: this is a bad hack, we also need to do this for the main boot as its a race condition too
        while (!virtual_fs._initialised) {
            await new Promise((resolve) => setTimeout(resolve, 10));
        }

        // could use import here but want to simulate it as an option for 3rd party programs
        // TODO: option to change fs root path to allow virtualisation at different paths, could also make a special fs_impl for this
        //@ts-ignore
        const vm_kernel = new kernel_cons(term, virtual_fs, prog_reg) as typeof kernel;

        const { version } = kernel.get_env_info();
        vm_kernel.set_env_info(version, "virtual");

        await vm_kernel.boot(async () => {
            term.writeln("vm_test: virtual kernel booted.");
            term.writeln("Inducing virtual panic...");
            vm_kernel.panic("This is a test panic from within the virtual machine.");
        });

        return 0;
    }
} as Program;