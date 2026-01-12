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
export declare abstract class AbstractWindow {
    abstract readonly id: number;
    abstract readonly dom: ShadowRoot;
    abstract readonly manager: AbstractWindowManager;
    abstract moveable: boolean;
    abstract resizable: boolean;
    abstract maximisable: boolean;
    abstract maximised: boolean;
    private readonly _owner_pid;
    protected constructor(owner_pid: number);
    get owner_pid(): number;
    abstract get title(): string;
    abstract set title(new_title: string);
    abstract get width(): string;
    abstract set width(css_width: string);
    abstract get height(): string;
    abstract set height(css_height: string);
    abstract get x(): string | number;
    abstract set x(css_pos: string | number);
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
    abstract get_custom_flag(flag: string): boolean;
    abstract set_custom_flag(flag: string, value: boolean): void;
    abstract wait_for_event(event: WindowEvent): Promise<void>;
    create_userspace_proxy_as_other_window(): UserspaceOtherWindow;
    create_userspace_proxy_as_full_window(): UserspaceWindow;
}
export interface UserspaceWindowManager {
    get_unique_manager_type_name(): string;
    get_all_windows(): UserspaceOtherWindow[];
    get_window_by_id(id: number): UserspaceOtherWindow | null;
}
export declare abstract class AbstractWindowManager {
    abstract get_unique_manager_type_name(): string;
    abstract get Window(): new (owner_pid: number) => AbstractWindow;
    abstract get_all_windows(): AbstractWindow[];
    abstract get_window_by_id(id: number): AbstractWindow | null;
    abstract dispose_all(): void;
    create_userspace_proxy(): UserspaceWindowManager;
}
