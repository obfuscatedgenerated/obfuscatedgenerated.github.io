import {AbstractWindow, AbstractWindowManager, WindowEvent} from "../windowing";

export class DOMWindowManager extends AbstractWindowManager {
    private top_z_index = 10;

    private _window_id_counter = 1;
    private _window_map: Map<number, AbstractWindow> = new Map();

    private readonly _WindowClass: new () => AbstractWindow;

    get_unique_manager_type_name(): string {
        return "DOM";
    }

    get Window() {
        return this._WindowClass;
    }

    get_all_windows = () => {
        return Array.from(this._window_map.values());
    }

    get_window_by_id = (id: number) => {
        return this._window_map.get(id) || null;
    }

    constructor() {
        super();

        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const manager = this;

        class DOMWindow extends AbstractWindow {
            private readonly _manager = manager;

            private readonly _window_id: number;

            private readonly _window_root: HTMLDivElement;
            private readonly _window_top_bar: HTMLDivElement;
            private readonly _window_top_bar_title: HTMLSpanElement;

            private readonly _content_host: HTMLDivElement;
            private readonly _shadow_dom: ShadowRoot;

            private readonly _event_listeners: Map<WindowEvent, Array<() => Promise<void>>> = new Map();

            private _title_text = "New Window";

            moveable = true;
            resizable = true;

            private readonly _custom_flags: Set<string> = new Set();

            get manager() {
                return this._manager;
            }

            constructor() {
                super();

                this._window_id = manager._window_id_counter++;

                // contains the entire window
                this._window_root = document.createElement("div");
                this._window_root.classList.add("window");
                this._window_root.role = "dialog";
                this._window_root.ariaHidden = "true";
                this._window_root.id = `window-${this._window_id}`;
                document.body.appendChild(this._window_root);

                this._window_root.style.zIndex = manager.top_z_index.toString();
                this._window_root.addEventListener("mousedown", () => this.focus(), { capture: true });
                window.addEventListener("blur", () => this._handle_window_blur());

                // draggable top bar containing title and controls
                this._window_top_bar = document.createElement("div");
                this._window_top_bar.classList.add("window-top-bar");
                this._window_root.appendChild(this._window_top_bar);

                this._window_top_bar_title = document.createElement("span");
                this._window_top_bar_title.classList.add("window-top-bar-title");
                this._window_top_bar_title.innerText = this._title_text;
                this._window_top_bar_title.id = `${this._window_root.id}-title`;
                this._window_top_bar.appendChild(this._window_top_bar_title);
                this._window_root.setAttribute("aria-labelledby", this._window_top_bar_title.id);

                const top_bar_controls = document.createElement("div");
                top_bar_controls.classList.add("window-top-bar-controls");
                this._window_top_bar.appendChild(top_bar_controls);

                const minimise_button = document.createElement("button");
                minimise_button.title = "Minimise window";
                minimise_button.classList.add("window-button", "window-minimise-button");
                minimise_button.innerText = "−";
                minimise_button.addEventListener("click", () => this.hide());

                // TODO: maximise/restore button

                const close_button = document.createElement("button");
                close_button.title = "Close window";
                close_button.classList.add("window-button", "window-close-button");
                close_button.innerText = "×";
                close_button.addEventListener("click", this.close.bind(this));

                top_bar_controls.appendChild(minimise_button);
                top_bar_controls.appendChild(close_button);

                this._window_top_bar.addEventListener("mousedown", (e) => this._start_drag(e));

                // hosts the shadow dom where programs can add their content
                this._content_host = document.createElement("div");
                this._content_host.classList.add("window-content-host");

                this._shadow_dom = this._content_host.attachShadow({ mode: "closed" });

                this._window_root.appendChild(this._content_host);

                // TODO: resize handles
                // TODO: way to prevent windows existing when the program that created them exits? or is that not needed? theyll have to run background tasks to allow multitasking anyway

                manager._window_map.set(this._window_id, this);
            }

            get id() {
                return this._window_id;
            }

            dispose() {
                this._window_root.remove();
                manager._window_map.delete(this._window_id);
            }

            close() {
                this._emit_event("close");
                this.dispose();
            }

            focus() {
                this._emit_event("focus");

                manager.top_z_index += 1;
                this._window_root.style.zIndex = manager.top_z_index.toString();
            }

            private _handle_window_blur() {
                // TODO: fix for when focus jumps between iframes inside the window, this doesnt fire in that case

                setTimeout(() => {
                    if (document.activeElement === this._content_host) {
                        this.focus();
                    }
                }, 0);
            }

            private async _emit_event(event: WindowEvent) {
                if (!this._event_listeners.has(event)) {
                    return;
                }

                const listeners = this._event_listeners.get(event)!;
                await Promise.all(listeners.map(callback => callback()));
            }

            private _start_drag(e: MouseEvent) {
                if (!this.moveable) {
                    return;
                }

                this._content_host.classList.add("dragging");

                e.preventDefault();

                const rect = this._window_root.getBoundingClientRect();
                const offset_x = e.clientX - rect.left;
                const offset_y = e.clientY - rect.top;

                const mouse_move = (event: MouseEvent) => {
                    event.preventDefault();

                    this._window_root.style.left = `${event.clientX - offset_x}px`;
                    this._window_root.style.top = `${event.clientY - offset_y}px`;

                    this._emit_event("move");
                };

                const mouse_up = () => {
                    document.removeEventListener("mousemove", mouse_move);
                    document.removeEventListener("mouseup", mouse_up);

                    this._content_host.classList.remove("dragging");
                };

                document.addEventListener("mousemove", mouse_move);
                document.addEventListener("mouseup", mouse_up);
            }

            add_event_listener(event: WindowEvent, callback: () => Promise<void>) {
                if (!this._event_listeners.has(event)) {
                    this._event_listeners.set(event, []);
                }

                this._event_listeners.get(event)!.push(callback);
            }

            remove_event_listener(event: WindowEvent, callback: () => Promise<void>) {
                if (!this._event_listeners.has(event)) {
                    return;
                }

                const listeners = this._event_listeners.get(event)!;
                const index = listeners.indexOf(callback);
                if (index !== -1) {
                    listeners.splice(index, 1);
                }
            }

            get title() {
                return this._title_text;
            }

            set title(new_title: string) {
                this._window_top_bar_title.innerText = new_title;
                this._title_text = new_title;

                this._emit_event("rename");
            }

            set width(css_width: string) {
                this._window_root.style.width = css_width;
            }

            set height(css_height: string) {
                this._window_root.style.height = css_height;
            }

            set x(css_pos: string | number) {
                if (typeof css_pos === "number") {
                    css_pos = `${css_pos}px`;
                }

                this._window_root.style.left = css_pos;
            }

            set y(css_pos: string | number) {
                if (typeof css_pos === "number") {
                    css_pos = `${css_pos}px`;
                }

                this._window_root.style.top = css_pos;
            }

            get dom() {
                return this._shadow_dom;
            }

            show() {
                this._window_root.classList.add("visible");
                this._window_root.ariaHidden = "false";

                this._emit_event("show");
            }

            hide() {
                this._window_root.classList.remove("visible");
                this._window_root.ariaHidden = "true";

                this._emit_event("hide");
            }

            toggle() {
                this._window_root.classList.toggle("visible");

                if (this.visible) {
                    this._emit_event("show");
                } else {
                    this._emit_event("hide");
                }
            }

            get visible() {
                return this._window_root.classList.contains("visible");
            }

            set visible(is_visible: boolean) {
                if (is_visible) {
                    this.show();
                } else {
                    this.hide();
                }
            }

            get_custom_flag(flag: string) {
                return this._custom_flags.has(flag);
            }

            set_custom_flag(flag: string, value: boolean) {
                if (value) {
                    this._custom_flags.add(flag);
                } else {
                    this._custom_flags.delete(flag);
                }

                switch (flag) {
                    case "transparent":
                        if (value) {
                            this._content_host.classList.add("transparent");
                        } else {
                            this._content_host.classList.remove("transparent");
                        }
                        break;
                    case "no-top-bar":
                        if (value) {
                            this._window_top_bar.classList.add("hidden");
                        } else {
                            this._window_top_bar.classList.remove("hidden");
                        }
                        break;
                }
            }
        }

        this._WindowClass = DOMWindow;
    }
}
