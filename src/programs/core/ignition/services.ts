import type {Kernel, SpawnResult} from "../../../kernel";

const SERVICES_DIR = "/etc/services/";

interface ServiceRestartPolicyBase {
    on: "failure" | "always" | "never";
}

interface ServiceRestartPolicyWithRules extends ServiceRestartPolicyBase {
    on: "failure" | "always";
    max_retries?: number;
    delay_ms?: number;
}

type ServiceRestartPolicy = ServiceRestartPolicyBase | ServiceRestartPolicyWithRules;

interface ServiceFile {
    name?: string;
    dependencies?: string[];
    exec: string;
    args?: string[];
    oneshot?: boolean;
    restart?: ServiceRestartPolicy;
}

// TODO: support oneshot
// TODO: do something with name
// TODO: do something with max_retries

interface ServiceFileWithId extends ServiceFile {
    id: string;
}

const CLEAN_EXIT_CODES = new Set([0, 143]); // 0 = success, 143 = SIGTERM

interface ServiceStatusBase {
    state: "running" | "stopped" | "failed";
}

interface ServiceStatusNotRunning extends ServiceStatusBase {
    state: "stopped" | "failed";
}

interface ServiceStatusRunning extends ServiceStatusBase {
    state: "running";
    pid: number;
}

// TODO: store stop code for failed services
// TODO: store start time for running services

export type ServiceStatus = ServiceStatusRunning | ServiceStatusNotRunning;

export class ServiceManager {
    private readonly _kernel: Kernel;

    private readonly _service_files: Map<string, ServiceFileWithId> = new Map();
    private readonly _running_services: Map<string, SpawnResult> = new Map(); // service ID to spawn result
    private readonly _should_be_running_services: Set<string> = new Set();
    private readonly _failed_services: Set<string> = new Set();

    constructor(kernel: Kernel) {
        this._kernel = kernel;
    }

    async load_service_files() {
        const fs = this._kernel.get_fs();

        if (!await fs.exists(SERVICES_DIR)) {
            console.warn(`Services directory ${SERVICES_DIR} does not exist. Skipping service loading.`);
            return;
        }

        const service_files = await fs.list_dir(SERVICES_DIR);

        // load each service file
        for (const file_name of service_files) {
            if (file_name.endsWith(".service.json")) {
                const file_path = fs.join(SERVICES_DIR, file_name);
                const file_content = await fs.read_file(file_path) as string;

                try {
                    const service_data = JSON.parse(file_content) as ServiceFile;
                    const service_id = file_name.substring(0, file_name.length - ".service.json".length);

                    // TODO: validate service_data here

                    const service: ServiceFileWithId = {
                        id: service_id,
                        ...service_data
                    };

                    // add or update service file
                    this._service_files.set(service_id, service);
                } catch (e) {
                    console.error(`Failed to parse service file ${file_name}:`, e);
                }
            }
        }

        // remove any services that no longer exist
        for (const existing_service_id of this._service_files.keys()) {
            if (!service_files.includes(existing_service_id + ".service.json")) {
                this._service_files.delete(existing_service_id);
            }
        }
    }

    private _calculate_service_start_order(): string[] {
        const visited: Set<string> = new Set();
        const temp_mark: Set<string> = new Set();
        const result: string[] = [];

        const visit = (service_id: string) => {
            if (visited.has(service_id)) {
                return;
            }
            if (temp_mark.has(service_id)) {
                throw new Error(`Circular dependency detected involving service: ${service_id}`);
            }

            temp_mark.add(service_id);

            const service = this._service_files.get(service_id);
            if (service && service.dependencies) {
                for (const dep of service.dependencies) {
                    visit(dep);
                }
            }

            temp_mark.delete(service_id);
            visited.add(service_id);
            result.push(service_id);
        };

        for (const service_id of this._service_files.keys()) {
            visit(service_id);
        }

        return result;
    }

    start_initial_services() {
        const start_order = this._calculate_service_start_order();
        for (const service_id of start_order) {
            this.start_service(service_id);
        }
    }

    start_service(service_id: string) {
        // TODO: check dependencies are running

        if (this._running_services.has(service_id)) {
            console.warn(`Service ${service_id} is already running.`);
            return;
        }

        const service = this._service_files.get(service_id);
        if (!service) {
            console.error(`Service ${service_id} not found.`);
            return;
        }

        // mark service as should be running, so exit handlers know to restart it
        this._should_be_running_services.add(service_id);

        let spawn_result: SpawnResult;
        try {
            spawn_result = this._kernel.spawn(service.exec, service.args || []);
        } catch (e) {
            console.error(`Failed to start service ${service_id}:`, e);
            return;
        }

        this._running_services.set(service_id, spawn_result);
        this._failed_services.delete(service_id);

        const { process, completion } = spawn_result;

        // mark process as detached
        process.detach(true);

        // check for errors
        completion.catch((e) => {
            console.error(`Service ${service_id} encountered an error:`, e);
            this._running_services.delete(service_id);
            this._failed_services.add(service_id);
            this._handle_service_exit(service_id, -1);
        });

        // handle normal exit
        process.add_exit_listener((exit_code) => {
            this._running_services.delete(service_id);
            this._handle_service_exit(service_id, exit_code);
        });
    }

    stop_service(service_id: string) {
        if (!this._running_services.has(service_id)) {
            console.warn(`Service ${service_id} is not running.`);
            return;
        }

        const spawn_result = this._running_services.get(service_id);
        if (!spawn_result) {
            console.error(`Service ${service_id} spawn result not found.`);
            return;
        }

        const { process } = spawn_result;

        // mark service as should not be running
        this._should_be_running_services.delete(service_id);

        // send SIGTERM
        process.kill(143);

        // removal from running services will be handled in exit listener
    }

    restart_service(service_id: string) {
        this.stop_service(service_id);
        this.start_service(service_id); // TODO: will this conflict with the exit listener?
    }

    get_service_status(service_id: string): ServiceStatus | null {
        if (!this._service_files.has(service_id)) {
            return null;
        }

        if (this._running_services.has(service_id)) {
            const spawn_result = this._running_services.get(service_id);
            if (spawn_result) {
                return {
                    state: "running",
                    pid: spawn_result.process.pid
                };
            }
        } else {
            if (this._failed_services.has(service_id)) {
                return {
                    state: "failed"
                };
            } else {
                return {
                    state: "stopped"
                };
            }
        }
    }

    private _handle_service_exit(service_id: string, exit_code: number) {
        console.warn(`Service ${service_id} exited with code ${exit_code}.`);

        if (!this._should_be_running_services.has(service_id)) {
            return;
        }

        const service = this._service_files.get(service_id);
        if (!service) {
            return;
        }

        const restart_policy = service.restart;
        if (!restart_policy || restart_policy.on === "never") {
            return;
        }

        if (restart_policy.on === "always" || (restart_policy.on === "failure" && !CLEAN_EXIT_CODES.has(exit_code))) {
            console.log(`Restarting service ${service_id} as per restart policy.`);

            let delay_ms = 0;
            if ("delay_ms" in restart_policy && restart_policy.delay_ms) {
                delay_ms = restart_policy.delay_ms;
            }

            setTimeout(() => {
                this.start_service(service_id);
            }, delay_ms);
        }
    }
}
