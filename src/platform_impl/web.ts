import {AbstractPlatformAPI, type PlatformCapability} from "../kernel/platform";

/**
 * The platform API when running in a browser.
 */
export class WebPlatformAPI extends AbstractPlatformAPI {
    get_platform_name(): string {
        return "web";
    }

    get_capabilities(): PlatformCapability[] {
        return [];
    }

    protected async _call_internal(capability_name: string): Promise<unknown> {
        throw new Error(`Platform capability "${capability_name}" is not available on web`);
    }

    protected async _open_url(url: URL): Promise<void> {
        // noopener so the opened page can't reach back into the os through window.opener
        window.open(url.toString(), "_blank", "noopener");
    }
}
