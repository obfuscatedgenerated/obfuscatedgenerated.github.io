import type { SyncProgram } from "../types";
import { ANSI } from "../term_ctl";

const type_suffixes = {
    bug: "?assignees=&labels=awaiting+effort+estimate%2C+awaiting+triage%2C+bug%2C+unreviewed&template=bug-report-%F0%9F%90%9B.md&title=%5B%F0%9F%90%9B%5D+-+Descriptive%2C+short+title",
    feature: "?assignees=&labels=awaiting+effort+estimate%2C+awaiting+triage%2C+feature%2C+unreviewed&template=feature-request-%F0%9F%92%A1.md&title=%5B%F0%9F%92%A1%5D+-+Descriptive%2C+short+title",
    other: "/choose",
}

export default {
    name: "bugreport",
    description: "Opens the bug reporter.",
    usage_suffix: "[bug|feature|other]",
    arg_descriptions: {
        bug: "Opens the bug reporter with the bug report template.",
        feature: "Opens the bug reporter with the feature request template.",
        other: "Opens the bug reporter with the template chooser (default).",
    },
    main: (data) => {
        // extract from data to make code less verbose
        const { term, args } = data;

        // extract from ANSI to make code less verbose
        const { STYLE, PREFABS } = ANSI;

        // if no arguments are provided, default to bug
        let type = "other";
        if (args.length > 0) {
            type = args[0].toLowerCase();

            // check if the type is valid (don't use in, it won't filter __proto__ etc.)
            if (!Object.keys(type_suffixes).includes(type)) {
                term.writeln(`${PREFABS.error} Invalid type: ${type}. Please choose bug, feature, or other.${STYLE.reset_all}`);
                return 1;
            }
        }

        window.open(`https://github.com/obfuscatedgenerated/obfuscatedgenerated.github.io/issues/new${type_suffixes[type]}`, "_blank", "");

        term.writeln("Opened bug reporter in a new tab.");

        return 0;
    }
} as SyncProgram;