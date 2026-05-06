import type {PrivilegedProgram} from "../../types";
import {AbstractTerminal, KeyEvent} from "../../kernel/term_ctl";
import {UserspaceClientSocket} from "../../kernel/network";

interface SSHMessageBase {
    type: string;
}

interface KEXInitMessage extends SSHMessageBase {
    type: "KEXINIT";
    kex_algorithms: string[];
    server_host_key_algorithms: string[];
    encryption_algorithms_client_to_server: string[];
    encryption_algorithms_server_to_client: string[];
    mac_algorithms_client_to_server?: string[];
    mac_algorithms_server_to_client?: string[];
    compression_algorithms_client_to_server?: string[];
    compression_algorithms_server_to_client?: string[];
    language_client_to_server?: string[];
    language_server_to_client?: string[];
    first_kex_packet_follows?: boolean;
}

interface NewKeysMessage extends SSHMessageBase {
    type: "NEWKEYS";
}

interface KEXECDHInitMessage extends SSHMessageBase {
    type: "KEXECDH_INIT";
    client_public_key: Uint8Array;
}

interface KEXECDHReplyMessage extends SSHMessageBase {
    type: "KEXECDH_REPLY";
    host_key: Uint8Array;
    server_public_key: Uint8Array;
    signature: Uint8Array;
}

type SSHMessage = KEXInitMessage | NewKeysMessage | KEXECDHInitMessage | KEXECDHReplyMessage;
type SSHMessageType = SSHMessage["type"];

class SSHWriter {
    #buffer: number[] = [];

    write_byte(value: number) {
        this.#buffer.push(value);
    }

    write_bytes(value: Uint8Array) {
        this.#buffer.push(...value);
    }

    write_uint32(value: number) {
        const b = new Uint8Array(4);
        new DataView(b.buffer).setUint32(0, value);
        this.#buffer.push(...b);
    }

    write_string(value: string | Uint8Array) {
        const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
        this.write_uint32(bytes.length);
        this.#buffer.push(...bytes);
    }

    write_name_list(list: string[]) {
        this.write_string(list.join(","));
    }

    write_mpint(value: Uint8Array) {
        // skip all leading zeros
        let i = 0;
        while (i < value.length - 1 && value[i] === 0) {
            i++;
        }

        const trimmed = value.slice(i);

        // if the first byte has the high bit set, we need one leading zero back
        if ((trimmed[0] & 0x80) !== 0) {
            this.write_uint32(trimmed.length + 1);
            this.write_byte(0);
        } else {
            this.write_uint32(trimmed.length);
        }
        this.write_bytes(trimmed);
    }

    to_uint8_array(): Uint8Array {
        return new Uint8Array(this.#buffer);
    }
}

class SSHReader {
    #buffer: Uint8Array;
    #offset = 0;

    constructor(data: Uint8Array) {
        this.#buffer = data;
    }

    read_byte(): number {
        return this.#buffer[this.#offset++];
    }

    read_bytes(length: number): Uint8Array {
        const bytes = this.#buffer.slice(this.#offset, this.#offset + length);
        this.#offset += length;
        return bytes;
    }

    read_uint32(): number {
        const value = new DataView(
            this.#buffer.buffer,
            this.#buffer.byteOffset + this.#offset,
            4
        ).getUint32(0, false); // false for big-endian

        this.#offset += 4;
        return value;
    }

    read_string(): string {
        const length = this.read_uint32();
        const bytes = this.read_bytes(length);
        return new TextDecoder().decode(bytes);
    }

    read_name_list(): string[] {
        const str = this.read_string();
        return str ? str.split(",") : [];
    }
}

const random_bytes = (length: number): Uint8Array => {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    return bytes;
}

const MESSAGE_IDS: Record<SSHMessageType, number> = {
    "KEXINIT": 20,
    "NEWKEYS": 21,
    "KEXECDH_INIT": 30,
    "KEXECDH_REPLY": 31
};

const message_serialisers: Partial<Record<SSHMessageType, (writer: SSHWriter, message: SSHMessage) => void>> = {
    "KEXINIT": (writer, message: KEXInitMessage) => {
        writer.write_byte(MESSAGE_IDS[message.type]); // SSH_MSG_KEXINIT
        writer.write_bytes(random_bytes(16)); // cookie
        writer.write_name_list(message.kex_algorithms);
        writer.write_name_list(message.server_host_key_algorithms);
        writer.write_name_list(message.encryption_algorithms_client_to_server);
        writer.write_name_list(message.encryption_algorithms_server_to_client);
        writer.write_name_list(message.mac_algorithms_client_to_server || []);
        writer.write_name_list(message.mac_algorithms_server_to_client || []);
        writer.write_name_list(message.compression_algorithms_client_to_server || ["none"]);
        writer.write_name_list(message.compression_algorithms_server_to_client || ["none"]);
        writer.write_name_list(message.language_client_to_server || []);
        writer.write_name_list(message.language_server_to_client || []);
        writer.write_byte(message.first_kex_packet_follows ? 1 : 0);
        writer.write_uint32(0); // reserved
    },
    "NEWKEYS": (writer, message: NewKeysMessage) => {
        writer.write_byte(MESSAGE_IDS[message.type]); // SSH_MSG_NEWKEYS
    },
    "KEXECDH_REPLY": (writer, message: KEXECDHReplyMessage) => {
        writer.write_byte(MESSAGE_IDS[message.type]); // SSH_MSG_KEXECDH_REPLY
        writer.write_string(message.host_key);
        writer.write_string(message.server_public_key);
        writer.write_string(message.signature);
    }
};

const message_deserialisers: Record<number, (reader: SSHReader) => SSHMessage> = {
    [MESSAGE_IDS.KEXINIT]: (reader) => {
        // consume cookie. yummy!
        reader.read_bytes(16);

        const kex_algorithms = reader.read_name_list();
        const server_host_key_algorithms = reader.read_name_list();
        const encryption_algorithms_client_to_server = reader.read_name_list();
        const encryption_algorithms_server_to_client = reader.read_name_list();
        const mac_algorithms_client_to_server = reader.read_name_list();
        const mac_algorithms_server_to_client = reader.read_name_list();
        const compression_algorithms_client_to_server = reader.read_name_list();
        const compression_algorithms_server_to_client = reader.read_name_list();
        const language_client_to_server = reader.read_name_list();
        const language_server_to_client = reader.read_name_list();
        const first_kex_packet_follows = !!reader.read_byte();
        reader.read_uint32(); // reserved

        return {
            type: "KEXINIT",
            kex_algorithms,
            server_host_key_algorithms,
            encryption_algorithms_client_to_server,
            encryption_algorithms_server_to_client,
            mac_algorithms_client_to_server,
            mac_algorithms_server_to_client,
            compression_algorithms_client_to_server,
            compression_algorithms_server_to_client,
            language_client_to_server,
            language_server_to_client,
            first_kex_packet_follows
        };
    },
    [MESSAGE_IDS.KEXECDH_INIT]: (reader) => {
        const key_length = reader.read_uint32();
        const client_public_key = reader.read_bytes(key_length);
        return { type: "KEXECDH_INIT", client_public_key };
    },
};

const BLOCK_SIZE = 8;

const pad_ssh_message = (payload: Uint8Array): Uint8Array => {
    let padding = (BLOCK_SIZE - ((payload.length + 5) % BLOCK_SIZE)) || BLOCK_SIZE; // +5 for the packet length and padding length fields
    if (padding < 4) {
        padding += BLOCK_SIZE;
    }

    const packet_length = payload.length + padding + 1; // +1 for the padding length field

    const final_packet = new Uint8Array(4 + 1 + payload.length + padding);
    const view = new DataView(final_packet.buffer);
    view.setUint32(0, packet_length);
    final_packet[4] = padding;
    final_packet.set(payload, 5);
    final_packet.set(random_bytes(padding), 5 + payload.length);

    return final_packet;
}

const wrap_ssh_message = (message: SSHMessage): Uint8Array => {
    const writer = new SSHWriter();
    const serialiser = message_serialisers[message.type];

    if (!serialiser) {
        throw new Error(`No serialiser for message type ${message.type}`);
    }

    serialiser(writer, message);
    const payload = writer.to_uint8_array();

    return pad_ssh_message(payload);
}

const unpad_ssh_message = (data: Uint8Array): { payload: Uint8Array, remaining: Uint8Array } | null => {
    if (data.length < 5) {
        return null; // not enough data for packet length and padding length
    }

    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const packet_length = view.getUint32(0, false);
    const padding_length = data[4];

    if (data.length < 4 + packet_length) {
        return null; // not enough data for full packet
    }

    const payload = data.slice(5, 4 + packet_length - padding_length);
    const remaining = data.slice(4 + packet_length);

    return {payload, remaining};
}

const unwrap_ssh_message = (data: Uint8Array): { message: SSHMessage, remaining: Uint8Array } | null => {
    if (data.length < 5) {
        return null; // not enough data for packet length and padding length
    }

    const {payload, remaining} = unpad_ssh_message(data) || {};
    if (!payload) {
        return null; // not enough data for full packet
    }

    const message_type = payload[0];
    const deserialiser = message_deserialisers[message_type];

    if (!deserialiser) {
        throw new Error(`No deserialiser for message type ${message_type}`);
    }

    const reader = new SSHReader(payload.slice(1)); // skip message type byte
    const message = deserialiser(reader);

    return { message, remaining };
}

const wait_for_next_data = (socket: UserspaceClientSocket): Promise<Uint8Array> => {
    return new Promise((resolve) => {
        const on_data = (data: Uint8Array) => {
            socket.remove_event_listener("data", on_data);
            resolve(data);
        };

        socket.add_event_listener("data", on_data);
    });
}

const wait_for_next_ssh_message = async (socket: UserspaceClientSocket): Promise<{message: SSHMessage, raw: Uint8Array}> => {
    return new Promise((resolve) => {
        const on_message = (data: Uint8Array) => {
            const result = unwrap_ssh_message(data);
            if (result) {
                socket.remove_event_listener("data", on_message);
                resolve({ message: result.message, raw: data.slice(0, data.length - result.remaining.length) });
            }
        };

        socket.add_event_listener("data", on_message);
    });
}

const SERVER_BANNER = "SSH-2.0-OllieOS";

export default {
    name: "sshd",
    description: "SSH service",
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

        const start_server = async () => {
            const server = await process.network_listen(2222);
            server.add_event_listener("connection", async (socket) => {
                // recieve client banner
                const client_banner_data = await wait_for_next_data(socket);
                const client_banner = new TextDecoder().decode(client_banner_data);

                // send banner
                await socket.send(`${SERVER_BANNER}\r\n`);

                // for now generate a keypair on the fly for testing TODO persist
                const host_key_pair = await crypto.subtle.generateKey(
                    { name: "Ed25519" },
                    true,
                    ["sign", "verify"]
                );

                const host_public_key = new Uint8Array(await crypto.subtle.exportKey("raw", host_key_pair.publicKey));

                const host_key_blob_writer = new SSHWriter();
                host_key_blob_writer.write_string("ssh-ed25519");
                host_key_blob_writer.write_string(host_public_key);
                const host_key_blob = host_key_blob_writer.to_uint8_array();

                // send KEXINIT
                const kexinit_message: KEXInitMessage = {
                    type: "KEXINIT",
                    kex_algorithms: ["curve25519-sha256"],
                    server_host_key_algorithms: ["ssh-ed25519"],
                    encryption_algorithms_client_to_server: ["aes128-gcm@openssh.com"],
                    encryption_algorithms_server_to_client: ["aes128-gcm@openssh.com"]
                };
                const server_kexinit_raw = wrap_ssh_message(kexinit_message);
                await socket.send(server_kexinit_raw);

                // wait for client KEXINIT
                const client_kexinit = await wait_for_next_ssh_message(socket);
                if (client_kexinit.message.type !== "KEXINIT") {
                    socket.close();
                    return;
                }

                // wait for KEXECDH_INIT
                const kexecdh_init = await wait_for_next_ssh_message(socket);
                if (kexecdh_init.message.type !== "KEXECDH_INIT") {
                    socket.close();
                    return;
                }

                const client_public_key = kexecdh_init.message.client_public_key;

                const ephemeral_key_pair = await crypto.subtle.generateKey(
                    { name: "X25519" },
                    true,
                    ["deriveBits"]
                ) as CryptoKeyPair;

                const ephemeral_public_key = new Uint8Array(await crypto.subtle.exportKey("raw", ephemeral_key_pair.publicKey));

                // compute shared secret from client's public key and our ephemeral private key
                const imp_client_public_key = await crypto.subtle.importKey(
                    "raw",
                    new Uint8Array(client_public_key),
                    { name: "X25519" },
                    false,
                    []
                );
                const shared_secret = new Uint8Array(await crypto.subtle.deriveBits(
                    { name: "X25519", public: imp_client_public_key },
                    ephemeral_key_pair.privateKey,
                    256
                ));

                // compute exchange hash
                const hash_data = new SSHWriter();
                hash_data.write_string(client_banner.trim());
                hash_data.write_string(SERVER_BANNER);
                hash_data.write_string(unpad_ssh_message(client_kexinit.raw).payload);
                hash_data.write_string(unpad_ssh_message(server_kexinit_raw).payload);
                hash_data.write_string(host_key_blob);
                hash_data.write_string(client_public_key);
                hash_data.write_string(ephemeral_public_key);
                hash_data.write_mpint(shared_secret);

                const exchange_hash = new Uint8Array(await crypto.subtle.digest("SHA-256", hash_data.to_uint8_array() as Uint8Array<ArrayBuffer>));

                // sign the hash
                const signature_raw = new Uint8Array(await crypto.subtle.sign(
                    { name: "Ed25519" },
                    host_key_pair.privateKey,
                    exchange_hash
                ));

                const signature_blob_writer = new SSHWriter();
                signature_blob_writer.write_string("ssh-ed25519");
                signature_blob_writer.write_string(signature_raw);
                const signature_blob = signature_blob_writer.to_uint8_array();

                const kex_reply_message: KEXECDHReplyMessage = {
                    type: "KEXECDH_REPLY",
                    host_key: host_key_blob,
                    server_public_key: ephemeral_public_key,
                    signature: signature_blob
                };

                const kex_reply_raw = wrap_ssh_message(kex_reply_message);
                await socket.send(kex_reply_raw);

                // enter encrypted session
                await socket.send(wrap_ssh_message({type: "NEWKEYS"}));

                // TODO: actually handle the next steps

                // // spawn ash shell running with our virtual terminal
                // try {
                //     const spawn_result = kernel.spawn(
                //         "ash",
                //         ["--login"],
                //         // TODO: should prob change this to object args but will be annoying to change
                //         undefined,
                //         false,
                //         session_term
                //     );
                //
                //     spawn_result.process.kill(await spawn_result.completion);
                // } catch (e) {
                //     session_term.writeln(`${session_term.ansi.PREFABS.error}Failed to spawn shell: ${e.message}${session_term.ansi.STYLE.reset_all}`);
                // } finally {
                //     session_term.dispose();
                // }
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
} as PrivilegedProgram;
