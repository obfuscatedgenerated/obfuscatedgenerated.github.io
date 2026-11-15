/**
 * Platform capability helpers that work on anything exposing get_capabilities, so the RPC shim can answer supports() locally.
 *
 * @module
 */
export interface CapabilitySource {
    get_capabilities(): {
        name: string;
    }[];
}
export declare const supports_capability: (this: CapabilitySource, capability_name: string) => boolean;
