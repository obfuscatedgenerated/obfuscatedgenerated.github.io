import type { Program } from "../types";

export default {
    name: "ipc_bg_test",
    description: "",
    usage_suffix: "",
    arg_descriptions: {},
    hide_from_help: true,
    compat: "2.0.0",
    completion: async () => [],
    main: async (data) => {
        // extract from data to make code less verbose
        const { kernel, term, process } = data;

        process.detach();

        const ipc = kernel.get_ipc();
        ipc.service_register("ipc_bg_test", async (channel_id, from_pid) => {
            ipc.channel_listen(channel_id, async (msg) => {
                term.writeln(`Received message on channel ${channel_id} from PID ${msg.from}: ${JSON.stringify(msg.data)}`);
            });
        });

        term.writeln("ipc_bg_test service started and listening for messages.");

        return 0;
    }
} as Program;