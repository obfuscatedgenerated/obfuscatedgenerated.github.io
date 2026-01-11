import {ANSI} from "../../term_ctl";
import {ProgramMainData} from "../../types"

import type {IgnitionIPCReply} from "../core/ignition";

// extract from ANSI to make code less verbose
const {STYLE, FG, PREFABS} = ANSI;

export const reload_services_subcommand = async (data: ProgramMainData) => {
    // extract from data to make code less verbose
    const {args, term, process, kernel} = data;

    // remove subcommand name
    args.shift();

    // TODO: make function to do this back and forth with ignition rather than duplicating code for each subcommand

    // open ipc with ignition
    const ipc = kernel.get_ipc();
    const channel_id = ipc.create_channel("init");

    if (!channel_id) {
        term.writeln(`${PREFABS.error}Failed to communicate with ignition.${STYLE.reset_all}`);
        return 1;
    }

    let reply_timeout: number;
    let return_code = 0;

    // listen for replies
    ipc.channel_listen(channel_id, async (msg) => {
        const payload = msg.data as IgnitionIPCReply;

        if (payload.type === "response") {
            term.writeln(`${FG.green}${payload.message}${STYLE.reset_all}`);
        } else if (payload.type === "error") {
            term.writeln(`${PREFABS.error}${payload.message}${STYLE.reset_all}`);
            return_code = 1;
        }

        if (reply_timeout) {
            process.cancel_timeout(reply_timeout);
        }
    });

    // wait up to 3 seconds for a reply before erroring
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    reply_timeout = process.create_timeout(() => {}, 3000);

    ipc.channel_send(channel_id, {
        type: "reload_services"
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
