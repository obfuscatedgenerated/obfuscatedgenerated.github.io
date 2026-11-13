import {RPCEndpoint} from "../../kernel/rpc";

export const endpoint_from_message_port = <Outgoing, Incoming>(port: MessagePort): RPCEndpoint<Outgoing, Incoming> => ({
    send: (message) => port.postMessage(message),
    listen: (receiver) => {
        const handler = (event: MessageEvent) => receiver(event.data as Incoming);
        port.addEventListener("message", handler);
        port.start();

        return () => port.removeEventListener("message", handler);
    },
});
