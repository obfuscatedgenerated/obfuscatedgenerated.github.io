import type { Program } from "../types";

export default {
    name: "ipc_fg_test",
    description: "",
    usage_suffix: "",
    arg_descriptions: {},
    hide_from_help: true,
    completion: async () => [],
    main: async (data) => {
        // extract from data to make code less verbose
        const { kernel, term, process } = data;

        const ipc = kernel.get_ipc();
        const channel = ipc.create_channel(process.pid, "ipc_bg_test");
        
        if (!channel) {
            term.writeln("Failed to create IPC channel to service 'ipc_bg_test'.");
            return 1;
        }

        ipc.channel_send(channel, process.pid, { message: "Hello from ipc_fg_test!" });

        return 0;
    }
} as Program;