import {MirrorSource} from "./mirroring";
import {get_local_id, type LocalFunction} from "../../lib/locals";

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
    /** A method or property that always returns the same proxy (or always null). The handle is created at startup, so the stub is returned synchronously. */
    "eager_handle" |
    /** A function defined with define_local. The RPC shim runs it itself, with the stub as `this`, without calling the kernel. */
    LocalFunction;

/** How an annotation is stored and sent: local functions are replaced by their id. */
export type RegisteredMemberAnnotation = Exclude<MemberAnnotation, LocalFunction> | { readonly local: string };

export type ProxyAnnotations = Readonly<Record<string, RegisteredMemberAnnotation>>;

interface RegisteredProxy {
    annotations: ProxyAnnotations;
    sources: readonly MirrorSource[];
}

// WeakMap rather than a property on the proxy so userspace can't see or tamper with it, and it doesn't show up in the descriptors the extractor walks
const registered_proxies = new WeakMap<object, RegisteredProxy>();

const register_annotation = (member: string, annotation: MemberAnnotation): RegisteredMemberAnnotation => {
    if (typeof annotation !== "function") {
        return annotation;
    }

    const local_id = get_local_id(annotation);
    if (local_id === undefined) {
        throw new Error(`Local annotation for "${member}" must be a function defined with define_local`);
    }

    return { local: local_id };
};

export const finalise_userspace_proxy = <T extends object>(proxy: T, annotations: Readonly<Record<string, MemberAnnotation>> = {}, sources: MirrorSource[] = []): T => {
    const has_mirrored = Object.values(annotations).includes("mirrored");
    if (has_mirrored && sources.length === 0) {
        throw new Error("Proxy has mirrored members but no mirror sources, so they could never update");
    }

    const frozen = Object.freeze(proxy);
    registered_proxies.set(frozen, Object.freeze({
        annotations: Object.freeze(Object.fromEntries(
            Object.entries(annotations).map(([member, annotation]) => [member, register_annotation(member, annotation)])
        )),
        sources: Object.freeze([...sources]),
    }));
    return frozen;
};

export const is_userspace_proxy = (value: unknown): value is object =>
    typeof value === "object" && value !== null && registered_proxies.has(value);

export const get_registered_proxy = (proxy: object): RegisteredProxy | undefined =>
    registered_proxies.get(proxy);

export const get_proxy_annotations = (proxy: object): ProxyAnnotations | undefined =>
    registered_proxies.get(proxy)?.annotations;

export const get_proxy_sources = (proxy: object): readonly MirrorSource[] | undefined =>
    registered_proxies.get(proxy)?.sources;
