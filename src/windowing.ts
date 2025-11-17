export type WindowEvent = "close" | "hide" | "show" | "focus" | "move" | "rename";

export abstract class AbstractWindow {
    abstract readonly id: number;

    // TODO: more generic type somehow? depends if we ever need implementations that dont use shadow DOM
    abstract readonly dom: ShadowRoot;

    abstract readonly manager: AbstractWindowManager;

    abstract moveable: boolean;

    abstract resizable: boolean;

    abstract maximisable: boolean;
    abstract maximised: boolean;

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

    abstract add_event_listener(event: WindowEvent, callback: () => Promise<void>): void;

    abstract remove_event_listener(event: WindowEvent, callback: () => Promise<void>): void;

    abstract dispose(): void;

    abstract close(): void;

    abstract focus(): void;

    abstract show(): void;
    abstract hide(): void;
    abstract toggle(): void;

    // best effort flags, may not be supported by all implementations (e.g. transparent flag)
    abstract get_custom_flag(flag: string): boolean;
    abstract set_custom_flag(flag: string, value: boolean): void;
}

export abstract class AbstractWindowManager {
    abstract get_unique_manager_type_name(): string;

    abstract get Window(): new () => AbstractWindow;

    abstract get_all_windows(): AbstractWindow[];

    abstract get_window_by_id(id: number): AbstractWindow | null;
}
