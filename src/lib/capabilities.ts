/**
 * Platform capability helpers that work on anything exposing get_capabilities, so the RPC shim can answer supports() locally.
 *
 * @module
 */

import {define_local} from "./locals";

export interface CapabilitySource {
    get_capabilities(): { name: string }[];
}

export const supports_capability = define_local("platform.supports", function (this: CapabilitySource, capability_name: string): boolean {
    return this.get_capabilities().some((capability) => capability.name === capability_name);
});
