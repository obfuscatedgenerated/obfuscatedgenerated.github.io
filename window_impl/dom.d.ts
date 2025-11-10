import { AbstractWindow, AbstractWindowManager } from "../windowing";
export declare class DOMWindowManager extends AbstractWindowManager {
    private top_z_index;
    private _window_id_counter;
    private _window_map;
    private readonly _WindowClass;
    get_unique_manager_type_name(): string;
    get Window(): new () => AbstractWindow;
    get_all_windows: () => AbstractWindow[];
    get_window_by_id: (id: number) => AbstractWindow;
    constructor();
}
