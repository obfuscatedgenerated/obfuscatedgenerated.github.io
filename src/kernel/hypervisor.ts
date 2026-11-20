import type {EndReason, Kernel} from "./index";
import {AbstractFileSystem, type UserspaceFileSystem} from "./filesystem";
import type {AbstractIsoThreadManager} from "./isothreads";
import type {ProcessContext} from "./processes";
import type {AbstractTerminal} from "./term_ctl";
import type {AbstractWindowManager} from "./windowing";
import type {AbstractNetworkManager} from "./network";
import type {AbstractPlatformAPI} from "./platform";
import {finalise_userspace_proxy, type sync_members} from "./rpc";
import {ScopedFileSystem} from "../fs_impl/scoped";
import {BridgedTerminal} from "../term_impl/bridged";
import {base_fs_setup} from "../initial_fs_setup";

/**
 * What to put on a guest's disk before each boot:
 * - host (default): the base system (/boot/init etc) and a fresh copy of the host's programs, so the guest runs the same ones as the host
 * - none: the disk is left as it is, e.g. for a guest that was set up before or installs its own
 * - an image: the files of a directory on the host are copied onto the disk (over what is already there), optionally followed by the host's programs
 *
 * @group Userspace
 * @category Hypervisor
 */
export type GuestInstall = "host" | "none" | {image: string, host_programs?: boolean};

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
export const USERSPACE_GUEST_ANNOTATIONS = {} as const;

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

// programs in an isothread can't instanceof errors, so they are told apart by name, which is what survives rpc
class NotAllowedError extends Error {
    constructor(reason: string) {
        super(`Request denied: ${reason}`);
        this.name = "NotAllowedError";
    }
}

// a fresh copy each boot, so the guest always has the host's current programs (and none the host no longer has)
const copy_host_programs = async (host_fs: AbstractFileSystem, disk: AbstractFileSystem) => {
    if (!(await disk.dir_exists("/bin"))) {
        await disk.make_dir("/bin");
    }

    const host_files = await host_fs.list_dir("/bin");
    for (const name of host_files) {
        await disk.write_file(`/bin/${name}`, await host_fs.read_file(`/bin/${name}`), true);
    }

    for (const name of await disk.list_dir("/bin")) {
        if (!host_files.includes(name)) {
            await disk.delete_file(`/bin/${name}`);
        }
    }
};

// read through the creating program's own view of the filesystem, so an image can't copy what the program couldn't read
const copy_image = async (source: Pick<UserspaceFileSystem, "list_dir" | "dir_exists" | "read_file">, source_dir: string, disk: AbstractFileSystem, disk_dir: string) => {
    if (!(await disk.dir_exists(disk_dir))) {
        await disk.make_dir(disk_dir);
    }

    for (const name of await source.list_dir(source_dir)) {
        const source_path = source_dir === "/" ? `/${name}` : `${source_dir}/${name}`;
        const disk_path = disk_dir === "/" ? `/${name}` : `${disk_dir}/${name}`;

        if (await source.dir_exists(source_path)) {
            await copy_image(source, source_path, disk, disk_path);
        } else {
            await disk.write_file(disk_path, await source.read_file(source_path, true), true);
        }
    }
};

// how a disk is laid out in a program's private storage: the guest only ever sees root, so it can't touch the metadata beside it
interface DiskPaths {
    root: string;
    metadata: string;
}

interface DiskMetadata {
    created_at: string;
    last_booted_at: string | null;
    os_version: string | null;
}

const read_disk_metadata = async (host_fs: AbstractFileSystem, metadata_path: string): Promise<DiskMetadata> => {
    if (await host_fs.exists(metadata_path)) {
        try {
            return JSON.parse(await host_fs.read_file(metadata_path) as string) as DiskMetadata;
        } catch (e) {
            console.warn(`Failed to read disk metadata at ${metadata_path}, starting it again:`, e);
        }
    }

    return {created_at: new Date().toISOString(), last_booted_at: null, os_version: null};
};

// what a guest's disk gets before each boot, resolved when the guest is created
type ResolvedInstall =
    | {kind: "host"}
    | {kind: "none"}
    | {kind: "image", image: string, host_programs: boolean, reader: UserspaceFileSystem};

interface GuestOptions {
    disk: DiskPaths;
    install: ResolvedInstall;
    console: AbstractTerminal;
    drivers: GuestDrivers;

    // made by the hypervisor for this guest, so it disposes it when the guest is done
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
export class Guest {
    readonly #host: Kernel;
    readonly #create_kernel: CreateKernel;
    readonly #options: GuestOptions;

    // the kernel currently running, if any
    #kernel: Kernel | null = null;

    #current_run: Promise<EndReason> | null = null;
    #boot_count = 0;
    #stopping = false;

    // how the guest ended for good, once it has
    #final_reason: EndReason | null = null;

    /**
     * Kernel only. Guests are made by {@link Hypervisor.create}.
     * @hidden
     */
    constructor(host: Kernel, create_kernel: CreateKernel, options: GuestOptions) {
        this.#host = host;
        this.#create_kernel = create_kernel;
        this.#options = options;
    }

    /**
     * Boots the guest and resolves once it has ended: for good (a power off or a panic), or for a reboot if return_on_reboot is set.
     * Calling it while the guest is running returns the same run, and calling it after it has ended for good returns how it ended.
     */
    run(options: GuestRunOptions = {}): Promise<EndReason> {
        if (this.#final_reason) {
            return Promise.resolve(this.#final_reason);
        }

        this.#current_run ??= this.#run_until_end(options);
        return this.#current_run;
    }

    async #run_until_end(options: GuestRunOptions): Promise<EndReason> {
        try {
            for (;;) {
                this.#boot_count++;
                options.on_boot?.(this.#boot_count);

                const end_reason = await this.#boot_once();
                const is_reboot = end_reason.kind === "power_off" && end_reason.reboot;

                // stopped from outside (or ended for good), so whatever the guest asked for, it is done
                if (!is_reboot || this.#stopping) {
                    return this.#finish(this.#stopping ? {kind: "power_off", reboot: false} : end_reason);
                }

                if (options.return_on_reboot) {
                    return end_reason;
                }
            }
        } catch (e) {
            // something went wrong outside the guest kernel (e.g. preparing the disk), which ends the guest
            return this.#finish({kind: "panic", message: `Guest failed to start: ${e instanceof Error ? e.message : String(e)}`, debug_info: e instanceof Error ? e.stack : undefined});
        } finally {
            this.#current_run = null;
        }
    }

    async #prepare_disk(disk: AbstractFileSystem) {
        const host_fs = this.#host.get_fs();
        const {install, drivers} = this.#options;

        switch (install.kind) {
            case "host": {
                await base_fs_setup(disk, null);
                await copy_host_programs(host_fs, disk);
                break;
            }
            case "image": {
                await copy_image(install.reader, install.image, disk, "/");
                if (install.host_programs) {
                    await copy_host_programs(host_fs, disk);
                }
                break;
            }
            case "none": {
                break;
            }
        }

        await drivers.setup?.(disk);
    }

    async #boot_once(): Promise<EndReason> {
        const {console: guest_console, drivers} = this.#options;
        const host_fs = this.#host.get_fs();

        const power_off = () => {
            void this.power_off();
        };

        await this.#record_boot(host_fs);

        // what is made here (rather than given by the caller) is disposed here
        const disk = drivers.fs ? await drivers.fs(host_fs, this.#options.disk.root) : await ScopedFileSystem.create(host_fs, {root: this.#options.disk.root});
        const term = drivers.term ? drivers.term(guest_console, power_off) : new BridgedTerminal(guest_console, {on_escape: power_off});

        try {
            await this.#prepare_disk(disk);

            // stopped while the disk was being prepared, so never start
            if (this.#stopping) {
                return {kind: "power_off", reboot: false};
            }

            if (term instanceof BridgedTerminal) {
                term.attach();
            }

            const kernel = this.#create_kernel({
                term,
                fs: disk,
                wm: drivers.wm,
                net_manager: drivers.net_manager,
                platform: drivers.platform,
                isothread_manager: drivers.isothread_manager ?? this.#options.owned_isothread_manager,
            });

            kernel.set_env_info(this.#host.get_env_info().version, "virtual");
            this.#kernel = kernel;

            return await kernel.boot();
        } finally {
            this.#kernel = null;

            if (!drivers.term) {
                term.dispose();
            }

            if (!drivers.fs && disk instanceof ScopedFileSystem) {
                disk.dispose();
            }

            // hand the console back as it was before the guest used it (e.g. a visible cursor). it may already be gone if the host is shutting down
            try {
                guest_console.reset();
            } catch (e) {
                console.warn("Failed to reset a guest's console:", e);
            }
        }
    }

    // kept beside the disk's root, where the guest can't see it
    async #record_boot(host_fs: AbstractFileSystem) {
        const metadata_path = this.#options.disk.metadata;
        const metadata = await read_disk_metadata(host_fs, metadata_path);

        metadata.last_booted_at = new Date().toISOString();
        metadata.os_version = this.#host.get_env_info().version;

        await host_fs.write_file(metadata_path, JSON.stringify(metadata, null, 2), true);
    }

    #finish(reason: EndReason): EndReason {
        if (this.#final_reason) {
            return this.#final_reason;
        }

        this.#final_reason = reason;

        this.#options.owned_isothread_manager?.dispose();
        this.#options.on_finished();

        return reason;
    }

    /**
     * Powers the guest off for good, resolving once it has fully stopped. Safe to call at any time, including before it has run.
     */
    async power_off(): Promise<void> {
        this.#stopping = true;

        const current_run = this.#current_run;
        if (!current_run) {
            // not running, so there is nothing to stop, but what was made for it still goes
            this.#finish({kind: "power_off", reboot: false});
            return;
        }

        await this.#kernel?.power_off();
        await current_run;
    }

    /**
     * Reboots the guest, as if it rebooted itself.
     */
    async reboot(): Promise<void> {
        await this.#kernel?.reboot();
    }

    create_userspace_proxy(): UserspaceGuest {
        const proxy = Object.create(null);

        Object.defineProperties(proxy, {
            run: {
                value: (options?: GuestRunOptions) => {
                    // options come from userspace, so only the expected fields are passed on
                    const on_boot = typeof options?.on_boot === "function" ? options.on_boot : undefined;
                    return this.run({on_boot, return_on_reboot: options?.return_on_reboot === true});
                },
                enumerable: true
            },
            power_off: { value: () => this.power_off(), enumerable: true },
            reboot: { value: () => this.reboot(), enumerable: true },
        });

        return finalise_userspace_proxy(proxy, USERSPACE_GUEST_ANNOTATIONS);
    }
}

/**
 * Runs guest kernels on behalf of processes. Each guest is owned by the process that created it, and is powered off when that process ends.
 *
 * @group Kernel (Privileged)
 * @category Hypervisor
 */
export class Hypervisor {
    readonly #host: Kernel;
    readonly #create_kernel: CreateKernel;
    readonly #guests = new Set<Guest>();

    /**
     * Kernel only: the kernel makes its own.
     * @param create_kernel Constructs a guest kernel, so this module needs no runtime import of the kernel it belongs to.
     * @hidden
     */
    constructor(host: Kernel, create_kernel: CreateKernel) {
        this.#host = host;
        this.#create_kernel = create_kernel;
    }

    /**
     * The paths of a program's named disk: <private storage>/disks/<name>/root for the guest's filesystem, with disk.json beside it.
     */
    #disk_paths(process: ProcessContext, name: string): DiskPaths {
        const storage = this.#host.get_private_storage_path(process);
        if (storage === null) {
            throw new NotAllowedError("only programs in /bin or /usr/bin have private storage to keep disks in");
        }

        const disk_dir = `${storage}/disks/${name}`;
        return {root: `${disk_dir}/root`, metadata: `${disk_dir}/disk.json`};
    }

    /**
     * Creates a guest for a process. It doesn't start until {@link Guest.run} is called.
     * Rejects with a "NotAllowedError" for a process without private storage to keep the disk in (see {@link Kernel.get_private_storage_path}).
     * @param drivers Implementations to use instead of the defaults. Only for kernelspace callers.
     */
    async create(process: ProcessContext, spec: GuestSpec, drivers: GuestDrivers = {}): Promise<Guest> {
        // spec comes from userspace, so nothing about it is assumed. a name is one path segment, so it can't leave the program's disks
        const name = spec?.disk;
        if (typeof name !== "string" || name === "" || name === "." || name === ".." || name.includes("/")) {
            throw new TypeError("A guest's disk must be a name, without any slashes");
        }

        if (spec.own_kernel !== undefined && spec.own_kernel !== true) {
            throw new TypeError("Guests sharing the host's kernel aren't supported yet");
        }

        const disk = this.#disk_paths(process, name);
        const install = this.#resolve_install(spec.install, process);

        // isothreads of its own, so the guest's programs are as isolated as the host's and their pids can't collide with the host's
        const owned_isothread_manager = drivers.isothread_manager ? undefined : (this.#host.get_isothread_manager()?.create_sibling() ?? undefined);

        const guest: Guest = new Guest(this.#host, this.#create_kernel, {
            disk,
            install,
            console: process.terminal,
            drivers,
            owned_isothread_manager,
            on_finished: () => this.#guests.delete(guest),
        });

        this.#guests.add(guest);

        // the guest belongs to the process, so it goes when the process does
        process.add_teardown(() => {
            void guest.power_off();
        });

        return guest;
    }

    #resolve_install(install: GuestInstall | undefined, process: ProcessContext): ResolvedInstall {
        if (install === undefined || install === "host") {
            return {kind: "host"};
        }

        if (install === "none") {
            return {kind: "none"};
        }

        if (typeof install === "object" && install !== null && typeof install.image === "string" && install.image !== "") {
            const reader = AbstractFileSystem.create_userspace_proxy(this.#host.get_fs(), process);
            return {kind: "image", image: reader.absolute(install.image), host_programs: install.host_programs === true, reader};
        }

        throw new TypeError("A guest's install must be \"host\", \"none\" or {image: <directory>}");
    }

    /**
     * Powers off every guest, e.g. when the host kernel is disposed.
     */
    dispose(): void {
        for (const guest of [...this.#guests]) {
            void guest.power_off();
        }
    }
}
