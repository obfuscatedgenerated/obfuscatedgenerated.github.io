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
        const { term, process } = data;

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
