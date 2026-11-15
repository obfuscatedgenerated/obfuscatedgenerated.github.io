import { MirrorSource } from "./mirroring";
import { type LocalFunction } from "../../lib/locals";
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
export type RegisteredMemberAnnotation = Exclude<MemberAnnotation, LocalFunction> | {
    readonly local: string;
};
export type ProxyAnnotations = Readonly<Record<string, RegisteredMemberAnnotation>>;
interface RegisteredProxy {
    annotations: ProxyAnnotations;
    sources: readonly MirrorSource[];
}
export declare const finalise_userspace_proxy: <T extends object>(proxy: T, annotations?: Readonly<Record<string, MemberAnnotation>>, sources?: MirrorSource[]) => T;
export declare const is_userspace_proxy: (value: unknown) => value is object;
export declare const get_registered_proxy: (proxy: object) => RegisteredProxy | undefined;
export declare const get_proxy_annotations: (proxy: object) => ProxyAnnotations | undefined;
export declare const get_proxy_sources: (proxy: object) => readonly MirrorSource[] | undefined;
export {};
