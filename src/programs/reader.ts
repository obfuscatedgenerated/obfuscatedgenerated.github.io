import type { SyncProgram } from "../types";

export default {
    name: "reader",
    description: "Toggles screen reader mode. Due to a technical limitation, on-screen links will not be clickable in screen reader mode.",
    usage_suffix: "[-q] [-s on|off]",
    flags: {
        "-q": "Query the current screen reader mode.",
        "-s": "Explicitly set the screen reader mode to on or off, rather than toggling it."
    },
    main: (data) => {
        // extract from data to make code less verbose
        const { args, term } = data;

        switch (args[0]) {
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

        // print message
        term.writeln(`Screen reader mode was turned ${term.options.screenReaderMode ? "on" : "off"}. This setting is saved in your browser's local storage.`);

        // remove hint element if screen reader mode is on
        if (term.options.screenReaderMode) {
            const hint = document.querySelector("#screenreader_hint");
            hint.remove();
        }

        // save into local storage
        localStorage.setItem("reader", term.options.screenReaderMode.toString());

        return 0;
    }
} as SyncProgram;