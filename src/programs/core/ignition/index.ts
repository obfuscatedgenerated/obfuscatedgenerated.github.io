import type { Program } from "../../../types";

import {recurse_mount_and_register_with_output} from "../../../prog_registry";
import {ServiceManager} from "./services";

interface IgnitionIPCMessageBase {
    type: string;
}

interface IgnitionIPCPowerMessage extends IgnitionIPCMessageBase {
    type: "power";
    action: "shutdown" | "reboot";
    hard?: boolean;
}

interface IgnitionIPCServiceMessage extends IgnitionIPCMessageBase {
    type: "service";
    action: "start" | "stop" | "restart" | "status";
    service_id: string;
}

interface IgnitionIPCReloadServicesMessage extends IgnitionIPCMessageBase {
    type: "reload_services";
}

export type IgnitionIPCMessage =
    IgnitionIPCPowerMessage |
    IgnitionIPCServiceMessage |
    IgnitionIPCReloadServicesMessage;

interface IgnitionIPCResponse extends IgnitionIPCMessageBase {
    type: "response";
    message: string;
}

interface IgnitionIPCDataResponse extends IgnitionIPCMessageBase {
    type: "data";
    data: unknown;
}

interface IgnitionIPCError extends IgnitionIPCMessageBase {
    type: "error";
    message: string;
}

export type IgnitionIPCReply =
    IgnitionIPCResponse |
    IgnitionIPCDataResponse |
    IgnitionIPCError;

// TODO: split ipc handling etc into files

export default {
    name: "ignition",
    description: "System init process",
    usage_suffix: "",
    arg_descriptions: {},
    hide_from_help: true,
    main: async (data) => {
        const { term, process } = data;

        // check if ignition is already running (only allowed to be PID 1)
        if (process.pid !== 1) {
            term.writeln("Cannot run ignition.");
            return 1;
        }

        // create service manager
        const svc_mgr = new ServiceManager(term);

        // load service files but don't start them yet
        await svc_mgr.load_service_files();

        // open and handle ipc communication
        const ipc = term.get_ipc();

        ipc.service_register("init", process.pid, async (channel_id) => {
            ipc.channel_listen(channel_id, process.pid, async (msg) => {
                const payload = msg.data as IgnitionIPCMessage;

                // TODO: clean up when it gets more complex

                switch (payload.type) {
                    case "reload_services": {
                        await svc_mgr.load_service_files();
                        ipc.channel_send(channel_id, process.pid, {
                            type: "response",
                            message: "Service files reloaded."
                        });
                        break;
                    }
                    case "service": {
                        const service_msg = payload as IgnitionIPCServiceMessage;
                        switch (service_msg.action) {
                            case "start": {
                                svc_mgr.start_service(service_msg.service_id);
                                ipc.channel_send(channel_id, process.pid, {
                                    type: "response",
                                    message: `Service ${service_msg.service_id} started.`
                                });
                                break;
                            }
                            case "stop": {
                                svc_mgr.stop_service(service_msg.service_id);
                                ipc.channel_send(channel_id, process.pid, {
                                    type: "response",
                                    message: `Service ${service_msg.service_id} stopped.`
                                });
                                break;
                            }
                            case "restart": {
                                svc_mgr.restart_service(service_msg.service_id);
                                ipc.channel_send(channel_id, process.pid, {
                                    type: "response",
                                    message: `Service ${service_msg.service_id} restarted.`
                                });
                                break;
                            }
                            case "status": {
                                const status = svc_mgr.get_service_status(service_msg.service_id);

                                if (!status) {
                                    ipc.channel_send(channel_id, process.pid, {
                                        type: "error",
                                        message: `Service ${service_msg.service_id} not found.`
                                    });
                                    break;
                                }

                                ipc.channel_send(channel_id, process.pid, {
                                    type: "data",
                                    data: status
                                });
                                break;
                            }
                            default:
                                ipc.channel_send(channel_id, process.pid, {
                                    type: "error",
                                    message: `Unknown service action: ${service_msg.action}`
                                });
                        }
                    }
                        break;
                    default:
                        ipc.channel_send(channel_id, process.pid, {
                            type: "error",
                            message: `Unknown message type: ${payload.type}`
                        });
                }
            });
        });

        process.add_exit_listener(async (exit_code) => {
            term.panic("ignition process exited unexpectedly!", `Exit code: ${exit_code}`);
        });

        // mount all programs in any subdirectory of /usr/bin
        // TODO: smarter system that has files to be mounted so any stray js files don't get mounted? or maybe it doesn't matter and is better mounting everything for hackability!
        const fs = term.get_fs();
        const usr_bin = fs.absolute("/usr/bin");
        if (await fs.exists(usr_bin)) {
            await recurse_mount_and_register_with_output(fs, usr_bin, term.get_program_registry(), term);
        }

        // start initial services
        svc_mgr.start_initial_services();

        // execute jetty, respawning it if it exits
        // TODO: move to spawn, not execute for cleaner control
        const run_jetty = async () => {
            await term.execute("jetty", true, async (exit_code) => {
                console.warn(`jetty exited with code ${exit_code}, respawning...`);

                // respawn jetty
                run_jetty();
            });
        }

        // await ONLY the first run of jetty
        await run_jetty();

        // TODO: when the shell is a distinct program, dont detach but instead block somehow instead
        process.detach(true);
        return 0;
    }
} as Program;
