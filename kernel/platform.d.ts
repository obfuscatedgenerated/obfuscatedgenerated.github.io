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
 * Interface for interacting with a platform API from userspace.
 *
 * For the privileged API base, see {@link AbstractPlatformAPI}.
 *
 * @group Userspace
 * @category Platform
 */
export interface UserspacePlatformAPI {
    get_platform_name(): string;
    get_capabilities(): PlatformCapability[];
    supports(capability_name: string): boolean;
    call(capability_name: string, args?: unknown): Promise<unknown>;
}
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
    supports(capability_name: string): boolean;
    call(capability_name: string, args?: unknown): Promise<unknown>;
    create_userspace_proxy(): UserspacePlatformAPI;
}
