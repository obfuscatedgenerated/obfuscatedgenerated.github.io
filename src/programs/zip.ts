import type { Program } from "../types";
import {ANSI} from "../lib/ansi";
import {
    ARCHIVE_FORMATS,
    ArchiveError,
    type ArchiveFormat,
    type ArchiveInput,
    FORMAT_EXTENSIONS,
    format_from_name,
    format_size,
    glob_to_regex,
    matches_any,
    parse_args,
    parse_format_name,
    savings_percent,
    write_archive,
} from "../lib/archive";

const BOOLEAN_FLAGS = "hrj0nq";
const VALUE_FLAGS = "fox";

export default {
    name: "zip",
    description: "Packs files and directories into a zip, tar, tar.gz or gzip archive.",
    usage_suffix: "[-h] [-r] [-j] [-0] [-n] [-q] [-f format] [-o output] [-x pattern]... path...",
    arg_descriptions: {
        "Arguments:": {
            "path": "Files or directories to add. Directories need -r."
        },
        "Flags:": {
            "-h": "Print this help message.",
            "-r": "Recurse into directories.",
            "-j": "Junk paths: store only file names, without their directories.",
            "-0": "Store files without compressing them (zip only).",
            "-n": "Do not overwrite an existing archive.",
            "-q": "Quiet: only print errors.",
            "-f format": `Archive format: ${ARCHIVE_FORMATS.join(", ")}. Defaults to the output's extension, otherwise zip. gz holds a single file.`,
            "-o output": "Path of the archive to write. Defaults to the first path's name with the format's extension, in the current directory.",
            "-x pattern": "Leave out paths matching a glob pattern (* and ?), by full path or file name. Can be repeated."
        }
    },
    compat: "3.0.0",
    completion: async (data) => {
        const previous = data.raw_parts[data.raw_parts.length - 2];

        if (previous === "-f") {
            return ARCHIVE_FORMATS.filter((format) => format.startsWith(data.current_partial));
        }

        if (data.current_partial.startsWith("-")) {
            return [...BOOLEAN_FLAGS, ...VALUE_FLAGS].map((flag) => `-${flag}`).filter((flag) => flag.startsWith(data.current_partial));
        }

        // file paths otherwise
        return null;
    },
    main: async (data) => {
        // extract from data to make code less verbose
        const { kernel, shell, args, term } = data;

        // extract from ANSI to make code less verbose
        const { PREFABS, STYLE, FG } = ANSI;

        const fs = kernel.get_fs();

        let parsed;
        try {
            parsed = parse_args(args, BOOLEAN_FLAGS, VALUE_FLAGS);
        } catch (e) {
            term.writeln(`${PREFABS.error}${(e as Error).message}${STYLE.reset_all}`);
            return 1;
        }

        const { flags, values, positional } = parsed;

        if (flags.has("h")) {
            const spawn_result = await kernel.spawn("help", ["zip"], shell);
            const exit_code = await spawn_result.completion;
            spawn_result.process.kill(exit_code);
            return exit_code;
        }

        if (positional.length === 0) {
            term.writeln(`${PREFABS.error}At least one path to add is required. Run zip -h for usage.${STYLE.reset_all}`);
            return 1;
        }

        const recursive = flags.has("r");
        const junk_paths = flags.has("j");
        const store_only = flags.has("0");
        const no_overwrite = flags.has("n");
        const quiet = flags.has("q");
        const excludes = (values.get("x") ?? []).map(glob_to_regex);
        const output_arg = values.get("o")?.at(-1);
        const format_arg = values.get("f")?.at(-1);

        // work out the format: explicit, then from the output's extension, then zip
        let format: ArchiveFormat = "zip";
        if (format_arg !== undefined) {
            const named = parse_format_name(format_arg);
            if (named === null) {
                term.writeln(`${PREFABS.error}Unknown format: ${format_arg}. Choose from ${ARCHIVE_FORMATS.join(", ")}.${STYLE.reset_all}`);
                return 1;
            }
            format = named;
        } else if (output_arg !== undefined) {
            format = format_from_name(output_arg) ?? "zip";
        }

        if (store_only && format !== "zip") {
            term.writeln(`${PREFABS.error}-0 only applies to zip. tar is never compressed, and tgz and gz always are.${STYLE.reset_all}`);
            return 1;
        }

        // name the output after the first path when not given
        let output_path: string;
        if (output_arg !== undefined) {
            output_path = fs.absolute(output_arg);
        } else {
            const first_name = fs.absolute(positional[0]).replace(/\/+$/, "").split("/").pop() || "archive";
            output_path = fs.join(fs.get_cwd(), first_name + FORMAT_EXTENSIONS[format]);
        }

        if (await fs.dir_exists(output_path)) {
            term.writeln(`${PREFABS.error}Output is a directory: ${output_path}${STYLE.reset_all}`);
            return 1;
        }

        if (no_overwrite && await fs.exists(output_path)) {
            term.writeln(`${PREFABS.error}Archive already exists: ${output_path}${STYLE.reset_all}`);
            return 1;
        }

        const output_parent = output_path.slice(0, output_path.lastIndexOf("/")) || "/";
        if (!(await fs.dir_exists(output_parent))) {
            term.writeln(`${PREFABS.error}No such directory: ${output_parent}${STYLE.reset_all}`);
            return 1;
        }

        // gather everything to add, keyed by its path in the archive
        const inputs: ArchiveInput[] = [];
        const seen_paths = new Set<string>();
        let had_problem = false;

        const warn = (message: string) => {
            had_problem = true;
            term.writeln(`${FG.yellow}warning:${STYLE.reset_all} ${message}`);
        };

        const add = (input: ArchiveInput) => {
            if (seen_paths.has(input.path)) {
                warn(`${input.path} was given more than once, keeping the first.`);
                return;
            }
            seen_paths.add(input.path);
            inputs.push(input);
        };

        const collect = async (absolute_path: string, archive_path: string): Promise<void> => {
            if (matches_any(archive_path, excludes)) {
                return;
            }

            if (await fs.dir_exists(absolute_path)) {
                if (!recursive) {
                    warn(`${absolute_path} is a directory, skipping it (use -r to include directories).`);
                    return;
                }

                if (!junk_paths) {
                    add({ path: `${archive_path}/`, data: null });
                }

                let children: string[];
                try {
                    children = await fs.list_dir(absolute_path);
                } catch (e) {
                    warn(`Cannot read directory ${absolute_path}: ${(e as Error).message}`);
                    return;
                }

                for (const child of children) {
                    await collect(fs.join(absolute_path, child), `${archive_path}/${child}`);
                }
                return;
            }

            // never pack the archive into itself
            if (absolute_path === output_path) {
                return;
            }

            try {
                const content = await fs.read_file(absolute_path, true) as Uint8Array;
                add({ path: junk_paths ? archive_path.split("/").pop()! : archive_path, data: content });
            } catch (e) {
                warn(`Cannot read ${absolute_path}: ${(e as Error).message}`);
            }
        };

        for (const arg of positional) {
            const absolute_path = fs.absolute(arg);

            if (!(await fs.exists(absolute_path))) {
                warn(`No such file or directory: ${absolute_path}`);
                continue;
            }

            // each path goes in under its own name, so the archive doesn't depend on where it was made
            const root_name = absolute_path.replace(/\/+$/, "").split("/").pop() || "root";
            await collect(absolute_path, root_name);
        }

        if (inputs.length === 0) {
            term.writeln(`${PREFABS.error}Nothing to add.${STYLE.reset_all}`);
            return 1;
        }

        let result;
        try {
            result = await write_archive(format, inputs, { store_only });
        } catch (e) {
            if (e instanceof ArchiveError || (e as Error).name === "ArchiveError") {
                term.writeln(`${PREFABS.error}${(e as Error).message}${STYLE.reset_all}`);
                return 1;
            }
            throw e;
        }

        try {
            await fs.write_file(output_path, result.archive);
        } catch (e) {
            term.writeln(`${PREFABS.error}Cannot write ${output_path}: ${(e as Error).message}${STYLE.reset_all}`);
            return 1;
        }

        if (!quiet) {
            for (const entry of result.written) {
                if (format === "zip") {
                    term.writeln(`  adding: ${entry.path} (${entry.method} ${savings_percent(entry.size, entry.compressed_size)}%)`);
                } else {
                    term.writeln(`  adding: ${entry.path}`);
                }
            }

            const total_size = result.written.reduce((sum, entry) => sum + entry.size, 0);
            const file_count = result.written.filter((entry) => !entry.path.endsWith("/")).length;
            term.writeln(`${PREFABS.file_path}${output_path}${STYLE.reset_all}: ${file_count} file(s), ${format_size(total_size)} -> ${format_size(result.archive.length)} (${savings_percent(total_size, result.archive.length)}% saved)`);
        }

        return had_problem ? 1 : 0;
    }
} satisfies Program;
