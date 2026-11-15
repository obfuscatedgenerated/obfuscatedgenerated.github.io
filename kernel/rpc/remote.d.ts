/**
 * Marks which members of a userspace proxy interface read synchronously across the RPC layer: those annotated as constant, mirrored, eager handles, or local functions.
 * It only exists in types, so it is never present at runtime.
 * @hidden
 */
export declare const sync_members: unique symbol;
/**
 * Marks members that {@link Remote} should leave exactly as declared, because their types already describe the RPC view (e.g. generic or overloaded methods that already return promises).
 * It only exists in types, so it is never present at runtime.
 * @hidden
 */
export declare const remote_as_declared: unique symbol;
interface RemoteProxyShape {
    readonly [sync_members]?: (member: never) => void;
}
type SyncMembersOf<T> = T extends {
    readonly [sync_members]?: (member: infer S) => void;
} ? S : never;
type DeclaredMembersOf<T> = T extends {
    readonly [remote_as_declared]?: (member: infer D) => void;
} ? D : never;
type AnyFunction = (...args: never[]) => unknown;
type RemoteArg<A> = A extends (...params: infer P) => infer R ? (...params: {
    [J in keyof P]: Remote<P[J]>;
}) => R : Remote<A>;
type RemoteArgs<A extends unknown[]> = {
    [I in keyof A]: RemoteArg<A[I]>;
};
type RemoteSyncMember<M> = M extends (...args: infer A) => infer R ? (...args: RemoteArgs<A>) => Remote<R> : Remote<M>;
type RemoteCallMember<M> = M extends (...args: infer A) => infer R ? (...args: RemoteArgs<A>) => [R] extends [void] ? void : Promise<Remote<Awaited<R>>> : Promise<Remote<Awaited<M>>>;
type RemoteMember<T, K extends keyof T> = K extends DeclaredMembersOf<T> ? T[K] : K extends SyncMembersOf<T> ? RemoteSyncMember<T[K]> : RemoteCallMember<T[K]>;
type BrandKey = typeof sync_members | typeof remote_as_declared;
/**
 * How a userspace proxy looks to a program running in an isothread, where every call crosses the RPC layer to the kernel.
 *
 * - Members the proxy marks as synchronous (constant and mirrored values, handles, and local helpers) read synchronously, as declared.
 * - Every other method that returns a value returns a promise of it instead.
 * - Methods that return nothing are sent in order without waiting, so they still return nothing.
 * - Proxies returned from any of these are remote too.
 *
 * - Proxies the program passes back as arguments can be its stubs, and callbacks it passes in are called with stubs.
 *
 * Plain data (anything that isn't a userspace proxy interface) is unchanged. For a proxy interface, this gives a {@link RemoteProxy}.
 * @group Userspace
 * @category Kernel
 */
export type Remote<T> = T extends Promise<infer U> ? Promise<Remote<U>> : RemoteValue<T>;
type RemoteValue<T> = T extends AnyFunction ? T : T extends readonly (infer E)[] ? Remote<E>[] : T extends RemoteProxyShape ? RemoteProxy<T> : T;
/**
 * A userspace proxy interface as a program running in an isothread sees it. This is what {@link Remote} gives for a proxy, so see it for which members return promises.
 * @group Userspace
 * @category Kernel
 */
export type RemoteProxy<T> = {
    [K in keyof T as K extends BrandKey ? never : K]: RemoteMember<T, K>;
};
/**
 * Kernel only. Types a userspace proxy as the program will receive it, where the kernel hands it to the program.
 * @hidden
 */
export declare const as_remote: <T>(proxy: T) => Remote<T>;
export {};
