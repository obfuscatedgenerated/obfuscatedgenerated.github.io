import type { Program } from "../types";
import {ANSI, NEWLINE} from "../lib/ansi";

export default {
    name: "vm_test",
    description: "Boots a test virtual machine in this terminal, running the same programs as this system. Press Ctrl+] to force it off.",
    usage_suffix: "",
    arg_descriptions: {},
    compat: "3.0.0",
    completion: async () => [],
    main: async (data) => {
        const { kernel, term } = data;

        term.writeln("Starting virtual machine...");

        let guest;
        try {
            guest = await kernel.create_guest({disk: "test", install: "host"});
        } catch (e) {
            if (e instanceof Error && e.name === "NotAllowedError") {
                term.writeln(`${ANSI.PREFABS.error}Permission denied.${ANSI.STYLE.reset_all}`);
                return 1;
            }

            throw e;
        }

        // reboots from inside the guest are handled by the hypervisor, so this only ends on a power off or a panic
        const end_reason = await guest.run({
            on_boot: (boot_number) => {
                if (boot_number > 1) {
                    term.writeln("Virtual machine rebooting...");
                }
            },
        });

        if (end_reason.kind === "panic") {
            term.writeln(`${ANSI.PREFABS.error}Virtual machine panicked: ${end_reason.message}${NEWLINE}${end_reason.debug_info ?? ""}${ANSI.STYLE.reset_all}`);
            return 1;
        }

        term.writeln("Virtual machine powered off.");
        return 0;
    }
} satisfies Program;
