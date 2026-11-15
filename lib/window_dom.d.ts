/**
 * Called by the isothread entry when it runs inside a frame, where the window's content is the frame's own document.
 */
export declare const set_frame_dom: (root: ShadowRoot) => void;
export declare const window_dom: (this: any) => ShadowRoot;
