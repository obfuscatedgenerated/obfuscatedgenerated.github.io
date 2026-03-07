import type {Program} from "../types";

export default {
    name: "finger",
    description: "Displays information about a user on a remote system.",
    usage_suffix: "<username>@<hostname>",
    arg_descriptions: {
        "<username>@<hostname>": "The username and hostname of the user to query. For example, ollieg@happynetbox.com"
    },
    compat: "2.0.0",
    completion: async () => [],
    main: async (data) => {
        // extract from data to make code less verbose
        const {term, process, kernel, args} = data;

        if (args.length !== 1) {
            term.writeln(`${term.ansi.PREFABS.error}Invalid number of arguments. Usage: finger <username>@<hostname>${term.ansi.STYLE.reset_all}`);
            return 1;
        }

        const [user, host] = args[0].split("@");
        if (!user || !host) {
            term.writeln(`${term.ansi.PREFABS.error}Invalid argument format. Usage: finger <username>@<hostname>${term.ansi.STYLE.reset_all}`);
            return 1;
        }

        if (!kernel.has_network_manager()) {
            term.writeln(`${term.ansi.PREFABS.error}No network manager found. This program requires a network manager to function.${term.ansi.STYLE.reset_all}`);
            return 1;
        }

        const net_manager = kernel.get_network_manager();
        if (!await net_manager.is_up(true)) {
            term.writeln(`${term.ansi.PREFABS.error}Network is down!${term.ansi.STYLE.reset_all}`);
            return 1;
        }

        const socket = await process.network_connect(host, 79);
        if (!socket) {
            term.writeln(`${term.ansi.PREFABS.error}Failed to connect to ${host}:79${term.ansi.STYLE.reset_all}`);
            return 1;
        }

        socket.add_event_listener("data", term.write.bind(term));
        socket.send(`${user}\r\n`);

        // wait until connection is closed
        await new Promise<void>((resolve) => {
            socket.add_event_listener("close", resolve);
        });

        return 0;
    }
} as Program;
