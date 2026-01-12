import type { PrivilegedProgram } from "../../../types";

import {ServiceManager} from "./services";
import type {ProcessContext} from "../../../processes";

import {ANSI} from "../../../term_ctl";

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
    compat: "2.0.0",
    main: async (data) => {
        const { kernel, term, process } = data;

        const {CURSOR} = ANSI;

        // check if ignition is already running (only allowed to be PID 1)
        if (process.pid !== 1) {
            term.writeln("ignition can only be run as PID 1!");
            return 1;
        }

        // check for privileged environment
        if (!kernel.privileged) {
            term.writeln("ignition requires privileged environment!");
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

        let window_start: number | null = null;
        let deaths_in_window = 0;

        // execute boot target in a respawn loop
        while (running) {
            const boot_target_proc = kernel.spawn(boot_target, boot_args);
            current_tty_process = boot_target_proc.process;

            let exit_code: number;
            let error: Error | null = null;
            try {
                exit_code = await boot_target_proc.completion;
            } catch (e) {
                console.error(e);
                error = e as Error;
                exit_code = -1;
            }

            boot_target_proc.process.kill(exit_code);
            console.log(`boot target ${boot_target} exited with code ${exit_code}`);

            term.writeln(`Boot target ${boot_target} exited with code ${exit_code}!`);
            if (error) {
                term.writeln(`Error details: ${error}`);
            }

            const now = Date.now();
            if (!window_start || (now - window_start) > 10000) {
                window_start = now;
                deaths_in_window = 0;
            }

            deaths_in_window++;

            if (deaths_in_window >= 5) {
                term.writeln("Boot target has crashed too many times in a short period.");
                term.writeln("Press R key to enter recovery mode, or any other key to retry...");
                term.write(CURSOR.invisible);

                const key = await term.wait_for_keypress();
                if (key.key.toLowerCase() === "r") {
                    term.writeln("Entering recovery mode...");

                    const recovery_proc = kernel.spawn("recovery", [], undefined, true);
                    let recovery_exit_code: number;
                    try {
                        recovery_exit_code = await recovery_proc.completion;
                        recovery_proc.process.kill(recovery_exit_code);
                    } catch (e) {
                        console.error(e);
                        recovery_exit_code = -1;
                    }

                    term.writeln(`Recovery environment exited with code ${recovery_exit_code}. Retrying boot target...`);
                } else {
                    term.writeln("Retrying boot target...");
                }

                term.write(CURSOR.visible);

                deaths_in_window = 0;
                window_start = null;
            }

            // TODO: add recovery options
        }

        return final_code;
    }
} as PrivilegedProgram;

// TODO: implement graceful shutdown, stops programs, stops services in reverse order etc as well as move the actual final shutdown/reboot logic to kern`