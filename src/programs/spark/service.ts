import {ANSI, NEWLINE} from "../../term_ctl";
import {ProgramMainData} from "../../types"

import type {IgnitionIPCReply} from "../core/ignition";
import type {ServiceStatus} from "../core/ignition/services";

// extract from ANSI to make code less verbose
const {STYLE, FG, PREFABS} = ANSI;

export const service_subcommand = async (data: ProgramMainData) => {
    // extract from data to make code less verbose
    const {args, term, process, kernel} = data;

    // remove subcommand name
    args.shift();

    if (args.length === 0) {
        term.writeln(`${PREFABS.error}Missing action.`);
        term.writeln(`Try 'spark -h' for more information.${STYLE.reset_all}`);
        return 1;
    }

    if (args.length === 1) {
        term.writeln(`${PREFABS.error}Missing service ID.`);
        term.writeln(`Try 'spark -h' for more information.${STYLE.reset_all}`);
        return 1;
    }

    const action = args[0];
    const service_id = args[1];

    // open ipc with ignition
    const ipc = kernel.get_ipc();
    const channel_id = ipc.create_channel(process.pid, "init");

    if (!channel_id) {
        term.writeln(`${PREFABS.error}Failed to communicate with ignition.${STYLE.reset_all}`);
        return 1;
    }

    // function can be defined to handle response data, string responses and errors handled by default
    let on_data: (msg_data: unknown) => void;
    let reply_timeout: number;
    let return_code = 0;

    // listen for replies
    ipc.channel_listen(channel_id, process.pid, async (msg) => {
        const payload = msg.data as IgnitionIPCReply;

        if (payload.type === "data") {
            if (on_data) {
                on_data(payload.data);
            } else {
                term.writeln(`${FG.yellow}Warning: Unhandled data response: ${JSON.stringify(payload.data)}${STYLE.reset_all}`);
            }
        } else if (payload.type === "response") {
            term.writeln(`${FG.green}${payload.message}${STYLE.reset_all}`);
        } else if (payload.type === "error") {
            term.writeln(`${PREFABS.error}${payload.message}${STYLE.reset_all}`);
            return_code = 1;
        }

        if (reply_timeout) {
            process.cancel_timeout(reply_timeout);
        }
    });

    if (action === "status") {
        // special handler for status data
        on_data = (msg_data: unknown) => {
            const status = msg_data as ServiceStatus;

            term.write(NEWLINE);
            term.writeln(`${FG.cyan}Service ID:${STYLE.reset_all} ${service_id}`);

            term.write(`${FG.cyan}Status: ${STYLE.reset_all}`);
            switch (status.state) {
                case "running":
                    term.writeln(`${FG.green}Running${STYLE.reset_all}`);
                    term.writeln(`${FG.cyan}PID:${STYLE.reset_all} ${status.pid}`);
                    break;
                case "stopped":
                    term.writeln(`${FG.yellow}Stopped${STYLE.reset_all}`);
                    break;
                case "failed":
                    term.writeln(`${FG.red}Failed${STYLE.reset_all}`);
                    break;
            }
        }
    }

    // wait up to 3 seconds for a reply before erroring
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    reply_timeout = process.create_timeout(() => {}, 3000);

    // can just send the action and service id directly rather than needing additional checking as the action matches the ipc action names
    ipc.channel_send(channel_id, process.pid, {
        type: "service",
        action,
        service_id
    });

    if (!process.has_timeout(reply_timeout)) {
        // timeout already cleared, meaning we got a response
        return return_code;
    }

    const got_no_reply = await process.wait_for_timeout(reply_timeout);

    if (got_no_reply) {
        term.writeln(`${PREFABS.error}No response from ignition.${STYLE.reset_all}`);
        return 2;
    }

    // TODO: all this logic is kinda jank, trying to be too clever with timeouts and async ipc

    return return_code;
}
