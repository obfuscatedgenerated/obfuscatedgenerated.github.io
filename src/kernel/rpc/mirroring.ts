export const mirror_source = Symbol("mirror_source");

export interface MirrorSource {
    readonly [mirror_source]: true;
}

export type MirrorSourceListener<T extends MirrorSource> = (source: T) => void;

interface MirrorSourceListenerWeakMap {
    get<T extends MirrorSource>(source: T): Set<MirrorSourceListener<T>> | undefined;
    set<T extends MirrorSource>(source: T, listeners: Set<MirrorSourceListener<T>>): void;
    delete<T extends MirrorSource>(source: T): boolean;
}

const listeners: MirrorSourceListenerWeakMap = new WeakMap();

// sources notified during the current tick, flushed together in one microtask
const pending_sources = new Set<MirrorSource>();
let flush_scheduled = false;

const flush_pending = () => {
    flush_scheduled = false;

    const sources = [...pending_sources];
    pending_sources.clear();

    for (const source of sources) {
        // copy so listeners can subscribe or unsubscribe while we iterate
        for (const listener of [...(listeners.get(source) ?? [])]) {
            try {
                listener(source);
            } catch (error) {
                console.error("Mirror listener failed:", error);
            }
        }
    }
};

export const on_mirror_change = <T extends MirrorSource>(source: T, listener: MirrorSourceListener<T>): (() => void) => {
    let source_listeners = listeners.get(source);
    if (!source_listeners) {
        source_listeners = new Set();
        listeners.set(source, source_listeners);
    }

    source_listeners.add(listener);

    return () => {
        const current = listeners.get(source);
        if (!current) {
            return;
        }

        current.delete(listener);
        if (current.size === 0) {
            listeners.delete(source);
        }
    };
};

/**
 * Marks a source as changed. Listeners run once per source in a microtask, after the current kernel operation finishes.
 */
export const notify_mirror_change = <T extends MirrorSource>(source: T) => {
    if (!listeners.get(source)) {
        return;
    }

    pending_sources.add(source);

    if (!flush_scheduled) {
        flush_scheduled = true;
        queueMicrotask(flush_pending);
    }
};
