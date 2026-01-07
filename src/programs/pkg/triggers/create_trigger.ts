import type { Program } from "../../../types";

export default {
    name: "trigger_create_trigger",
    description: "A trigger to create another trigger. Use this trigger to deploy custom triggers!",
    usage_suffix: "pkg_name pkg_version trigger_file",
    arg_descriptions: {
        "Arguments:": {
            "pkg_name": "The name of the package creating the trigger, which will namespace the trigger. Passed automatically by the package manager.",
            "pkg_version": "Ignored. Passed automatically by the package manager.",
            "trigger_file": "The path to the trigger file to create. This is the string that you pass into the create_trigger trigger in your package's meta.json triggers section."
        }
    },
    hide_from_help: true,
    completion: async () => [],
    main: async (data) => {
        // extract from data to make code less verbose
        const { args, term } = data;

        if (args.length !== 3) {
            term.writeln("Usage: trigger_create_trigger pkg_name pkg_version trigger_file");
            return 1;
        }

        const fs = term.get_fs();

        const pkg_name = args[0];
        const trigger_file = args[2];

        // trigger must end with .json
        if (!trigger_file.endsWith(".json")) {
            term.writeln("Error: Trigger file must end with .json");
            return 1;
        }

        // source path will be /usr/bin/PKG_NAME/TRIGGER_FILE
        const source_path = fs.join("/usr/bin", pkg_name, trigger_file);

        // check the path is valid
        if (!await fs.exists(source_path)) {
            term.writeln(`Error: Trigger file not found at ${source_path}`);
            return 1;
        }

        // destination path will be /var/lib/pkg/triggers/PKG_NAME/TRIGGER_FILE
        const dest_path = fs.join("/var/lib/pkg/triggers", pkg_name, trigger_file);

        // check the destination path does not already exist
        if (await fs.exists(dest_path)) {
            term.writeln(`Error: Trigger file already exists at ${dest_path}.`);
            return 1;
        }

        // copy the trigger file to the destination
        // TODO: make fs support copy operation
        const content = await fs.read_file(source_path);
        await fs.write_file(dest_path, content);

        term.writeln(`Trigger created at ${dest_path}`);

        return 0;
    }
} as Program;

// TODO: way to pass trigger data as json and identify it. then a way to pass just program name to use as both create and remove trigger?
