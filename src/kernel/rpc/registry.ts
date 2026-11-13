/**
 * Describes how RPC should access members of the proxy.
 * If omitted, the member is assumed to be an asynchronous call.
 * All synchronous members must be annotated, otherwise they will return a Promise when accessed over RPC.
 * Asynchronous members rarely need annotating. One exception is marking an async member whose result never changes as constant,
 * in which case the shim still returns a Promise, resolving to the cached value.
 */
export type MemberAnnotation =
/** A value, or a method with no arguments, that never changes. It is read once at startup and cached. */
    "constant" |
    /** A value, or a method with no arguments, that can change. It is read once at startup, then kept up to date by the kernel. */
    "mirrored" |
    /** A method that always returns the same proxy. The handle is created at startup, so the method returns its stub synchronously. */
    "eager_handle" |
    /** A synchronous pure function that the RPC shim runs itself using shared code, without calling the kernel. */
    "local";

export type ProxyAnnotations = Readonly<Record<string, MemberAnnotation>>;

// WeakMap rather than a property on the proxy so userspace can't see or tamper with it, and it doesn't show up in the descriptors the extractor walks
const registered_proxies = new WeakMap<object, ProxyAnnotations>();

export const finalise_userspace_proxy = <T extends object>(proxy: T, annotations: ProxyAnnotations = {}): T => {
    const frozen = Object.freeze(proxy);
    registered_proxies.set(frozen, Object.freeze({...annotations}));
    return frozen;
};

export const is_userspace_proxy = (value: unknown): value is object =>
    typeof value === "object" && value !== null && registered_proxies.has(value);

export const get_proxy_annotations = (proxy: object): ProxyAnnotations | undefined =>
    registered_proxies.get(proxy);
