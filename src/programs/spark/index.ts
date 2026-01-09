import {ANSI} from "../../term_ctl";
import type {Program} from "../../types";
import {helper_completion_options} from "../core/ash/tab_completion";

import {service_subcommand} from "./service";
import {reload_services_subcommand} from "./reload_services";

// extract from ANSI to make code less verbose
const {STYLE, PREFABS} = ANSI;


export default {
    name: "spark",
    description: "Manage your system with ignition.",
    usage_suffix: "[-h] [subcommand] [arguments]",
    arg_descriptions: {
        "Subcommands:": {
            "service": "Manage running services.",
            "reload-services": "Reload the service definition files.",
        },
        "Arguments:": {
            "-h": "Displays this help message.",
            "For service:": {
                "action": "The action to perform (start, stop, restart, status).",
                "service_id": "The ID of the service to manage.",
            },
        }
    },
    completion: async (data) => {
        // TODO: smarter completion that understands flags for subcommands
        switch (data.arg_index) {
            case 0:
                return helper_completion_options(["service"])(data);
        }

        return [];
    },
    main: async (data) => {
        // extract from data to make code less verbose
        const {args, term, kernel, shell} = data;

        if (args.length === 0) {
            term.writeln(`${PREFABS.error}Missing subcommand.`)
            term.writeln(`Try 'spark -h' for more information.${STYLE.reset_all}`);
            return 1;
        }

        if (args.includes("-h")) {
            return await kernel.spawn("help", ["spark"], shell).completion;
        }

        switch (args[0]) {
            case "service":
                return await service_subcommand(data);
            case "reload-services":
                return await reload_services_subcommand(data);
            default:
                term.writeln(`${PREFABS.error}Invalid subcommand.`);
                term.writeln(`Try 'spark -h' for more information.${STYLE.reset_all}`);
                return 1;
        }

        return 0;
    }
} as Program;