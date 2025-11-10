export type WindowEvent = "close" | "hide" | "show" | "focus" | "move" | "rename";
export declare abstract class AbstractWindow {
    abstract readonly id: number;
    abstract readonly dom: ShadowRoot;
    abstract readonly manager: AbstractWindowManager;
    abstract moveable: boolean;
    abstract resizable: boolean;
    abstract get title(): string;
    abstract set title(new_title: string);
    abstract set width(css_width: string);
    abstract set height(css_height: string);
    abstract set x(css_pos: string | number);
    abstract set y(css_pos: string | number);
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
}
export declare abstract class AbstractWindowManager {
    abstract get_unique_manager_type_name(): string;
    abstract get Window(): new () => AbstractWindow;
    abstract get_all_windows(): AbstractWindow[];
    abstract get_window_by_id(id: number): AbstractWindow | null;
}
