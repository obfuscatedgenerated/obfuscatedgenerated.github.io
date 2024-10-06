import { ANSI } from "../term_ctl";
import type { Program } from "../types";

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
    main: async (data) => {
        // extract from data to make code less verbose
        const { args, term } = data;

        // extract from ANSI to make code less verbose
        const { PREFABS, STYLE } = ANSI;

        // get sound registry
        const sfx_reg = term.get_sound_registry();

        switch (args[0]) {
            case "-h":
                term.execute("help reader");
                return 0;
            case "-q":
                // query screen reader mode
                term.writeln(`Screen reader mode is currently ${term.options.screenReaderMode ? "on" : "off"}.`);
                return 0;
            case "-s":
                // set screen reader mode
                switch (args[1]) {
                    case "on":
                        term.options.screenReaderMode = true;
                        break;
                    case "off":
                        term.options.screenReaderMode = false;
                        break;
                    default:
                        term.writeln("Invalid argument. Expected \"on\" or \"off\".");
                        return 1;
                }
                break;
            default:
                // toggle screen reader mode
                term.options.screenReaderMode = !term.options.screenReaderMode;
        }

        const state = term.options.screenReaderMode ? "on" : "off";

        // play sound
        const sound_name = `reader_${state}`;
        sfx_reg.wait_to_play(sound_name);

        // print message
        term.writeln(`Screen reader mode was turned ${state}. This setting is saved in your browser's local storage. Use the ${PREFABS.program_name}reader${STYLE.reset_all} command to toggle it.`);

        // remove hint element if screen reader mode is on
        if (term.options.screenReaderMode) {
            const hint = document.querySelector("#screenreader_hint");

            if (hint) {
                hint.remove();
            }
        }

        // save into local storage
        localStorage.setItem("reader", term.options.screenReaderMode.toString());

        return 0;
    }
} as Program;