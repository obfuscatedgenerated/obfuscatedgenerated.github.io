import { type sync_members } from "./rpc";
/**
 * Describes a platform specific capability (e.g. haptics, share sheet).
 * @property name The unique name used to call the capability.
 * @property privileged Whether the capability can only be called from a privileged kernel.
 *
 * @group Userspace
 * @category Platform
 */
export interface PlatformCapability {
    name: string;
    privileged: boolean;
}
/**
 * How the RPC layer accesses the platform API's userspace proxy: these members read synchronously, everything else goes to the kernel.
 * @hidden
 */
export declare const USERSPACE_PLATFORM_ANNOTATIONS: {
    readonly get_platform_name: "constant";
    readonly get_capabilities: "constant";
    readonly supports: (this: import("../lib/capabilities").CapabilitySource, capability_name: string) => boolean;
};
/**
 * Interface for interacting with a platform API from userspace.
 *
 * For the privileged API base, see {@link AbstractPlatformAPI}.
 *
 * @group Userspace
 * @category Platform
 */
export interface UserspacePlatformAPI {
    /** @hidden */
    readonly [sync_members]?: (member: keyof typeof USERSPACE_PLATFORM_ANNOTATIONS) => void;
    get_platform_name(): string;
    get_capabilities(): PlatformCapability[];
    supports(capability_name: string): boolean;
    call(capability_name: string, args?: unknown): Promise<unknown>;
    /**
     * Opens a URL outside the OS, e.g. in a new browser tab. http(s) URLs open directly; any other scheme (e.g. steam://) asks the user first, and rejects with a "NotAllowedError" if denied.
     */
    open_url(url: string): Promise<void>;
}
/**
 * Asks the user to confirm something on behalf of a process. Resolves true if confirmed.
 */
export type PlatformConfirm = (reason: string) => Promise<boolean>;
/**
 * Base class for platform specific API injection.
 *
 * To implement, use {@link https://ollieg.codes/docs/Program_Types/ProgramMainData.html#sdk sdk.AbstractPlatformAPI} passed via program main data.
 *
 * @group Kernel (Privileged)
 * @category Platform
 */
export declare abstract class AbstractPlatformAPI {
    #private;
    abstract get_platform_name(): string;
    abstract get_capabilities(): PlatformCapability[];
    protected abstract _call_internal(capability_name: string, args: unknown): Promise<unknown>;
    /**
     * Opens a URL outside the OS. The URL is already validated, and confirmed by the user if it isn't http(s).
     */
    protected abstract _open_url(url: URL): Promise<void>;
    /**
     * Opens a URL outside the OS. Kernel side, so it never asks: userspace goes through the proxy, which does.
     */
    open_url(url: string | URL): Promise<void>;
    supports(capability_name: string): boolean;
    call(capability_name: string, args?: unknown): Promise<unknown>;
    /**
     * @param confirm Asks the user on behalf of the process the proxy belongs to, used before opening non-http(s) URLs.
     */
    create_userspace_proxy(confirm: PlatformConfirm): UserspacePlatformAPI;
}
