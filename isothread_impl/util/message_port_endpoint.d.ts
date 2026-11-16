import { RPCEndpoint } from "../../kernel/rpc";
export declare const endpoint_from_message_port: <Outgoing, Incoming>(port: MessagePort) => RPCEndpoint<Outgoing, Incoming>;
