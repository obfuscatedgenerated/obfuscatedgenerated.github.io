/**
 * One side of an RPC connection. Incoming messages are untrusted and must be validated by the receiver.
 */
export interface RPCEndpoint<Outgoing, Incoming> {
    send(message: Outgoing): void;

    /** @returns A function that stops listening. */
    listen(receiver: (message: Incoming) => void): () => void;
}

export const endpoint_from_message_port = <Outgoing, Incoming>(port: MessagePort): RPCEndpoint<Outgoing, Incoming> => ({
    send: (message) => port.postMessage(message),
    listen: (receiver) => {
        const handler = (event: MessageEvent) => receiver(event.data as Incoming);
        port.addEventListener("message", handler);
        port.start();

        return () => port.removeEventListener("message", handler);
    },
});
