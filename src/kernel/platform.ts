import {supports_capability} from "../lib/capabilities";
import {finalise_userspace_proxy, type sync_members} from "./rpc";

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
export const USERSPACE_PLATFORM_ANNOTATIONS = {
    get_platform_name: "constant",
    get_capabilities: "constant",
    supports: supports_capability,
} as const;

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

// these open without asking, as a page on the web can't do anything to the os
const DIRECT_URL_PROTOCOLS = ["http:", "https:"];

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

    /**
     * Opens a URL outside the OS. The URL is already validated, and confirmed by the user if it isn't http(s).
     */
    protected abstract _open_url(url: URL): Promise<void>;

    /**
     * Opens a URL outside the OS. Kernel side, so it never asks: userspace goes through the proxy, which does.
     */
    async open_url(url: string | URL): Promise<void> {
        await this._open_url(new URL(url));
    }

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

    /**
     * @param confirm Asks the user on behalf of the process the proxy belongs to, used before opening non-http(s) URLs.
     */
    create_userspace_proxy(confirm: PlatformConfirm): UserspacePlatformAPI {
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
        Object.defineProperty(proxy, "open_url", {
            value: async (url: string) => {
                if (typeof url !== "string") {
                    throw new TypeError("open_url expects a URL string");
                }

                // throws on anything that isn't an absolute url
                const parsed = new URL(url);

                // a page can run script in the os's own origin with these, so they are never opened from userspace
                if (parsed.protocol === "javascript:" || parsed.protocol === "data:" || parsed.protocol === "blob:") {
                    throw new TypeError(`URLs with the ${parsed.protocol} scheme can't be opened`);
                }

                if (!DIRECT_URL_PROTOCOLS.includes(parsed.protocol)) {
                    const confirmed = await confirm(`Open ${parsed.toString()} in another application`);
                    if (!confirmed) {
                        throw new DOMException(`Opening ${parsed.toString()} was not allowed`, "NotAllowedError");
                    }
                }

                await this._open_url(parsed);
            },
            enumerable: true
        });

        return finalise_userspace_proxy(proxy, USERSPACE_PLATFORM_ANNOTATIONS);
    }
}
