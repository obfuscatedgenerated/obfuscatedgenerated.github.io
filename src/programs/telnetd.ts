import type { Program } from "../types";
import {AbstractTerminal, KeyEvent} from "../kernel/term_ctl";
import {UserspaceClientSocket} from "../kernel/network";

class TelnetTerminal extends AbstractTerminal {
    #x = 0;
    #y = 0;

    #socket: UserspaceClientSocket;

    input_enabled = true;

    get cursor_x() {
        return this.#x;
    }

    get cursor_y() {
        return this.#y;
    }

    get rows() {
        // TODO: negotiate using telnet messages
        return 24;
    }

    get cols() {
        // TODO: negotiate using telnet messages
        return 80;
    }

    constructor(socket: UserspaceClientSocket) {
        super();
        this.#socket = socket;
        this.resume_input_processing();
    }

    write(data: string | Uint8Array, callback?: () => void) {
        const text = typeof data === "string" ? data : new TextDecoder().decode(data);
        this.#socket.send(text.replaceAll("\n", "\r\n")).then(callback);
    }

    writeln(data: string | Uint8Array, callback?: () => void) {
        const text = typeof data === "string" ? data : new TextDecoder().decode(data);
        this.#socket.send(text.replaceAll("\n", "\r\n") + "\r\n").then(callback);
    }

    focus() {
        // noop
    }

    dispose() {
        this.pause_input_processing();
        this.#socket.close();
    }

    #on_socket_data = (data: Uint8Array) => {
        if (!this.input_enabled) {
            return;
        }

        // filter out telnet commands (starting with 0xFF) for now
        const filtered_data = new Uint8Array(data.length);
        let j = 0;
        for (let i = 0; i < data.length; i++) {
            if (data[i] === 0xFF) {
                i += 2; // skip the command and its option
            } else {
                filtered_data[j++] = data[i];
            }
        }
        const final_data = filtered_data.slice(0, j);

        const text = new TextDecoder().decode(final_data);
        this._simulate_typing(text);
    }

    resume_input_processing() {
        this.#socket.add_event_listener("data", this.#on_socket_data);
    }

    pause_input_processing() {
        this.#socket.remove_event_listener("data", this.#on_socket_data);
    }

    protected async _read_raw_key(): Promise<KeyEvent> {
        return new Promise((resolve) => {
            const once = (data: Uint8Array) => {
                this.#socket.remove_event_listener("data", once);
                resolve({
                    key: new TextDecoder().decode(data),
                    domEvent: {} as KeyboardEvent // TODO: dom event translation. or should this be removed from keyEvent entirely? i remember the same problem for node
                });
            };

            this.#socket.add_event_listener("data", once);
        });
    }

    clear() {
        this.write("\x1bc");
    }

    reset() {
        this.clear();
        this.#x = 0;
        this.#y = 0;
    }

    get_custom_flag(flag: string): any {
        return undefined;
    }

    set_custom_flag(flag: string, value: any) {
        // noop
    }

    supports_custom_flag(flag: string): boolean {
        return false;
    }

    get_selection(): string {
        return "";
    }

    has_selection(): boolean {
        return false;
    }

    clear_selection() {
        // noop
    }

    copy() {
        // noop
    }

    paste() {
        // noop
    }
}

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
        const { term, process, kernel: userspace_kernel } = data;

        if (!userspace_kernel.has_network_manager()) {
            term.writeln(`${term.ansi.PREFABS.error}No network manager found. This program requires a network manager to function.${term.ansi.STYLE.reset_all}`);
            return 1;
        }

        const net_manager = userspace_kernel.get_network_manager();
        if (!await net_manager.is_up(true)) {
            term.writeln(`${term.ansi.PREFABS.error}Network is down!${term.ansi.STYLE.reset_all}`);
            return 1;
        }

        // TODO: this will just run as an optional privileged service so wont be needed (once i figure out what privileged services will be) for now just running by hand
        const kernel = await userspace_kernel.request_privilege("To establish a virtual terminal for Telnet.");
        if (!kernel) {
            return 1;
        }

        const server = await process.network_listen(2323);
        server.add_event_listener("connection", async (socket) => {
            const session_term = new TelnetTerminal(socket);
            await socket.send(new Uint8Array([
                // i will echo
                255, 251, 1,

                // suppress go ahead
                255, 251, 3,

                // dont linemode
                255, 252, 34,
            ]));

            await socket.send("\r\nWelcome to the OllieOS Telnet service!\r\n\r\n");

            // spawn ash shell running with our virtual terminal
            try {
                const spawn_result = kernel.spawn(
                    "ash",
                    ["--login"],
                    // TODO: should prob change this to object args but will be annoying to change
                    undefined,
                    false,
                    session_term
                );

                await spawn_result.completion;
                spawn_result.process.kill();
            } catch (e) {
                session_term.writeln(`${session_term.ansi.PREFABS.error}Failed to spawn shell: ${e.message}${session_term.ansi.STYLE.reset_all}`);
                session_term.dispose();
            }
        });

        process.detach();
        return 0;
    }
} as Program;
