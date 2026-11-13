import {absolute_path, join_path} from "../../lib/path";
import {ansi_escape_regex, ansi_unescaped_regex, non_printable_regex, word_wrap} from "../../lib/ansi";

/**
 * What a local implementation can use. One context exists per running program.
 */
export interface LocalContext {
    /** The stub the member belongs to. It is still being built when the factory runs, so only read it inside the returned function. */
    stub: Readonly<Record<string, unknown>>;

    /** Shared between all local implementations of the program, e.g. for timers to keep their ids. */
    state: Map<string, unknown>;

    /** Registers cleanup to run when the program exits. */
    on_exit(cleanup: () => void): void;
}

export type LocalFactory = (context: LocalContext) => (...args: unknown[]) => unknown;

type Callable = (...args: unknown[]) => unknown;

interface LocalTimeout {
    timer: ReturnType<typeof setTimeout>;
    waiters: ((finished: boolean) => void)[];
}

interface TimerState {
    timeouts: Map<number, LocalTimeout>;
    intervals: Map<number, ReturnType<typeof setInterval>>;
    next_id: number;
}

// timers run in the program's own realm, so they die with it
const timer_state = (context: LocalContext): TimerState => {
    let state = context.state.get("timers") as TimerState | undefined;

    if (!state) {
        const created: TimerState = { timeouts: new Map(), intervals: new Map(), next_id: 1 };
        state = created;
        context.state.set("timers", created);

        context.on_exit(() => {
            for (const {timer} of created.timeouts.values()) {
                clearTimeout(timer);
            }

            for (const interval of created.intervals.values()) {
                clearInterval(interval);
            }

            created.timeouts.clear();
            created.intervals.clear();
        });
    }

    return state;
};

const read = <T>(context: LocalContext, member: string): T => (context.stub[member] as () => T)();

/**
 * Implementations for members annotated `{ local: id }`, run by the RPC shim instead of calling the kernel.
 * Adding a local member only needs an entry here and the annotation on the proxy.
 */
export const LOCAL_IMPLEMENTATIONS: Readonly<Record<string, LocalFactory>> = Object.freeze({
    "timers.create_timeout": (context) => (callback, delay) => {
        const timers = timer_state(context);
        const id = timers.next_id++;

        const timer = setTimeout(() => {
            const entry = timers.timeouts.get(id);
            timers.timeouts.delete(id);

            for (const waiter of entry?.waiters ?? []) {
                waiter(true);
            }

            (callback as Callable)();
        }, delay as number);

        timers.timeouts.set(id, { timer, waiters: [] });
        return id;
    },
    "timers.cancel_timeout": (context) => (id) => {
        const timers = timer_state(context);
        const entry = timers.timeouts.get(id as number);
        if (!entry) {
            return;
        }

        clearTimeout(entry.timer);
        timers.timeouts.delete(id as number);

        for (const waiter of entry.waiters) {
            waiter(false);
        }
    },
    "timers.wait_for_timeout": (context) => (id) => {
        const entry = timer_state(context).timeouts.get(id as number);
        if (!entry) {
            return Promise.reject(new Error(`Timeout ID ${id} does not exist.`));
        }

        return new Promise<boolean>((resolve) => entry.waiters.push(resolve));
    },
    "timers.has_timeout": (context) => (id) => timer_state(context).timeouts.has(id as number),
    "timers.create_interval": (context) => (callback, interval) => {
        const timers = timer_state(context);
        const id = timers.next_id++;

        timers.intervals.set(id, setInterval(callback as Callable, interval as number));
        return id;
    },
    "timers.clear_interval": (context) => (id) => {
        const timers = timer_state(context);
        const interval = timers.intervals.get(id as number);

        if (interval !== undefined) {
            clearInterval(interval);
            timers.intervals.delete(id as number);
        }
    },

    "path.join": () => (base_dir, ...paths) => join_path(base_dir as string, ...(paths as string[])),
    "path.absolute": (context) => (path) => absolute_path(path as string, {
        root: read<string>(context, "get_root"),
        home: read<string>(context, "get_home"),
        cwd: read<string>(context, "get_cwd"),
    }),

    "platform.supports": (context) => (capability_name) =>
        read<{ name: string }[]>(context, "get_capabilities").some((capability) => capability.name === capability_name),

    "ansi.non_printable_regex": () => () => non_printable_regex(),
    "ansi.ansi_escape_regex": () => () => ansi_escape_regex(),
    "ansi.ansi_unescaped_regex": () => () => ansi_unescaped_regex(),
    "ansi.word_wrap": () => (text, width) => word_wrap(text as string, width as number),
});
