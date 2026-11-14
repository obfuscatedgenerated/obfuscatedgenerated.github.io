import {endpoint_from_message_port} from "../util/message_port_endpoint";
import {run_program} from "../util/run_program";
import type {ProgramEndpoint} from "../../kernel/rpc/shim";
import type {RPCKernelToProgramMessage, RPCProgramToKernelMessage} from "../../kernel/rpc/protocol";
import {serialise_error} from "../../kernel/rpc/marshal";
import type {ThreadEntry} from "../../kernel/isothreads";

// local functions only exist where the module defining them was imported, so every module that calls define_local must be imported here
import "../../lib/ansi";
import "../../lib/capabilities";
import "../../lib/path";
import "../../lib/timers";

interface WorkerStartMessage {
    source: string;
    source_url: string;
    entry: ThreadEntry;
}

self.addEventListener("message", (event: MessageEvent<WorkerStartMessage>) => {
    const port = event.ports[0];
    if (!port) {
        return;
    }

    const endpoint: ProgramEndpoint = endpoint_from_message_port<RPCProgramToKernelMessage, RPCKernelToProgramMessage>(port);

    // refuse to run unless actually isolated from the os origin (opaque origins report "null")
    if (self.origin !== "null") {
        const error = new Error(`Isothread worker is not isolated (origin ${self.origin}), refusing to run`);
        endpoint.send({type: "exit", exit_code: 1, error: serialise_error(error)});
        return;
    }

    // programs don't get to spawn their own workers, threads must go through the kernel
    Reflect.deleteProperty(self, "Worker");
    Reflect.deleteProperty(self, "SharedWorker");
    // TODO: could attempt to polyfill with thread sections later

    const {source, source_url, entry} = event.data;
    run_program(endpoint, source, source_url, entry);
}, {once: true});

// TODO: could block net access and force use of net manager for fetching?
