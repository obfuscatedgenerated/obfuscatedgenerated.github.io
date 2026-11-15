import type {KernelFuncs} from "../../types";

export type WindowAction = "show" | "hide" | "close" | "center";
export type WindowActionResult = "done" | "not_found" | "already_visible" | "already_hidden" | "invalid";

const WINDOW_ACTIONS: readonly WindowAction[] = ["show", "hide", "close", "center"];

export const kernel_funcs = {
    window_action: async ({kernel}, input: {window_id: number, action: WindowAction}): Promise<WindowActionResult> => {
        // input comes from userspace, so nothing about it is assumed
        if (typeof input !== "object" || input === null || !Number.isInteger(input.window_id) || !WINDOW_ACTIONS.includes(input.action)) {
            return "invalid";
        }

        const wind = kernel.get_window_manager()?.get_window_by_id(input.window_id);
        if (!wind) {
            return "not_found";
        }

        switch (input.action) {
            case "show":
                if (wind.visible) {
                    return "already_visible";
                }
                wind.show();
                break;
            case "hide":
                if (!wind.visible) {
                    return "already_hidden";
                }
                wind.hide();
                break;
            case "close":
                wind.close();
                break;
            case "center":
                wind.center();
                break;
        }

        return "done";
    },
} satisfies KernelFuncs;
