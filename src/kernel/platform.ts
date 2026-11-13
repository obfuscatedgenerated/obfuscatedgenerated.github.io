import {finalise_userspace_proxy} from "./rpc";

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
export abstract class AbstractPlatformAPI {
    abstract get_platform_name(): string;

    abstract get_capabilities(): PlatformCapability[];

    protected abstract _call_internal(capability_name: string, args: unknown): Promise<unknown>;

    #find_capability(capability_name: string): PlatformCapability | undefined {
        return this.get_capabilities().find(capability => capability.name === capability_name);
    }

    supports(capability_name: string): boolean {
        return this.#find_capability(capability_name) !== undefined;
    }

    async call(capability_name: string, args?: unknown): Promise<unknown> {
        if (!this.supports(capability_name)) {
            throw new Error(`Platform capability "${capability_name}" is not available on ${this.get_platform_name()}`);
        }

        return this._call_internal(capability_name, args);
    }

    create_userspace_proxy(): UserspacePlatformAPI {
        const proxy = Object.create(null) as UserspacePlatformAPI;

        Object.defineProperty(proxy, "get_platform_name", { value: () => this.get_platform_name(), enumerable: true });
        Object.defineProperty(proxy, "get_capabilities", { value: () => this.get_capabilities().map(capability => ({...capability})), enumerable: true });
        Object.defineProperty(proxy, "supports", { value: (capability_name: string) => this.supports(capability_name), enumerable: true });
        Object.defineProperty(proxy, "call", {
            value: async (capability_name: string, args?: unknown) => {
                if (this.#find_capability(capability_name)?.privileged) {
                    throw new Error(`Platform capability "${capability_name}" requires privileged access`);
                }

                return this.call(capability_name, args);
            },
            enumerable: true
        });

        return finalise_userspace_proxy(proxy, {
            get_platform_name: "constant",
            get_capabilities: "constant",
            supports: { local: "platform.supports" },
        });
    }
}
