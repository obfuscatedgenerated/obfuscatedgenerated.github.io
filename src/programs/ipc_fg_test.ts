import type { Program } from "../types";

export default {
    name: "ipc_fg_test",
    description: "",
    usage_suffix: "",
    arg_descriptions: {},
    completion: async () => [],
    main: async (data) => {
        // extract from data to make code less verbose
        const { term, process } = data;

        const ipc = term.get_ipc();
        const channel = ipc.create_channel(process.pid, "ipc_bg_test");
        
        if (!channel) {
            term.writeln("Failed to create IPC channel to service 'ipc_bg_test'.");
            return 1;
        }

        ipc.channel_send(channel, process.pid, { message: "Hello from ipc_fg_test!" });

        return 0;
    }
} as Program;