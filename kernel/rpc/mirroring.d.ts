export declare const mirror_source: unique symbol;
export interface MirrorSource {
    readonly [mirror_source]: true;
}
export type MirrorSourceListener<T extends MirrorSource> = (source: T) => void;
export declare const on_mirror_change: <T extends MirrorSource>(source: T, listener: MirrorSourceListener<T>) => (() => void);
/**
 * Marks a source as changed. Listeners run once per source in a microtask, after the current kernel operation finishes.
 */
export declare const notify_mirror_change: <T extends MirrorSource>(source: T) => void;
