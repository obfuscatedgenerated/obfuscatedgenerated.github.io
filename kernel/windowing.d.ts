import { mirror_source, MirrorSource, type sync_members } from "./rpc";
export type WindowEvent = "close" | "hide" | "show" | "focus" | "move" | "rename" | "resize" | "maximise" | "restore";
export type UserspaceAccessibleCompositionLayer = "background" | "normal" | "top";
declare const PRIVILEGED_LAYERS: readonly ["overlay", "administrative"];
export type PrivilegedCompositionLayer = typeof PRIVILEGED_LAYERS[number];
export type WindowCompositionLayer = UserspaceAccessibleCompositionLayer | PrivilegedCompositionLayer;
/**
 * How the RPC layer accesses the userspace proxy of another program's window: these members read synchronously, everything else goes to the kernel.
 * @hidden
 */
export declare const USERSPACE_OTHER_WINDOW_ANNOTATIONS: {
    readonly id: "constant";
    readonly owner_pid: "constant";
    readonly manager: "eager_handle";
    readonly title: "mirrored";
    readonly width: "mirrored";
    readonly height: "mirrored";
    readonly x: "mirrored";
    readonly y: "mirrored";
    readonly visible: "mirrored";
    readonly maximised: "mirrored";
    readonly maximisable: "mirrored";
    readonly layer: "mirrored";
};
export interface UserspaceOtherWindow {
    /** @hidden */
    readonly [sync_members]?: (member: keyof typeof USERSPACE_OTHER_WINDOW_ANNOTATIONS) => void;
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
    readonly maximisable: boolean;
    readonly layer: WindowCompositionLayer;
}
/**
 * How the RPC layer accesses the userspace proxy of a program's own window: these members read synchronously, everything else goes to the kernel.
 * @hidden
 */
export declare const USERSPACE_WINDOW_ANNOTATIONS: {
    readonly id: "constant";
    readonly owner_pid: "constant";
    readonly manager: "eager_handle";
    readonly dom: (this: any) => ShadowRoot;
    readonly title: "mirrored";
    readonly width: "mirrored";
    readonly height: "mirrored";
    readonly x: "mirrored";
    readonly y: "mirrored";
    readonly visible: "mirrored";
    readonly maximised: "mirrored";
    readonly maximisable: "mirrored";
    readonly layer: "mirrored";
};
export interface UserspaceWindow extends UserspaceOtherWindow {
    /** @hidden */
    readonly [sync_members]?: (member: keyof typeof USERSPACE_WINDOW_ANNOTATIONS) => void;
    readonly manager: UserspaceWindowManager;
    readonly dom: ShadowRoot;
    title: string;
    width: string;
    height: string;
    x: string | number;
    y: string | number;
    visible: boolean;
    maximised: boolean;
    maximisable: boolean;
    readonly layer: WindowCompositionLayer;
    request_layer(new_layer: UserspaceAccessibleCompositionLayer): void;
    center(): void;
    focus(): void;
    show(): void;
    hide(): void;
    toggle(): void;
    close(): void;
    add_event_listener(event: WindowEvent, callback: () => void): void;
    wait_for_event(event: WindowEvent): Promise<void>;
    get_custom_flag(flag: string): boolean;
    set_custom_flag(flag: string, value: boolean): void;
}
/**
 * To implement in a package, use {@link https://ollieg.codes/docs/Program_Types/ProgramMainData.html#sdk sdk.AbstractWindow} passed via program main data.
 *
 * @group Kernel (Privileged)
 * @category Windowing
 */
export declare abstract class AbstractWindow implements MirrorSource {
    readonly [mirror_source]: true;
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
    abstract get layer(): WindowCompositionLayer;
    abstract request_layer(new_layer: WindowCompositionLayer): void;
    abstract force_z_index(new_z_index: number): void;
    create_userspace_proxy_as_other_window(): UserspaceOtherWindow;
    create_userspace_proxy_as_full_window(): UserspaceWindow;
}
/**
 * Size of the area windows can occupy, in CSS pixels.
 */
export interface ScreenSize {
    width: number;
    height: number;
}
/**
 * How the RPC layer accesses the window manager's userspace proxy: these members read synchronously, everything else goes to the kernel.
 * @hidden
 */
export declare const USERSPACE_WINDOW_MANAGER_ANNOTATIONS: {
    readonly get_unique_manager_type_name: "constant";
    readonly get_screen_size: "mirrored";
};
export interface UserspaceWindowManager {
    /** @hidden */
    readonly [sync_members]?: (member: keyof typeof USERSPACE_WINDOW_MANAGER_ANNOTATIONS) => void;
    get_unique_manager_type_name(): string;
    /**
     * Size of the area windows can occupy, in CSS pixels. Read synchronously, and kept up to date as it changes.
     */
    get_screen_size(): ScreenSize;
    get_all_windows(): UserspaceOtherWindow[];
    get_window_by_id(id: number): UserspaceOtherWindow | null;
}
/**
 * To implement in a package, use {@link https://ollieg.codes/docs/Program_Types/ProgramMainData.html#sdk sdk.AbstractWindowManager} passed via program main data.
 *
 * @group Kernel (Privileged)
 * @category Windowing
 */
export declare abstract class AbstractWindowManager implements MirrorSource {
    readonly [mirror_source]: true;
    abstract get_unique_manager_type_name(): string;
    /**
     * Size of the area windows can occupy, in CSS pixels. Implementations call notify_mirror_change(this) when it changes.
     */
    abstract get_screen_size(): ScreenSize;
    abstract get Window(): new (owner_pid: number) => AbstractWindow;
    abstract get_all_windows(): AbstractWindow[];
    abstract get_window_by_id(id: number): AbstractWindow | null;
    abstract dispose_all(): void;
    create_userspace_proxy(): UserspaceWindowManager;
}
export {};
