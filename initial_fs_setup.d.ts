import { AbstractFileSystem } from "./kernel/filesystem";
import { Program } from "./types";
/**
 * Sets up what any OllieOS system needs to boot and run its programs: /boot/init, /etc/boot_target, program icons, and /bin from the given builtins.
 * @param builtin_programs The builtins to describe in /bin, or null to leave /bin alone (e.g. when its files are copied from elsewhere, as for a guest).
 */
export declare const base_fs_setup: (fs: AbstractFileSystem, builtin_programs: Record<string, Program> | null) => Promise<void>;
/**
 * Sets up the content of the portfolio site: the motd, credits, and the projects from the data repository (which needs the network).
 */
export declare const portfolio_fs_setup: (fs: AbstractFileSystem) => Promise<void>;
/**
 * Sets up the whole system as the site runs it: the base system, then the portfolio content.
 */
export declare const initial_fs_setup: (fs: AbstractFileSystem, builtin_programs: Record<string, Program>) => Promise<void>;
