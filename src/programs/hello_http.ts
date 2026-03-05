import type { Program } from "../types";

const generate_html = (env_info: {version: string, env: string}, network_manager_name: string) => {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Hello, World!</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            background-color: #111;
            color: #eee;
            padding: 2rem;
        }
        
        hr {
            margin: 2rem 0;
        }
        
        header {
            display: flex;
            align-items: center;
            gap: 2rem;
        }
        
        header img {
            width: 10rem;
        }
    </style>
</head>
<body>
    <header>
        <img src="https://ollieg.codes/public/logo.png" alt="OllieOS Logo" />
    
        <div>
            <h1>Hello, World!</h1>
            <b>This page was served from OllieOS!</b>
        </div>
    </header>
    
    <hr />
    
    <p>Environment: ${env_info.env}</p>
    <p>Kernel Version: ${env_info.version}</p>
    <p>Network Manager: ${network_manager_name}</p>
</body>
</html>`;
}

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

        kernel.get_env_info()

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

            const html = generate_html(kernel.get_env_info(), net_manager.get_unique_manager_type_name());

            const encoder = new TextEncoder();
            const encoded_html = encoder.encode(html);
            const content_length = encoded_html.length;

            socket.send(`HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: ${content_length}\r\n\r\n`);
            socket.send(encoded_html);
            socket.close();
        });

        term.writeln("HTTP server started on port 8080. Press any key to stop the server.");
        await term.wait_for_keypress();

        return 0;
    }
} as Program;
