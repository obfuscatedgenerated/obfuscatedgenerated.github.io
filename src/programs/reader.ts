import { ANSI } from "../kernel/term_ctl";
import type { Program } from "../types";
import {helper_completion_options} from "./core/ash/tab_completion";

export default {
    name: "reader",
    description: "Toggles screen reader mode. Due to a technical limitation, on-screen links will not be clickable in screen reader mode.",
    usage_suffix: "[-h] [-q] [-s on|off]",
    arg_descriptions: {
        "Flags:": {
            "-h": "Show this help message.",
            "-q": "Query the current screen reader mode.",
            "-s": "Explicitly set the screen reader mode to on or off, rather than toggling it."
        }
    },
    node_opt_out: true,
    compat: "2.0.0",
    completion: async (data) => {
        if (data.arg_index === 0) {
            return helper_completion_options(["-h", "-q", "-s"])(data);
        }

        if (data.arg_index === 1 && data.args[0] === "-s") {
            return helper_completion_options(["on", "off"])(data);
        }

        return [];
    },
    main: async (data) => {
        // extract from data to make code less verbose
        const { kernel, shell, args, term } = data;

        // extract from ANSI to make code less verbose
        const { PREFABS, STYLE } = ANSI;

        if (!term.supports_custom_flag("reader_support")) {
            term.writeln(`${PREFABS.error}Your terminal does not support configuring screen reader mode. Either it supports it by default, or it does not support it at all.${STYLE.reset_all}`);
            return 1;
        }

        // get sound registry
        const sfx_reg = kernel.get_sound_registry();

        switch (args[0]) {
            case "-h":
                return await kernel.spawn("help", ["clear"], shell).completion;
            case "-q":
                // query screen reader mode
                term.writeln(`Screen reader mode is currently ${term.get_custom_flag("reader_support") ? "on" : "off"}.`);
                return 0;
            case "-s":
                // set screen reader mode
                switch (args[1]) {
                    case "on":
                        term.set_custom_flag("reader_support", true);
                        break;
                    case "off":
                        term.set_custom_flag("reader_support", false);
                        break;
                    default:
                        term.writeln("Invalid argument. Expected \"on\" or \"off\".");
                        return 1;
                }
                break;
            default:
                // toggle screen reader mode
                term.set_custom_flag("reader_support", !term.get_custom_flag("reader_support"));
        }

        const state = term.get_custom_flag("reader_support") ? "on" : "off";

        // play sound
        const sound_name = `reader_${state}`;
        sfx_reg.wait_to_play(sound_name);

        // print message
        term.writeln(`Screen reader mode was turned ${state}. This setting is saved in your browser's local storage. Use the ${PREFABS.program_name}reader${STYLE.reset_all} command to toggle it.`);

        // remove hint element if screen reader mode is on
        if (state === "on") {
            const hint = document.querySelector("#screenreader_hint");

            if (hint) {
                hint.remove();
            }
        }

        // save into local storage
        localStorage.setItem("reader", term.get_custom_flag("reader_support").toString());

        return 0;
    }
} as Program;
