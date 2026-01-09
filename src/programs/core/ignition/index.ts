import type { Program } from "../../../types";

import {ServiceManager} from "./services";
import type {ProcessContext} from "../../../processes";

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
        const { kernel, term, process } = data;

        // check if ignition is already running (only allowed to be PID 1)
        if (process.pid !== 1) {
            term.writeln("Cannot run ignition.");
            return 1;
        }

        const fs = kernel.get_fs();

        // determine boot target from /etc/boot_target
        let boot_target = "jetty";
        let boot_args: string[] = [];

        try {
            const boot_target_data = await fs.read_file("/etc/boot_target") as string;
            boot_target = boot_target_data.trim();
        } catch (e) {
            term.writeln("Warning: /etc/boot_target not found, defaulting to 'jetty' target!");

            // wait 3 seconds
            await new Promise((resolve) => setTimeout(resolve, 3000));
        }

        if (!boot_target) {
            term.writeln("Warning: /etc/boot_target is empty, defaulting to 'jetty' target!");

            // wait 3 seconds
            await new Promise((resolve) => setTimeout(resolve, 3000));
        }

        // separate args if any
        const boot_target_parts = boot_target.split(" ");
        boot_target = boot_target_parts[0];

        if (boot_target_parts.length > 1) {
            boot_args = boot_target_parts.slice(1);
        }

        // create service manager
        const svc_mgr = new ServiceManager(kernel);

        // load service files but don't start them yet
        await svc_mgr.load_service_files();

        // open and handle ipc communication
        const ipc = kernel.get_ipc();

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

        let running = true;
        let final_code = 0;
        let current_tty_process: ProcessContext;

        // on exit, force boot target to exit too
        // TODO: add process ownership to automatically kill child processes
        const proc_mgr = kernel.get_process_manager();
        process.add_exit_listener(async (exit_code) => {
            if (current_tty_process && proc_mgr.get_process(current_tty_process.pid)) {
                current_tty_process.kill(exit_code);
            }

            final_code = exit_code;
            running = false;
        });

        // start initial services
        svc_mgr.start_initial_services();

        // execute boot target in a respawn loop
        while (running) {
            const boot_target_proc = kernel.spawn(boot_target, boot_args);
            current_tty_process = boot_target_proc.process;

            const exit_code = await boot_target_proc.completion;
            console.log(`boot target ${boot_target} exited with code ${exit_code}`);

            // TODO: error recovery logic if boot target fails multiple times in a row
        }

        return final_code;
    }
} as Program;
