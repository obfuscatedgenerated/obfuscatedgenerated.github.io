import type {WrappedTerminal} from "../../../term_ctl";

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
    name: string;
    dependencies: string[];
    exec: string;
    oneshot?: boolean;
    restart?: ServiceRestartPolicy;
}

interface ServiceFileWithId extends ServiceFile {
    id: string;
}

export class ServiceManager {
    private readonly _term: WrappedTerminal;

    private readonly _service_files: Map<string, ServiceFileWithId> = new Map();
    private readonly _running_services: Map<string, number> = new Map(); // service ID to PID

    constructor(term: WrappedTerminal) {
        this._term = term;
    }

    async load_initial_service_files() {
        if (this._service_files.size > 0) {
            throw new Error("Initial service files have already been loaded.");
        }

        const fs = this._term.get_fs();

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

                    this._service_files.set(service_id, service);
                } catch (e) {
                    console.error(`Failed to parse service file ${file_name}:`, e);
                }
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
            if (service) {
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
        if (this._running_services.has(service_id)) {
            console.warn(`Service ${service_id} is already running.`);
            return;
        }

        const service = this._service_files.get(service_id);
        if (!service) {
            console.error(`Service ${service_id} not found.`);
            return;
        }

        // TODO: actually start the service process here
        console.log(`Starting service ${service_id} with exec: ${service.exec}`);
    }
}
