import {define_local} from "./locals";

let frame_dom: ShadowRoot | null = null;

/**
 * Called by the isothread entry when it runs inside a frame, where the window's content is the frame's own document.
 */
export const set_frame_dom = (root: ShadowRoot): void => {
    frame_dom = root;
};

// a window's dom can't cross rpc, so for an isolated program it is the root of the frame the program itself runs in
export const window_dom = define_local("window.dom", function (): ShadowRoot {
    if (!frame_dom) {
        throw new Error("This program has no DOM for window content. Set needs_dom: true in its metadata so it runs in a frame instead of a worker.");
    }

    return frame_dom;
});
