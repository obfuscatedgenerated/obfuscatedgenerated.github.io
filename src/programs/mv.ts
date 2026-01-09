import type { Program } from "../types";
import { ANSI } from "../term_ctl";

export default {
    name: "mv",
    description: "Moves files and directories.",
    usage_suffix: "[-n] source destination",
    arg_descriptions: {
        "Arguments:": {
            "source": "The file or directory to move.",
            "destination": "The new location for the file or directory.",
            "-n": "Do not overwrite an existing file."
        }
    },
    main: async (data) => {
        // extract from data to make code less verbose
        const { kernel, args, term } = data;

        // extract from ANSI to make code less verbose
        const { PREFABS, STYLE, FG } = ANSI;

        // get fs
        const fs = kernel.get_fs();

        // check for -n
        let no_overwrite = false;
        //if (args.includes("-n")) {
            // TODO: why do programs care about flag order? should they?
            //// remove -n from args
            //args.splice(args.indexOf("-n"), 1);
        if (args[0] === "-n") {
            no_overwrite = true;
            args.shift();
        }

        // get source and destination
        const source = fs.absolute(args[0]);
        let destination = fs.absolute(args[1]);

        // check if source exists
        if (!(await fs.exists(source))) {
            term.writeln(`${PREFABS.error}No such file or directory: ${source}${STYLE.reset_all}`);
            return 1;
        }

        const ended_with_slash = destination.endsWith("/");
        const dest_is_dir = await fs.dir_exists(destination);

        // if destination is a directory and ending with a slash, append the basename of source to destination
        if (dest_is_dir && ended_with_slash) {
            const basename = source.split("/").pop() as string;
            destination = fs.join(destination, basename);
        }

        // check if destination exists if -n is passed OR we are moving a FILE (not a directory) into a DIRECTORY ending specifically with /
        // TODO: there must be a way to adjust logic of the fs functions to make this check unnecessary or simpler. oh well.
        const do_exists_check = no_overwrite || (dest_is_dir && !(await fs.dir_exists(source)) && ended_with_slash);
        if (do_exists_check && await fs.exists(destination)) {
            term.writeln(`${PREFABS.error}File or directory already exists: ${destination}${STYLE.reset_all}`);
            return 1;
        }

        // move source to destination
        // TODO: abstractfilesystem should have a file_exists function so we don't have to check if it's a directory first
        if (await fs.dir_exists(source)) {
            // temporary warning
            term.writeln(`${FG.yellow + STYLE.bold}Warning: Moving directories is not fully supported yet. Some features may not work as expected! The operation will be performed anyway.${STYLE.reset_all}`);

            // move inside if ended with slash OR the destination is a directory that already exists
            // TODO: is this correct???? maybe???
            const move_inside = ended_with_slash || (dest_is_dir && await fs.dir_exists(destination));
            await fs.move_dir(source, destination, no_overwrite, move_inside);
        } else if (await fs.exists(source)) {
            await fs.move_file(source, destination);
        } else {
            term.writeln(`${PREFABS.error}Source is neither a file nor a directory: ${source}${STYLE.reset_all}`);
            return 1;
        }

        return 0;
    }
} as Program;
