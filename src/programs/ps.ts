import {ANSI, NEWLINE} from "../term_ctl";
import type { Program } from "../types";
import {helper_completion_options} from "./core/ash/tab_completion";

export default {
    name: "ps",
    description: "Display currently running processes.",
    usage_suffix: "[-p PID]",
    arg_descriptions: {
        "Arguments:": {
            "-p PID": "Display information about the process with the given PID. If omitted, displays all running processes."
        }
    },
    completion: async (data) => {
        console.log(data);
        if (data.arg_index === 0) {
            return helper_completion_options(["-p"])(data);
        } else if (data.arg_index === 1 && data.args[0] === "-p") {
            const pm = data.term.get_process_manager();
            const pids = pm.list_pids().map((pid) => pid.toString());
            return helper_completion_options(pids)(data);
        }

        return [];
    },
    main: async (data) => {
        // extract from data to make code less verbose
        const { term } = data;

        // extract from ANSI to make code less verbose
        const { STYLE, PREFABS } = ANSI;

        // get process manager
        const pm = term.get_process_manager();

        if (data.args[0] === "-p") {
            const pid = parseInt(data.args[1]);
            if (isNaN(pid)) {
                term.writeln(`${PREFABS.error}Invalid PID provided.${STYLE.reset_all}`);
                return 1;
            }

            const process = pm.get_process(pid);
            if (!process) {
                term.writeln(`${PREFABS.error}No process found with PID ${pid}.${STYLE.reset_all}`);
                return 1;
            }

            term.write(NEWLINE);
            term.writeln(`${STYLE.bold}PID:${STYLE.no_bold_or_dim} ${process.pid}${STYLE.reset_all}`);
            term.writeln(`${STYLE.bold}Command:${STYLE.no_bold_or_dim} ${process.source_command.command}${STYLE.reset_all}`);
            term.writeln(`${STYLE.bold}Created:${STYLE.no_bold_or_dim} ${process.created_at.toLocaleString()}${STYLE.reset_all}`);

            return 0;
        }

        const pids = pm.list_pids();

        // get longest source command length for formatting
        let longest_command_length = 7 // length of "COMMAND"
        for (const pid of pids) {
            const process = pm.get_process(pid)!;
            if (process.source_command.command.length > longest_command_length) {
                longest_command_length = process.source_command.command.length;
            }
        }

        const get_command_space = (subtract = 0) => " ".repeat(longest_command_length - subtract);

        term.write(NEWLINE);
        term.writeln(`${STYLE.bold}PID\tCOMMAND${get_command_space(7)}\t\tCREATED${STYLE.reset_all}`);
        for (const pid of pids) {
            const process = pm.get_process(pid)!;
            term.writeln(`${pid}\t${process.source_command.command}${get_command_space(process.source_command.command.length)}\t\t${process.created_at.toLocaleString()}`);
        }

        return 0;
    }
} as Program;
