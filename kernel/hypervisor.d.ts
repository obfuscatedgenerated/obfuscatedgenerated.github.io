import type { EndReason, Kernel } from "./index";
import { AbstractFileSystem, type UserspaceFileSystem } from "./filesystem";
import type { AbstractIsoThreadManager } from "./isothreads";
import type { ProcessContext } from "./processes";
import type { AbstractTerminal } from "./term_ctl";
import type { AbstractWindowManager } from "./windowing";
import type { AbstractNetworkManager } from "./network";
import type { AbstractPlatformAPI } from "./platform";
import { type sync_members } from "./rpc";
/**
 * What to put on a guest's disk before each boot:
 * - host (default): the base system (/boot/init etc) and a fresh copy of the host's programs, so the guest runs the same ones as the host
 * - none: the disk is left as it is, e.g. for a guest that was set up before or installs its own
 * - an image: the files of a directory on the host are copied onto the disk (over what is already there), optionally followed by the host's programs
 *
 * @group Userspace
 * @category Hypervisor
 */
export type GuestInstall = "host" | "none" | {
    image: string;
    host_programs?: boolean;
};
/**
 * What a guest is made of. Comes from userspace, so every field is checked.
 *
 * @group Userspace
 * @category Hypervisor
 */
export interface GuestSpec {
    /**
     * The name of the guest's disk, created if it doesn't exist. Disks are kept in the creating program's private storage, so each program has its own names, and the same name gives back the same disk next time.
     */
    disk: string;
    /**
     * What to put on the disk before each boot. Defaults to "host". An image is read with the creating program's own access, so it can't copy anything the program couldn't read.
     */
    install?: GuestInstall;
    /**
     * Guests always get a kernel of their own for now. Reserved for containers that share the host's kernel.
     */
    own_kernel?: true;
}
/**
 * How a guest's {@link UserspaceGuest.run} behaves.
 *
 * @group Userspace
 * @category Hypervisor
 */
export interface GuestRunOptions {
    /**
     * Called each time the guest boots: with 1 for the first boot, then again after each reboot.
     */
    on_boot?: (boot_number: number) => void;
    /**
     * Return a reboot from inside the guest instead of booting it again, e.g. to change something between boots. Calling run again then boots it again. Defaults to false.
     */
    return_on_reboot?: boolean;
}
/**
 * How the RPC layer accesses a guest's userspace proxy: nothing reads synchronously.
 * @hidden
 */
export declare const USERSPACE_GUEST_ANNOTATIONS: {};
/**
 * A guest kernel, as the program that created it sees it. It is tied to that program: when the program exits, the guest is powered off.
 *
 * @group Userspace
 * @category Hypervisor
 */
export interface UserspaceGuest {
    /** @hidden */
    readonly [sync_members]?: (member: never) => void;
    /**
     * Boots the guest, showing its console in the program's terminal, and resolves once it has ended.
     * A reboot from inside the guest boots it again on the same disk (unless return_on_reboot is set), so normally this only resolves for a power off or a panic.
     * Calling it while the guest is running returns the same run, and calling it after it has powered off or panicked returns how it ended.
     * Ctrl+] powers the guest off from outside, e.g. if it is stuck.
     */
    run(options?: GuestRunOptions): Promise<EndReason>;
    /**
     * Powers the guest off for good, resolving once it has fully stopped.
     */
    power_off(): Promise<void>;
    /**
     * Reboots the guest, as if it rebooted itself.
     */
    reboot(): Promise<void>;
}
/**
 * One of a program's disks, as listed by {@link UserspaceKernel.list_disks}.
 *
 * @group Userspace
 * @category Hypervisor
 */
export interface DiskInfo {
    name: string;
    /** ISO timestamps. */
    created_at: string;
    last_booted_at: string | null;
    /** The host's OS version when the disk was last booted. */
    os_version: string | null;
    /** Whether a guest is running on the disk right now. */
    running: boolean;
}
/**
 * Implementations to run a guest on instead of the defaults, for kernelspace callers (e.g. to test an implementation in a guest). Not available from userspace, as implementations can't cross into the kernel.
 * The factories are called for every boot, as a kernel only lives for one. Instances belong to the caller, who disposes them, and are reused across reboots.
 *
 * @group Kernel (Privileged)
 * @category Hypervisor
 */
export interface GuestDrivers {
    /**
     * Makes the guest's filesystem. Defaults to a {@link ScopedFileSystem} over the host's, rooted at the disk.
     */
    fs?: (host_fs: AbstractFileSystem, disk_path: string) => Promise<AbstractFileSystem>;
    /**
     * Makes the guest's terminal, given the console it should appear in. Defaults to a {@link BridgedTerminal} over the console, whose Ctrl+] calls power_off.
     */
    term?: (console: AbstractTerminal, power_off: () => void) => AbstractTerminal;
    /**
     * The isothread manager for the guest's programs. Defaults to a sibling of the host's (so the guest's programs are isolated and their pids can't collide), or none if the host has none.
     */
    isothread_manager?: AbstractIsoThreadManager;
    wm?: AbstractWindowManager;
    net_manager?: AbstractNetworkManager;
    platform?: AbstractPlatformAPI;
    /**
     * Runs after the install and before each boot, for setup a directory image can't express.
     */
    setup?: (disk: AbstractFileSystem) => Promise<void>;
}
type KernelOptions = ConstructorParameters<typeof Kernel>[0];
type CreateKernel = (options: KernelOptions) => Kernel;
interface DiskPaths {
    root: string;
    metadata: string;
}
type ResolvedInstall = {
    kind: "host";
} | {
    kind: "none";
} | {
    kind: "image";
    image: string;
    host_programs: boolean;
    reader: UserspaceFileSystem;
};
interface GuestOptions {
    disk: DiskPaths;
    install: ResolvedInstall;
    console: AbstractTerminal;
    drivers: GuestDrivers;
    owned_isothread_manager: AbstractIsoThreadManager | undefined;
    on_finished: () => void;
}
/**
 * A guest kernel and everything it runs on: a disk (a directory of the host's filesystem by default), a console shown in a host terminal, and isothreads of its own.
 * A reboot from inside boots a new kernel on the same disk, so one guest can span several kernels.
 *
 * @group Kernel (Privileged)
 * @category Hypervisor
 */
export declare class Guest {
    #private;
    /**
     * Kernel only. Guests are made by {@link Hypervisor.create}.
     * @hidden
     */
    constructor(host: Kernel, create_kernel: CreateKernel, options: GuestOptions);
    /**
     * Boots the guest and resolves once it has ended: for good (a power off or a panic), or for a reboot if return_on_reboot is set.
     * Calling it while the guest is running returns the same run, and calling it after it has ended for good returns how it ended.
     */
    run(options?: GuestRunOptions): Promise<EndReason>;
    /**
     * Powers the guest off for good, resolving once it has fully stopped. Safe to call at any time, including before it has run.
     */
    power_off(): Promise<void>;
    /**
     * Reboots the guest, as if it rebooted itself.
     */
    reboot(): Promise<void>;
    create_userspace_proxy(): UserspaceGuest;
}
/**
 * Runs guest kernels on behalf of processes. Each guest is owned by the process that created it, and is powered off when that process ends.
 *
 * @group Kernel (Privileged)
 * @category Hypervisor
 */
export declare class Hypervisor {
    #private;
    /**
     * Kernel only: the kernel makes its own.
     * @param create_kernel Constructs a guest kernel, so this module needs no runtime import of the kernel it belongs to.
     * @hidden
     */
    constructor(host: Kernel, create_kernel: CreateKernel);
    /**
     * Lists a process's disks, by name.
     * Rejects with a "NotAllowedError" for a process without private storage (see {@link Kernel.get_private_storage_path}).
     */
    list_disks(process: ProcessContext): Promise<DiskInfo[]>;
    /**
     * Deletes one of a process's disks and everything on it.
     * Rejects with a "NotAllowedError" for a process without private storage, or an "InUseError" if a guest is running on the disk.
     * @returns Whether there was a disk of that name to delete.
     */
    delete_disk(process: ProcessContext, name: string): Promise<boolean>;
    /**
     * Creates a guest for a process. It doesn't start until {@link Guest.run} is called.
     * Rejects with a "NotAllowedError" for a process without private storage to keep the disk in (see {@link Kernel.get_private_storage_path}).
     * @param drivers Implementations to use instead of the defaults. Only for kernelspace callers.
     */
    create(process: ProcessContext, spec: GuestSpec, drivers?: GuestDrivers): Promise<Guest>;
    /**
     * Powers off every guest, e.g. when the host kernel is disposed.
     */
    dispose(): void;
}
export {};
