import type { Program } from "../../types";

export default {
    name: "fingerd",
    description: "Finger user information service",
    usage_suffix: "",
    arg_descriptions: {},
    compat: "2.0.0",
    hide_from_help: true,
    completion: async () => [],
    main: async (data) => {
        // extract from data to make code less verbose
        const { term, process, kernel, shell } = data;

        if (!kernel.has_network_manager()) {
            term.writeln(`${term.ansi.PREFABS.error}No network manager found. This program requires a network manager to function.${term.ansi.STYLE.reset_all}`);
            return 1;
        }

        const fs = kernel.get_fs();

        const start_server = async () => {
            const server = await process.network_listen(79);

            server.add_event_listener("connection", async (client) => {
                // Finger usually only receives one packet of data (the query)
                client.add_event_listener("data", async (incoming_data) => {
                    const query = new TextDecoder().decode(incoming_data).trim().replace(/\/W/gi, "");

                    if (query === "") {
                        await client.send("Users logged in:\r\n- root\r\n");
                        await client.close();
                        return;
                    }

                    let info = "Login: root \t\t\t Name: Unknown\r\n";
                    info += `Directory: /home \t\t Shell: ${shell ? shell.name : "None"}\r\n\r\n`;

                    if (await fs.exists("/home/.project")) {
                        const project = await fs.read_file("/home/.project") as string;
                        info += `\r\nProject:\r\n${project}\r\n`;
                    } else {
                        info += "No project.\r\n";
                    }

                    if (await fs.exists("/home/.plan")) {
                        const plan = await fs.read_file("/home/.plan") as string;
                        info += `\r\nPlan:\r\n${plan}\r\n`;
                    } else {
                        info += "No plan.\r\n";
                    }

                    await client.send(info);
                    await client.close();
                });
            });
        };

        const net_manager = kernel.get_network_manager();

        // start immediately if network already up
        if (await net_manager.is_up()) {
            await start_server();
        }

        // react to networking coming up (initially or after a later failure)
        process.network_add_manager_listener("state_change", (is_up) => {
            if (is_up) {
                start_server();
            }
        });

        process.detach();

        return 0;
    }
} as Program;
