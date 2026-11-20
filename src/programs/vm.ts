import type { Program } from "../types";
import {ANSI, NEWLINE} from "../lib/ansi";
import {helper_completion_options} from "./core/ash/tab_completion";

// extract from ANSI to make code less verbose
const {STYLE, PREFABS, FG} = ANSI;

const SUBCOMMANDS = ["run", "list", "rm"];

const format_date = (iso: string | null): string => iso === null ? "never" : new Date(iso).toLocaleString();

export default {
    name: "vm",
    description: "Runs virtual machines in this terminal, each with its own disk, running the same programs as this system.",
    usage_suffix: "[subcommand] [name]",
    arg_descriptions: {
        "Subcommands:": {
            "run": `Boots the machine on a disk, creating the disk if it doesn't exist: ${PREFABS.program_name}vm${STYLE.reset_all + STYLE.italic} run <name>${STYLE.reset_all}`,
            "list": `Lists the disks: ${PREFABS.program_name}vm${STYLE.reset_all + STYLE.italic} list${STYLE.reset_all}`,
            "rm": `Deletes a disk and everything on it: ${PREFABS.program_name}vm${STYLE.reset_all + STYLE.italic} rm <name>${STYLE.reset_all}`,
        },
    },
    compat: "3.0.0",
    completion: async (data) => {
        if (data.arg_index === 0) {
            return helper_completion_options(SUBCOMMANDS)(data);
        }

        return [];
    },
    main: async (data) => {
        const { kernel, term, args } = data;

        const [subcommand, name] = args;

        if (!SUBCOMMANDS.includes(subcommand)) {
            term.writeln(`${PREFABS.error}Expected a subcommand: ${SUBCOMMANDS.join(", ")}. See 'help vm'.${STYLE.reset_all}`);
            return 1;
        }

        if (subcommand !== "list" && (name === undefined || args.length !== 2)) {
            term.writeln(`${PREFABS.error}Expected a disk name: vm ${subcommand} <name>${STYLE.reset_all}`);
            return 1;
        }

        try {
            switch (subcommand) {
                case "list": {
                    const disks = await kernel.list_disks();
                    if (disks.length === 0) {
                        term.writeln("No disks yet. Create one with 'vm run <name>'.");
                        return 0;
                    }

                    for (const disk of disks) {
                        const status = disk.running ? ` ${FG.green}(running)${STYLE.reset_all}` : "";
                        term.writeln(`${STYLE.bold}${disk.name}${STYLE.reset_all}${status}`);
                        term.writeln(`  ${FG.gray}last booted: ${format_date(disk.last_booted_at)}${disk.os_version ? ` on v${disk.os_version}` : ""}, created: ${format_date(disk.created_at)}${STYLE.reset_all}`);
                    }

                    return 0;
                }

                case "rm": {
                    if (!(await kernel.delete_disk(name))) {
                        term.writeln(`${PREFABS.error}No disk named '${name}'.${STYLE.reset_all}`);
                        return 1;
                    }

                    term.writeln(`Deleted disk '${name}'.`);
                    return 0;
                }

                case "run": {
                    term.writeln(`Starting virtual machine on disk '${name}'...`);
                    term.writeln(`${FG.gray}Press Ctrl+] to force it off.${STYLE.reset_all}`);

                    const guest = await kernel.create_guest({disk: name, install: "host"});

                    // reboots from inside the guest are handled by the hypervisor, so this only ends on a power off or a panic
                    const end_reason = await guest.run({
                        on_boot: (boot_number) => {
                            if (boot_number > 1) {
                                term.writeln("Virtual machine rebooting...");
                            }
                        },
                    });

                    if (end_reason.kind === "panic") {
                        term.writeln(`${PREFABS.error}Virtual machine panicked: ${end_reason.message}${NEWLINE}${end_reason.debug_info ?? ""}${STYLE.reset_all}`);
                        return 1;
                    }

                    term.writeln("Virtual machine powered off.");
                    return 0;
                }
            }
        } catch (e) {
            // errors cross from the kernel by name
            if (e instanceof Error && ["NotAllowedError", "InUseError", "TypeError"].includes(e.name)) {
                term.writeln(`${PREFABS.error}${e.name === "NotAllowedError" ? "Permission denied: " : ""}${e.message}${STYLE.reset_all}`);
                return 1;
            }

            throw e;
        }

        return 1;
    }
} satisfies Program;
