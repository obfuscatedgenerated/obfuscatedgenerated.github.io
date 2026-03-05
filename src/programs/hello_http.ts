import type { Program } from "../types";

export default {
    name: "hello_http",
    description: "Exposes an HTTP server on port 8080 that responds with 'Hello, World!' to any request.",
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

        const server = await process.network_listen(8080);
        server.add_event_listener("connection", (socket) => {
            socket.add_event_listener("data", (s_data) => {
                const decoder = new TextDecoder();
                term.writeln("Received HTTP request:");
                term.writeln(decoder.decode(s_data));
            });

            socket.send("HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nContent-Length: 13\r\n\r\nHello, World!");
            socket.close();
        });

        term.writeln("HTTP server started on port 8080. Press any key to stop the server.");
        await term.wait_for_keypress();

        return 0;
    }
} as Program;

// TODO: network utility to show type name, whether up, number of bound ports, and maybe number of clients (need a getter)
