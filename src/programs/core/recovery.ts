import type {PrivilegedProgram} from "../../types";

import {ANSI, NEWLINE} from "../../kernel/term_ctl";

export default {
    name: "recovery",
    description: "Emergency recovery environment",
    usage_suffix: "",
    arg_descriptions: {},
    hide_from_help: true,
    compat: "2.0.0",
    main: async (data) => {
        const { kernel, term } = data;

        const {CURSOR} = ANSI;

        if (!kernel.privileged) {
            term.writeln("Recovery requires privileged environment.");
            return 1;
        }

        let running = true;
        while (running) {
            term.reset();

            term.writeln("RECOVERY ENVIRONMENT");
            term.writeln("===================");
            term.write(NEWLINE);
            term.writeln("1. Reboot");
            term.writeln("2. Privileged ash shell");
            term.writeln("3. Reset bootloader and reboot");
            term.writeln("4. Wipe filesystem and reboot");
            term.write(NEWLINE);
            term.writeln("X: Exit recovery");
            term.write(NEWLINE);
            term.writeln("Press the corresponding key to select an option.");

            if (typeof window !== "undefined") {
                term.writeln(`Recovery also available at ${window.location.origin}/recover_fs`);
            }

            term.write(CURSOR.invisible);

            const key = await term.wait_for_keypress();

            switch (key.key.toLowerCase()) {
                case "1":
                    term.writeln(NEWLINE + "Rebooting...");
                    window.location.reload();
                    break;
                case "2": {
                    term.writeln(NEWLINE + "Starting privileged ash shell...");
                    term.write(CURSOR.visible);

                    // TODO: this doesnt make much difference being privileged as the programs are separate processes
                    // TODO: bypass the privilege agent instead
                    let exit_code: number;
                    const shell = kernel.spawn("ash", ["--no-scripts"], undefined, true);
                    try {
                        exit_code = await shell.completion;
                    } catch (e) {
                        exit_code = -1;
                        term.writeln("Error in privileged shell:");
                        term.writeln(e);
                    }

                    shell.process.kill(exit_code)
                }
                    break;
                case "3": {
                    term.writeln("Are you sure you want to reset the bootloader? This will clear your choice of init system, boot target, default shell, and privilege agent but retains your files.");
                    term.writeln("Press Y to confirm, or any other key to cancel.");

                    const confirm_key = await term.wait_for_keypress();
                    if (confirm_key.key.toLowerCase() !== "y") {
                        term.writeln("Bootloader reset cancelled.");
                        break;
                    }

                    term.writeln(NEWLINE + "Resetting bootloader...");

                    // delete /boot/init, /etc/boot_target, /etc/default_shell, /sys/privilege_agent
                    const fs = kernel.get_fs();
                    try {
                        await fs.delete_file("/boot/init");
                    } catch (e) {
                        term.writeln("Warning: Failed to delete /boot/init");
                        term.writeln(e);
                    }

                    try {
                        await fs.delete_file("/etc/boot_target");
                    } catch (e) {
                        term.writeln("Warning: Failed to delete /etc/boot_target");
                        term.writeln(e);
                    }

                    try {
                        await fs.delete_file("/etc/default_shell");
                    } catch (e) {
                        term.writeln("Warning: Failed to delete /etc/default_shell");
                        term.writeln(e);
                    }

                    try {
                        await fs.delete_file("/sys/privilege_agent");
                    } catch (e) {
                        term.writeln("Warning: Failed to delete /sys/privilege_agent");
                        term.writeln(e);
                    }

                    term.writeln("Rebooting...");
                    window.location.reload();
                }
                    break;
                case "4": {
                    term.writeln("Are you sure you want to erase the filesystem? This action cannot be undone.");
                    term.writeln("Press Y to confirm, or any other key to cancel.");

                    const confirm_key = await term.wait_for_keypress();
                    if (confirm_key.key.toLowerCase() !== "y") {
                        term.writeln("Filesystem wipe cancelled.");
                        break;
                    }

                    term.writeln(NEWLINE + "Wiping filesystem...");

                    const fs = kernel.get_fs();
                    try {
                        await fs.erase_all();
                    } catch (e) {
                        term.writeln("Error: Failed to wipe filesystem.");
                        term.writeln(e);
                    }

                    term.writeln("Rebooting...");
                    window.location.reload();
                }
                    break;
                case "x":
                    term.writeln(NEWLINE + "Exiting recovery.");
                    running = false;
                    break;
                default:
                    // ignore other keys
                    break;
            }
        }

        return 0;
    }
} as PrivilegedProgram;
