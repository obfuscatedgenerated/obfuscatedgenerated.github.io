export type WindowEvent = "close" | "hide" | "show" | "focus" | "move" | "rename" | "resize" | "maximise" | "restore";

export interface UserspaceOtherWindow {
    readonly id: number;
    readonly manager: UserspaceWindowManager;
    readonly owner_pid: number;

    readonly title: string;
    readonly width: string;
    readonly height: string;
    readonly x: string | number;
    readonly y: string | number;
    readonly visible: boolean;
    readonly maximised: boolean;
}

export interface UserspaceWindow extends UserspaceOtherWindow {
    readonly manager: UserspaceWindowManager;
    readonly dom: ShadowRoot;

    title: string;
    width: string;
    height: string;
    x: string | number;
    y: string | number;

    visible: boolean;
    maximised: boolean;

    center(): void;
    focus(): void;
    show(): void;
    hide(): void;
    toggle(): void;
    close(): void;

    add_event_listener(event: WindowEvent, callback: () => void): void;
    wait_for_event(event: WindowEvent): Promise<void>;
}

export abstract class AbstractWindow {
    abstract readonly id: number;

    // TODO: more generic type somehow? depends if we ever need implementations that dont use shadow DOM
    abstract readonly dom: ShadowRoot;

    abstract readonly manager: AbstractWindowManager;

    abstract moveable: boolean;

    abstract resizable: boolean;

    abstract maximisable: boolean;
    abstract maximised: boolean;

    private readonly _owner_pid: number;

    protected constructor(owner_pid: number) {
        this._owner_pid = owner_pid;
    }

    get owner_pid(): number {
        return this._owner_pid;
    }

    abstract get title(): string;
    abstract set title(new_title: string);

    abstract get width(): string;
    abstract set width(css_width: string);

    abstract get height(): string;
    abstract set height(css_height: string);

    // number to be interpreted as pixels
    abstract get x(): string | number;
    abstract set x(css_pos: string | number);

    // number to be interpreted as pixels
    abstract get y(): string | number;
    abstract set y(css_pos: string | number);

    abstract center(): void;

    abstract get visible(): boolean;
    abstract set visible(is_visible: boolean);

    abstract add_event_listener(event: WindowEvent, callback: () => Promise<void> | void): void;

    abstract remove_event_listener(event: WindowEvent, callback: () => Promise<void> | void): void;

    abstract dispose(): void;

    abstract close(): void;

    abstract focus(): void;

    abstract show(): void;
    abstract hide(): void;
    abstract toggle(): void;

    // best effort flags, may not be supported by all implementations (e.g. transparent flag)
    abstract get_custom_flag(flag: string): boolean;
    abstract set_custom_flag(flag: string, value: boolean): void;

    abstract wait_for_event(event: WindowEvent): Promise<void>;

    create_userspace_proxy_as_other_window(): UserspaceOtherWindow {
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const self = this;
        const proxy = Object.create(null);

        Object.defineProperties(proxy, {
            id: { get: () => self.id, enumerable: true },
            manager: { get: () => self.manager.create_userspace_proxy(), enumerable: true },
            owner_pid: { get: () => self.owner_pid, enumerable: true },
            title: { get: () => self.title, enumerable: true },
            width: { get: () => self.width, enumerable: true },
            height: { get: () => self.height, enumerable: true },
            x: { get: () => self.x, enumerable: true },
            y: { get: () => self.y, enumerable: true },
            visible: { get: () => self.visible, enumerable: true },
            maximised: { get: () => self.maximised, enumerable: true }
        });

        return Object.freeze(proxy);
    }

    create_userspace_proxy_as_full_window(): UserspaceWindow {
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const self = this;
        const proxy = Object.create(null);

        const manager_proxy = self.manager.create_userspace_proxy();

        Object.defineProperties(proxy, {
            id: { get: () => self.id, enumerable: true },
            manager: { get: () => manager_proxy, enumerable: true },
            owner_pid: { get: () => self.owner_pid, enumerable: true },
            dom: { get: () => self.dom, enumerable: true },
            title: {
                get: () => self.title,
                set: (new_title: string) => { self.title = new_title; },
                enumerable: true
            },
            width: {
                get: () => self.width,
                set: (css_width: string) => { self.width = css_width; },
                enumerable: true
            },
            height: {
                get: () => self.height,
                set: (css_height: string) => { self.height = css_height; },
                enumerable: true
            },
            x: {
                get: () => self.x,
                set: (css_pos: string | number) => { self.x = css_pos; },
                enumerable: true
            },
            y: {
                get: () => self.y,
                set: (css_pos: string | number) => { self.y = css_pos; },
                enumerable: true
            },
            visible: {
                get: () => self.visible,
                set: (is_visible: boolean) => { self.visible = is_visible; },
                enumerable: true
            },
            maximised: { get: () => self.maximised, enumerable: true },
            center: { value: () => { self.center(); }, enumerable: true },
            focus: { value: () => { self.focus(); }, enumerable: true },
            show: { value: () => { self.show(); }, enumerable: true },
            hide: { value: () => { self.hide(); }, enumerable: true },
            toggle: { value: () => { self.toggle(); }, enumerable: true },
            close: { value: () => { self.close(); }, enumerable: true },
            add_event_listener: { value: (event: WindowEvent, callback: () => void) => { self.add_event_listener(event, callback); }, enumerable: true },
            wait_for_event: { value: (event: WindowEvent) => self.wait_for_event(event), enumerable: true }
        });

        return Object.freeze(proxy);
    }
}

export interface UserspaceWindowManager {
    get_unique_manager_type_name(): string;
    get_all_windows(): UserspaceOtherWindow[];
    get_window_by_id(id: number): UserspaceOtherWindow | null;
}

export abstract class AbstractWindowManager {
    abstract get_unique_manager_type_name(): string;

    abstract get Window(): new (owner_pid: number) => AbstractWindow;

    abstract get_all_windows(): AbstractWindow[];

    abstract get_window_by_id(id: number): AbstractWindow | null;

    abstract dispose_all(): void;

    create_userspace_proxy(): UserspaceWindowManager {
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const self = this;
        const proxy = Object.create(null);

        Object.defineProperties(proxy, {
            get_unique_manager_type_name: { value: () => self.get_unique_manager_type_name(), enumerable: true },
            get_all_windows: {
                value: () => self.get_all_windows().map((win) => win.create_userspace_proxy_as_other_window()),
                enumerable: true
            },
            get_window_by_id: {
                value: (id: number) => {
                    const win = self.get_window_by_id(id);
                    return win ? win.create_userspace_proxy_as_other_window() : null;
                },
                enumerable: true
            }
        });

        return Object.freeze(proxy);
    }
}

// TODO: use separate interfaces so that only the process registry can create windows
