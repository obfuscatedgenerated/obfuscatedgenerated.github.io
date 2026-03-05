import type { Program } from "../types";

export default {
    name: "telnetd",
    description: "Telnet service",
    usage_suffix: "",
    arg_descriptions: {},
    compat: "2.0.0",
    hide_from_help: true,
    completion: async () => [],
    main: async (data) => {
        // extract from data to make code less verbose
        const { term, process, kernel } = data;

        if (!kernel.has_network_manager()) {
            term.writeln(`${term.ansi.PREFABS.error}No network manager found. This program requires a network manager to function.${term.ansi.STYLE.reset_all}`);
            return 1;
        }

        const net_manager = kernel.get_network_manager();
        if (!await net_manager.is_up(true)) {
            term.writeln(`${term.ansi.PREFABS.error}Network is down!${term.ansi.STYLE.reset_all}`);
            return 1;
        }

        const server = await process.network_listen(2323);
        server.add_event_listener("connection", (socket) => {
            socket.add_event_listener("data", (incoming_data) => {
                // filter out telnet commands (starting with 0xFF) for now
                const filtered_data = new Uint8Array(incoming_data.length);
                let j = 0;
                for (let i = 0; i < incoming_data.length; i++) {
                    if (incoming_data[i] === 0xFF) {
                        i += 2; // skip the command and its option
                    } else {
                        filtered_data[j++] = incoming_data[i];
                    }
                }
                const final_data = filtered_data.slice(0, j);

                const raw = new TextDecoder().decode(final_data);

                // echo back
                socket.send(raw);

                // for full lines just acknowledge it for now
                if (raw.includes("\r")) {
                    socket.send("You sent: " + raw.trim() + "\r\n> ");
                }
            });

            socket.send("\r\nWelcome to the OllieOS Telnet service!\r\n> ");
        });

        process.detach();
        return 0;
    }
} as Program;
