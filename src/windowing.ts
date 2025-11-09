export type WindowEvent = "close";

export class VirtualWindow {
    private readonly _window_root: HTMLDivElement;
    private readonly _window_top_bar: HTMLDivElement;
    private readonly _window_top_bar_title: HTMLSpanElement;

    private readonly _content_host: HTMLDivElement;
    private readonly _shadow_dom: ShadowRoot;
    
    private readonly _event_listeners: Map<WindowEvent, Array<() => Promise<void>>> = new Map();

    private _title_text: string = "New Window";

    constructor() {
        this._window_root = document.createElement("div");
        this._window_root.classList.add("window");
        document.body.appendChild(this._window_root);

        this._window_top_bar = document.createElement("div");
        this._window_top_bar.classList.add("window-top-bar");
        this._window_root.appendChild(this._window_top_bar);

        this._window_top_bar_title = document.createElement("span");
        this._window_top_bar_title.classList.add("window-top-bar-title");
        this._window_top_bar_title.innerText = this._title_text;
        this._window_top_bar.appendChild(this._window_top_bar_title);

        const top_bar_controls = document.createElement("div");
        top_bar_controls.classList.add("window-top-bar-controls");
        this._window_top_bar.appendChild(top_bar_controls);

        const close_button = document.createElement("button");
        close_button.classList.add("window-close-button");
        close_button.innerText = "×";
        close_button.addEventListener("click", async () => {
            await this._emit_event("close");
            this._window_root.remove();
        });

        top_bar_controls.appendChild(close_button);

        this._content_host = document.createElement("div");
        this._content_host.classList.add("window-content-host");

        this._shadow_dom = this._content_host.attachShadow({ mode: "closed" });

        this._window_root.appendChild(this._content_host);
    }

    private async _emit_event(event: WindowEvent) {
        if (!this._event_listeners.has(event)) {
            return;
        }

        const listeners = this._event_listeners.get(event)!;
        await Promise.all(listeners.map(callback => callback()));
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
    }

    hide() {
        this._window_root.classList.remove("visible");
    }

    toggle() {
        this._window_root.classList.toggle("visible");
    }
}
