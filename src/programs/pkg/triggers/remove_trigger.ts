import type { Program } from "../../../types";

export default {
    name: "trigger_remove_trigger",
    description: "A trigger to remove a trigger.",
    usage_suffix: "pkg_name pkg_version trigger_file",
    arg_descriptions: {
        "Arguments:": {
            "pkg_name": "The name of the package that created the trigger, which is used to namespace the trigger. Passed automatically by the package manager.",
            "pkg_version": "Ignored. Passed automatically by the package manager.",
            "trigger_file": "The path to the trigger file to remove. This is the string that you pass into the create_trigger trigger in your package's meta.json triggers section."
        }
    },
    hide_from_help: true,
    completion: async () => [],
    main: async (data) => {
        // extract from data to make code less verbose
        const { args, term } = data;

        if (args.length !== 3) {
            term.writeln("Usage: trigger_remove_trigger pkg_name pkg_version trigger_file");
            return 1;
        }

        const fs = term.get_fs();

        const pkg_name = args[0];
        const trigger_file = JSON.parse(args[2]);

        // trigger must end with .json
        if (!trigger_file.endsWith(".json")) {
            term.writeln("Error: Trigger file must end with .json");
            return 1;
        }

        // destination path will be /var/lib/pkg/triggers/PKG_NAME/TRIGGER_FILE
        const dest_path = fs.join("/var/lib/pkg/triggers", pkg_name, trigger_file);

        // check the destination path exists
        if (!await fs.exists(dest_path)) {
            return 0;
        }

        // remove the trigger file
        await fs.delete_file(dest_path);

        term.writeln(`Trigger removed from ${dest_path}`);

        return 0;
    }
} as Program;

// TODO: should triggers support using the same program as the uninstall trigger, an just passing different arguments?
