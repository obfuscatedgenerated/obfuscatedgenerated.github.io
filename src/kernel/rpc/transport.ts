/**
 * One side of an RPC connection. Incoming messages are untrusted and must be validated by the receiver.
 */
export interface RPCEndpoint<Outgoing, Incoming> {
    send(message: Outgoing): void;

    /** @returns A function that stops listening. */
    listen(receiver: (message: Incoming) => void): () => void;
}
