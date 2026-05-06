import type {PrivilegedProgram} from "../../types";
import {AbstractTerminal, KeyEvent} from "../../kernel/term_ctl";
import {UserspaceClientSocket} from "../../kernel/network";
import {SpawnResult} from "../../kernel";

interface SSHMessageBase {
    type: string;
}

interface DisconnectMessage extends SSHMessageBase {
    type: "DISCONNECT";
    reason_code: number;
    description: string;
    language_tag: string;
}

interface ServiceRequestMessage extends SSHMessageBase {
    type: "SERVICE_REQUEST";
    service_name: string;
}

interface ServiceAcceptMessage extends SSHMessageBase {
    type: "SERVICE_ACCEPT";
    service_name: string;
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

interface UserAuthRequestMessageBase extends SSHMessageBase {
    type: "USERAUTH_REQUEST";
    username: string;
    service_name: string;
    method_name: string;
}

interface UserAuthRequestMessageNone extends UserAuthRequestMessageBase {
    method_name: "none";
}

interface UserAuthRequestMessagePassword extends UserAuthRequestMessageBase {
    method_name: "password";
    is_password_change_request: boolean;
    password: string;
}

interface UserAuthRequestMessagePublicKey extends UserAuthRequestMessageBase {
    method_name: "publickey";
    public_key_algorithm: string;
    public_key: Uint8Array;
    signature?: Uint8Array; // optional for initial request without signature
}

type UserAuthRequestMessage = UserAuthRequestMessageNone | UserAuthRequestMessagePublicKey | UserAuthRequestMessagePassword;

interface UserAuthFailureMessage extends SSHMessageBase {
    type: "USERAUTH_FAILURE";
    allowed_methods: string[];
    partial_success: boolean;
}

interface UserAuthSuccessMessage extends SSHMessageBase {
    type: "USERAUTH_SUCCESS";
}

interface UserAuthBannerMessage extends SSHMessageBase {
    type: "USERAUTH_BANNER";
    message: string;
}

type ChannelOpenType = "session" | "x11" | "direct-tcpip" | "forwarded-tcpip";
interface ChannelOpenMessage extends SSHMessageBase {
    type: "CHANNEL_OPEN";
    channel_type: ChannelOpenType;
    sender_channel: number;
    initial_window_size: number;
    maximum_packet_size: number;
}

interface ChannelOpenConfirmationMessage extends SSHMessageBase {
    type: "CHANNEL_OPEN_CONFIRMATION";
    recipient_channel: number;
    sender_channel: number;
    initial_window_size: number;
    maximum_packet_size: number;
}

interface ChannelOpenFailureMessage extends SSHMessageBase {
    type: "CHANNEL_OPEN_FAILURE";
    recipient_channel: number;
    reason_code: number;
    description: string;
    language_tag: string;
}

interface ChannelDataMessage extends SSHMessageBase {
    type: "CHANNEL_DATA";
    recipient_channel: number;
    data: Uint8Array;
}

type ChannelRequestType = "shell" | "pty-req" | "exec" | "subsystem" | "window-change" | "x11-req" | "env";
interface ChannelRequestMessage extends SSHMessageBase {
    type: "CHANNEL_REQUEST";
    recipient_channel: number;
    request_type: ChannelRequestType;
    want_reply: boolean;
}

interface ChannelSuccessMessage extends SSHMessageBase {
    type: "CHANNEL_SUCCESS";
    recipient_channel: number;
}

interface ChannelFailureMessage extends SSHMessageBase {
    type: "CHANNEL_FAILURE";
    recipient_channel: number;
}

type SSHMessage =
    DisconnectMessage |
    ServiceRequestMessage | ServiceAcceptMessage |
    KEXInitMessage |
    NewKeysMessage |
    KEXECDHInitMessage | KEXECDHReplyMessage
    | UserAuthRequestMessage | UserAuthFailureMessage | UserAuthSuccessMessage | UserAuthBannerMessage
    | ChannelOpenMessage | ChannelOpenConfirmationMessage | ChannelOpenFailureMessage |
    ChannelRequestMessage | ChannelSuccessMessage | ChannelFailureMessage |
    ChannelDataMessage;

type SSHMessageType = SSHMessage["type"];

class MessageWriter {
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

class MessageReader {
    #buffer: Uint8Array;
    #offset = 0;

    get remaining_length() {
        return this.#buffer.length - this.#offset;
    }

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
    "DISCONNECT": 1,
    //"IGNORE": 2,
    //"UNIMPLEMENTED": 3,
    //"DEBUG": 4,
    "SERVICE_REQUEST": 5,
    "SERVICE_ACCEPT": 6,
    "KEXINIT": 20,
    "NEWKEYS": 21,
    "KEXECDH_INIT": 30,
    "KEXECDH_REPLY": 31,
    "USERAUTH_REQUEST": 50,
    "USERAUTH_FAILURE": 51,
    "USERAUTH_SUCCESS": 52,
    "USERAUTH_BANNER": 53,
    "CHANNEL_OPEN": 90,
    "CHANNEL_OPEN_CONFIRMATION": 91,
    "CHANNEL_OPEN_FAILURE": 92,
    "CHANNEL_DATA": 94,
    "CHANNEL_REQUEST": 98,
    "CHANNEL_SUCCESS": 99,
    "CHANNEL_FAILURE": 100
};

const message_serialisers: Partial<Record<SSHMessageType, (writer: MessageWriter, message: SSHMessage) => void>> = {
    "SERVICE_ACCEPT": (writer, message: ServiceAcceptMessage) => {
        writer.write_byte(MESSAGE_IDS[message.type]); // SSH_MSG_SERVICE_ACCEPT
        writer.write_string(message.service_name);
    },
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
    },
    "USERAUTH_FAILURE": (writer, message: UserAuthFailureMessage) => {
        writer.write_byte(MESSAGE_IDS[message.type]); // SSH_MSG_USERAUTH_FAILURE
        writer.write_name_list(message.allowed_methods);
        writer.write_byte(message.partial_success ? 1 : 0);
    },
    "USERAUTH_SUCCESS": (writer, message: UserAuthSuccessMessage) => {
        writer.write_byte(MESSAGE_IDS[message.type]); // SSH_MSG_USERAUTH_SUCCESS
    },
    "USERAUTH_BANNER": (writer, message: UserAuthBannerMessage) => {
        writer.write_byte(MESSAGE_IDS[message.type]); // SSH_MSG_USERAUTH_BANNER
        writer.write_string(message.message);
        writer.write_string(""); // language tag, not supported
    },
    "CHANNEL_OPEN_CONFIRMATION": (writer, message: ChannelOpenConfirmationMessage) => {
        writer.write_byte(MESSAGE_IDS[message.type]); // SSH_MSG_CHANNEL_OPEN_CONFIRMATION
        writer.write_uint32(message.recipient_channel);
        writer.write_uint32(message.sender_channel);
        writer.write_uint32(message.initial_window_size);
        writer.write_uint32(message.maximum_packet_size);
    },
    "CHANNEL_OPEN_FAILURE": (writer, message: ChannelOpenFailureMessage) => {
        writer.write_byte(MESSAGE_IDS[message.type]); // SSH_MSG_CHANNEL_OPEN_FAILURE
        writer.write_uint32(message.recipient_channel);
        writer.write_uint32(message.reason_code);
        writer.write_string(message.description);
        writer.write_string(message.language_tag);
    },
    "CHANNEL_DATA": (writer, message: ChannelDataMessage) => {
        writer.write_byte(MESSAGE_IDS[message.type]); // SSH_MSG_CHANNEL_DATA
        writer.write_uint32(message.recipient_channel);
        writer.write_string(message.data);
    },
    "CHANNEL_SUCCESS": (writer, message: ChannelSuccessMessage) => {
        writer.write_byte(MESSAGE_IDS[message.type]); // SSH_MSG_CHANNEL_SUCCESS
        writer.write_uint32(message.recipient_channel);
    },
    "CHANNEL_FAILURE": (writer, message: ChannelFailureMessage) => {
        writer.write_byte(MESSAGE_IDS[message.type]); // SSH_MSG_CHANNEL_FAILURE
        writer.write_uint32(message.recipient_channel);
    }
};

const message_deserialisers: Record<number, (reader: MessageReader) => SSHMessage> = {
    [MESSAGE_IDS.DISCONNECT]: (reader) => {
        const reason_code = reader.read_uint32();
        const description = reader.read_string();
        const language_tag = reader.read_string();
        return { type: "DISCONNECT", reason_code, description, language_tag };
    },
    [MESSAGE_IDS.SERVICE_REQUEST]: (reader) => {
        const service_name = reader.read_string();
        return { type: "SERVICE_REQUEST", service_name };
    },
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
    [MESSAGE_IDS.NEWKEYS]: (reader) => {
        return { type: "NEWKEYS" };
    },
    [MESSAGE_IDS.USERAUTH_REQUEST]: (reader) => {
        const username = reader.read_string();
        const service_name = reader.read_string();
        const method_name = reader.read_string();

        if (method_name === "password") {
            const is_password_change_request = !!reader.read_byte();
            const password = reader.read_string();
            return { type: "USERAUTH_REQUEST", username, service_name, method_name, is_password_change_request, password } as UserAuthRequestMessagePassword;
        } else if (method_name === "publickey") {
            const public_key_algorithm = reader.read_string();
            const key_length = reader.read_uint32();
            const public_key = reader.read_bytes(key_length);
            let signature: Uint8Array | undefined;

            // check if there's a signature present (there may not be in the initial request)
            if (reader.remaining_length > 0) {
                const sig_length = reader.read_uint32();
                signature = reader.read_bytes(sig_length);
            }

            return { type: "USERAUTH_REQUEST", username, service_name, method_name, public_key_algorithm, public_key, signature } as UserAuthRequestMessagePublicKey;
        } else {
            // unsupported auth method
            return { type: "USERAUTH_REQUEST", username, service_name, method_name } as UserAuthRequestMessage;
        }
    },
    [MESSAGE_IDS.CHANNEL_OPEN]: (reader) => {
        const channel_type = reader.read_string() as ChannelOpenType;
        const sender_channel = reader.read_uint32();
        const initial_window_size = reader.read_uint32();
        const maximum_packet_size = reader.read_uint32();
        return { type: "CHANNEL_OPEN", channel_type, sender_channel, initial_window_size, maximum_packet_size };
    },
    [MESSAGE_IDS.CHANNEL_REQUEST]: (reader) => {
        const recipient_channel = reader.read_uint32();
        const request_type = reader.read_string() as ChannelRequestType;
        const want_reply = !!reader.read_byte();
        return { type: "CHANNEL_REQUEST", recipient_channel, request_type, want_reply };
    },
    [MESSAGE_IDS.CHANNEL_DATA]: (reader) => {
        const recipient_channel = reader.read_uint32();
        const data_length = reader.read_uint32();
        const data = reader.read_bytes(data_length);
        return { type: "CHANNEL_DATA", recipient_channel, data };
    }
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

const serialise_ssh_message = (message: SSHMessage): Uint8Array | null => {
    const writer = new MessageWriter();
    const serialiser = message_serialisers[message.type];

    if (!serialiser) {
        return null;
    }

    serialiser(writer, message);
    return writer.to_uint8_array();
}

const wrap_ssh_message = (message: SSHMessage): Uint8Array => {
    return pad_ssh_message(serialise_ssh_message(message));
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

const deserialise_ssh_message = (payload: Uint8Array): SSHMessage | null => {
    const message_type = payload[0];
    const deserialiser = message_deserialisers[message_type];

    if (!deserialiser) {
        return null;
    }

    const reader = new MessageReader(payload.slice(1)); // skip message type byte
    return deserialiser(reader);
}

const unwrap_ssh_message = (data: Uint8Array): { message: SSHMessage, remaining: Uint8Array } | null => {
    if (data.length < 5) {
        return null; // not enough data for packet length and padding length
    }

    const {payload, remaining} = unpad_ssh_message(data) || {};
    if (!payload) {
        return null; // not enough data for full packet
    }

    const message = deserialise_ssh_message(payload);
    return { message, remaining };
}

// TODO: add bufferring to these wait funcs (local to each socket ofc)

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
            if (result && result.message) {
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

                const host_key_blob_writer = new MessageWriter();
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
                const hash_data = new MessageWriter();
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

                const signature_blob_writer = new MessageWriter();
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

                // derive nonces and keys (A - D)
                const derive_key = async (letter: string, length: number) => {
                    const key_data = new MessageWriter();
                    key_data.write_mpint(shared_secret);
                    key_data.write_bytes(exchange_hash);
                    key_data.write_byte(letter.charCodeAt(0));
                    key_data.write_bytes(exchange_hash);

                    const full_key = new Uint8Array(await crypto.subtle.digest("SHA-256", key_data.to_uint8_array() as Uint8Array<ArrayBuffer>));

                    if (full_key.length >= length) {
                        return full_key.slice(0, length);
                    }

                    // if the hash isn't long enough, we need to hash again with the previous hash as extra data until we have enough key material
                    let result = full_key;
                    while (result.length < length) {
                        const extra_data = new MessageWriter();
                        extra_data.write_mpint(shared_secret);
                        extra_data.write_bytes(exchange_hash);
                        extra_data.write_byte(letter.charCodeAt(0));
                        extra_data.write_bytes(result);

                        const next_hash = new Uint8Array(await crypto.subtle.digest("SHA-256", extra_data.to_uint8_array() as Uint8Array<ArrayBuffer>));
                        result = new Uint8Array([...result, ...next_hash]);
                    }

                    return result.slice(0, length);
                };

                const cryptographic_keys = {
                    client_to_server_iv: await derive_key("A", 12),
                    server_to_client_iv: await derive_key("B", 12),
                    client_to_server_key: await derive_key("C", 16),
                    server_to_client_key: await derive_key("D", 16),
                };

                const client_to_server = await crypto.subtle.importKey(
                    "raw",
                    cryptographic_keys.client_to_server_key,
                    { name: "AES-GCM" },
                    false,
                    ["decrypt"]
                );

                const server_to_client = await crypto.subtle.importKey(
                    "raw",
                    cryptographic_keys.server_to_client_key,
                    { name: "AES-GCM" },
                    false,
                    ["encrypt"]
                );

                let client_sequence_number = 0n;
                let server_sequence_number = 0n;

                const decrypt_payload = async (msg_data: Uint8Array): Promise<Uint8Array> => {
                    // 4 byte length in plaintext aad
                    const aad = msg_data.slice(0, 4);
                    const packet_length = new DataView(aad.buffer, aad.byteOffset, 4).getUint32(0, false);

                    const nonce = new Uint8Array(12);
                    nonce.set(cryptographic_keys.client_to_server_iv);
                    const nonce_view = new DataView(nonce.buffer, nonce.byteOffset, nonce.byteLength);
                    const nonce_suffix = nonce_view.getBigUint64(4, false);
                    nonce_view.setBigUint64(4, nonce_suffix + client_sequence_number, false);

                    // decrypt the packet
                    const decrypted = new Uint8Array(await crypto.subtle.decrypt(
                        { name: "AES-GCM", iv: nonce, additionalData: aad, tagLength: 128 },
                        client_to_server,
                        msg_data.slice(4, 4 + packet_length + 16) // +16 for GCM tag
                    ));

                    client_sequence_number++;

                    // extract padding and payload
                    const padding_length = decrypted[0];
                    const payload = decrypted.slice(1, decrypted.length - padding_length);

                    return payload;
                }

                const encrypt_message = async (message: SSHMessage): Promise<Uint8Array> => {
                    const payload = serialise_ssh_message(message);

                    let padding_len = 16 - ((1 + payload.length) % 16);
                    if (padding_len < 4) {
                        padding_len += 16;
                    }

                    const padding = random_bytes(padding_len);

                    // build packet of padding length, payload, and padding
                    const plaintext = new Uint8Array(1 + payload.length + padding.length);
                    plaintext[0] = padding_len;
                    plaintext.set(payload, 1);
                    plaintext.set(padding, 1 + payload.length);

                    const nonce = new Uint8Array(12);
                    nonce.set(cryptographic_keys.server_to_client_iv);
                    const nonce_view = new DataView(nonce.buffer, nonce.byteOffset, nonce.byteLength);
                    const nonce_suffix = nonce_view.getBigUint64(4, false);
                    nonce_view.setBigUint64(4, nonce_suffix + server_sequence_number, false);

                    // build aad (4 byte length prefix)
                    const aad = new Uint8Array(4);
                    const aad_view = new DataView(aad.buffer);
                    aad_view.setUint32(0, plaintext.length, false);

                    // encrypt packet
                    const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
                        { name: "AES-GCM", iv: nonce, additionalData: aad, tagLength: 128 },
                        server_to_client,
                        plaintext
                    ));

                    // prepend length
                    const final_packet = new Uint8Array(4 + ciphertext.length);
                    const view = new DataView(final_packet.buffer);
                    view.setUint32(0, plaintext.length, false);
                    final_packet.set(ciphertext, 4);

                    return final_packet;
                }

                // must strictly follow sequencing
                let send_lock = Promise.resolve();
                const send_encrypted_message_atomic = async (message: SSHMessage): Promise<void> => {
                    send_lock = send_lock.then(async () => {
                        const msg_data = await encrypt_message(message);
                        await socket.send(msg_data);
                        server_sequence_number++;
                    });

                    return send_lock;
                }

                // TODO: could just pass key dict rather than defining new funcs

                // enter encrypted session
                let client_newkeys: SSHMessage;
                await Promise.all([socket.send(wrap_ssh_message({type: "NEWKEYS"})), (async () => client_newkeys = (await wait_for_next_ssh_message(socket)).message)()]);

                if (client_newkeys.type !== "NEWKEYS") {
                    socket.close();
                    return;
                }

                class SSHTerminal extends AbstractTerminal {
                    #x = 0;
                    #y = 0;

                    #cols = 80;
                    #rows = 24;

                    input_enabled = true;

                    #channel_id: number;

                    get cursor_x() {
                        return this.#x;
                    }

                    get cursor_y() {
                        return this.#y;
                    }

                    get rows() {
                        return this.#rows;
                    }

                    get cols() {
                        return this.#cols;
                    }

                    constructor(channel_id: number) {
                        super();
                        this.#channel_id = channel_id;
                        this.resume_input_processing();
                    }

                    write(msg_data: string | Uint8Array, callback?: () => void) {
                        const text = typeof msg_data === "string" ? msg_data : new TextDecoder().decode(msg_data);
                        const newline_fmt = text.replaceAll("\n", "\r\n");
                        const data_msg: ChannelDataMessage = {
                            type: "CHANNEL_DATA",
                            recipient_channel: this.#channel_id,
                            data: new TextEncoder().encode(newline_fmt)
                        };

                        send_encrypted_message_atomic(data_msg).then(callback);
                    }

                    writeln(msg_data: string | Uint8Array, callback?: () => void) {
                        const text = typeof msg_data === "string" ? msg_data : new TextDecoder().decode(msg_data);
                        const newline_fmt = text.replaceAll("\n", "\r\n") + "\r\n";
                        const data_msg: ChannelDataMessage = {
                            type: "CHANNEL_DATA",
                            recipient_channel: this.#channel_id,
                            data: new TextEncoder().encode(newline_fmt)
                        };

                        send_encrypted_message_atomic(data_msg).then(callback);
                    }

                    focus() {
                        // noop
                    }

                    dispose() {
                        this.pause_input_processing();
                        socket.close();
                    }

                    #on_socket_data = (msg_data: Uint8Array) => {
                        const text = new TextDecoder().decode(msg_data);
                        this._simulate_typing(text);
                    }

                    // resume_input_processing() {
                    //     socket.add_event_listener("data", this.#on_socket_data);
                    // }
                    //
                    // pause_input_processing() {
                    //     socket.remove_event_listener("data", this.#on_socket_data);
                    // }

                    // TODO: implement
                    resume_input_processing() {
                        // noop
                    }

                    pause_input_processing() {
                        // noop
                    }

                    // protected async _read_raw_key(): Promise<KeyEvent> {
                    //     return new Promise((resolve) => {
                    //         const once = (msg_data: Uint8Array) => {
                    //             this.socket.remove_event_listener("data", once);
                    //             resolve({
                    //                 key: new TextDecoder().decode(msg_data),
                    //                 domEvent: {} as KeyboardEvent // TODO: dom event translation. or should this be removed from keyEvent entirely? i remember the same problem for node
                    //             });
                    //         };
                    //
                    //         this.socket.add_event_listener("data", once);
                    //     });
                    // }

                    // TODO: implement
                    protected async _read_raw_key(): Promise<KeyEvent> {
                        // NOOP
                        return new Promise(() => {
                            return {
                                key: "",
                                domEvent: {} as KeyboardEvent
                            }
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

                const channels: Map<number, {
                    window_size: number;
                    max_packet_size: number;
                    terminal?: SSHTerminal
                    shell?: SpawnResult
                }> = new Map();

                // handle messages bufferred
                const handle_message = async (message: SSHMessage) => {
                    console.table(message);

                    switch (message.type) {
                        case "DISCONNECT": {
                            console.log(`Client disconnected: ${message.description} (reason code ${message.reason_code})`);
                            socket.close();
                            return;
                        }
                        case "SERVICE_REQUEST": {
                            if (message.service_name !== "ssh-userauth") {
                                socket.close();
                                return;
                            }

                            const service_accept_message: SSHMessage = {
                                type: "SERVICE_ACCEPT",
                                service_name: "ssh-userauth"
                            };

                            await send_encrypted_message_atomic(service_accept_message);
                            break;
                        }
                        case "USERAUTH_REQUEST": {
                            // it will request with none, send a failure with allowed methods, then it will send again with the chosen method
                            if (message.method_name === "none") {
                                const failure_message: UserAuthFailureMessage = {
                                    type: "USERAUTH_FAILURE",
                                    allowed_methods: ["password", "publickey"],
                                    partial_success: false
                                };

                                await send_encrypted_message_atomic(failure_message);
                            } else if (message.method_name === "password") {
                                if (message.is_password_change_request) {
                                    // not allowed
                                    const failure_message: UserAuthFailureMessage = {
                                        type: "USERAUTH_FAILURE",
                                        allowed_methods: ["password", "publickey"],
                                        partial_success: false
                                    };

                                    await send_encrypted_message_atomic(failure_message);
                                    return;
                                }

                                console.log("Received password auth request for user", message.username, "with password", message.password);

                                // for now we dont have passwords lol! the password is just password for testing
                                const success = message.password === "password";

                                const response_message: SSHMessage = success ? {
                                    type: "USERAUTH_SUCCESS"
                                } : {
                                    type: "USERAUTH_FAILURE",
                                    allowed_methods: ["password", "publickey"],
                                    partial_success: false
                                };

                                await send_encrypted_message_atomic(response_message);
                            } else if (message.method_name === "publickey") {
                                console.log("Received publickey auth request for user", message.username);
                            }
                            break;
                        }
                        case "CHANNEL_OPEN": {
                            if (message.channel_type !== "session") {
                                const failure_message: ChannelOpenFailureMessage = {
                                    type: "CHANNEL_OPEN_FAILURE",
                                    recipient_channel: message.sender_channel,
                                    reason_code: 1, // SSH_OPEN_ADMINISTRATIVELY_PROHIBITED
                                    description: "Only session channels are supported",
                                    language_tag: ""
                                };

                                await send_encrypted_message_atomic(failure_message);
                                return;
                            }

                            // for simplicity, use the client ids on our side
                            channels.set(message.sender_channel, {
                                window_size: message.initial_window_size,
                                max_packet_size: message.maximum_packet_size,
                            });

                            const confirmation_message: ChannelOpenConfirmationMessage = {
                                type: "CHANNEL_OPEN_CONFIRMATION",
                                recipient_channel: message.sender_channel,
                                sender_channel: message.sender_channel,
                                initial_window_size: 1024 * 1024, // 1MB
                                maximum_packet_size: 32768 // 32KB
                            };

                            await send_encrypted_message_atomic(confirmation_message);
                            break;
                        }
                        case "CHANNEL_REQUEST": {
                            const channel = channels.get(message.recipient_channel);
                            if (!channel) {
                                // invalid channel, ignore

                                if (message.want_reply) {
                                    const failure_message: ChannelFailureMessage = {
                                        type: "CHANNEL_FAILURE",
                                        recipient_channel: message.recipient_channel
                                    };

                                    await send_encrypted_message_atomic(failure_message);
                                }

                                return;
                            }

                            if (message.request_type === "pty-req") {
                                if (channel.terminal) {
                                    // already has a terminal, can't open another
                                    if (message.want_reply) {
                                        const failure_message: ChannelFailureMessage = {
                                            type: "CHANNEL_FAILURE",
                                            recipient_channel: message.recipient_channel
                                        };

                                        await send_encrypted_message_atomic(failure_message);
                                    }

                                    return;
                                }

                                channel.terminal = new SSHTerminal(message.recipient_channel);

                                if (message.want_reply) {
                                    const success_message: ChannelSuccessMessage = {
                                        type: "CHANNEL_SUCCESS",
                                        recipient_channel: message.recipient_channel
                                    };

                                    await send_encrypted_message_atomic(success_message);
                                }
                            } else if (message.request_type === "shell") {
                                if (!channel.terminal) {
                                    // no terminal, can't start shell
                                    if (message.want_reply) {
                                        const failure_message: ChannelFailureMessage = {
                                            type: "CHANNEL_FAILURE",
                                            recipient_channel: message.recipient_channel
                                        };

                                        await send_encrypted_message_atomic(failure_message);
                                    }

                                    return;
                                }

                                if (channel.shell) {
                                    // already has a shell, can't open another
                                    if (message.want_reply) {
                                        const failure_message: ChannelFailureMessage = {
                                            type: "CHANNEL_FAILURE",
                                            recipient_channel: message.recipient_channel
                                        };

                                        await send_encrypted_message_atomic(failure_message);
                                    }

                                    return;
                                }

                                channel.shell = kernel.spawn(
                                    "ash",
                                    ["--login"],
                                    undefined,
                                    false,
                                    channel.terminal
                                );

                                if (message.want_reply) {
                                    const success_message: ChannelSuccessMessage = {
                                        type: "CHANNEL_SUCCESS",
                                        recipient_channel: message.recipient_channel
                                    };

                                    await send_encrypted_message_atomic(success_message);
                                }
                            } else {
                                // unsupported request type, ignore
                                if (message.want_reply) {
                                    const failure_message: ChannelFailureMessage = {
                                        type: "CHANNEL_FAILURE",
                                        recipient_channel: message.recipient_channel
                                    };

                                    await send_encrypted_message_atomic(failure_message);
                                }
                            }
                        }
                    }
                }

                // TODO: move this buffer to handle the handshake too?
                let incoming_buffer = new Uint8Array(0);
                let is_consuming = false

                socket.add_event_listener("data", async (msg_data) => {
                    const new_buffer = new Uint8Array(incoming_buffer.length + msg_data.length);
                    new_buffer.set(incoming_buffer, 0);
                    new_buffer.set(msg_data, incoming_buffer.length);
                    incoming_buffer = new_buffer;

                    if (is_consuming) {
                        // be careful not to consume in parallel, the next iteration will see the new data anyway
                        return;
                    }

                    is_consuming = true;

                    try {
                        while (incoming_buffer.length >= 4) {
                            // get packet length from first 4 bytes
                            const view = new DataView(incoming_buffer.buffer, incoming_buffer.byteOffset, incoming_buffer.byteLength);
                            const packet_length = view.getUint32(0, false);

                            if (incoming_buffer.length < 4 + packet_length + 16) { // +16 for GCM tag
                                break; // wait for more data
                            }

                            const encrypted_packet = incoming_buffer.slice(0, 4 + packet_length + 16);
                            incoming_buffer = incoming_buffer.slice(4 + packet_length + 16);

                            try {
                                const payload = await decrypt_payload(encrypted_packet);
                                const message = deserialise_ssh_message(payload);

                                if (!message) {
                                    console.log(`Received unknown SSH message with type ${payload[0]}`);
                                    continue;
                                }

                                await handle_message(message);
                            } catch (e) {
                                console.error("Failed to decrypt or handle SSH message:", e);
                                socket.close();
                                return;
                            }
                        }
                    } finally {
                        is_consuming = false;
                    }
                });

                socket.add_event_listener("close", () => {
                    // close every shell and terminal
                    channels.forEach((channel) => {
                        channel.shell?.process.kill();
                        channel.terminal?.dispose();
                    });
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
} as PrivilegedProgram;
