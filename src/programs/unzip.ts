import type { Program } from "../types";
import {ANSI} from "../lib/ansi";
import {
    ARCHIVE_FORMATS,
    type ArchiveEntry,
    type ArchiveFormat,
    detect_format,
    format_size,
    glob_to_regex,
    matches_any,
    parse_args,
    parse_format_name,
    read_archive,
    safe_path_parts,
    savings_percent,
} from "../lib/archive";

const BOOLEAN_FLAGS = "hltpojq";
const VALUE_FLAGS = "dfx";

const text_decoder = new TextDecoder();

// right aligns each entry's status, as unzip does
const status = (label: string) => `${label.padStart(11)}: `;

const format_date = (date: Date): string => {
    const pad = (value: number) => value.toString().padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export default {
    name: "unzip",
    description: "Extracts, lists or tests zip, tar, tar.gz and gzip archives.",
    usage_suffix: "[-h] [-l | -t | -p] [-o] [-j] [-q] [-f format] [-d dir] [-x pattern]... archive [member...]",
    arg_descriptions: {
        "Arguments:": {
            "archive": "The archive to read. Its format is detected from its contents.",
            "member": "Only use entries matching these glob patterns (* and ?), by full path or file name."
        },
        "Flags:": {
            "-h": "Print this help message.",
            "-l": "List the archive's contents instead of extracting.",
            "-t": "Test the archive: decompress every entry and check its checksum, without writing anything.",
            "-p": "Print the contents of the matching files to the terminal instead of extracting.",
            "-o": "Overwrite existing files (by default they are skipped).",
            "-j": "Junk paths: extract every file straight into the destination, without its directories.",
            "-q": "Quiet: only print errors and warnings.",
            "-f format": `Read as this format instead of detecting it: ${ARCHIVE_FORMATS.join(", ")}.`,
            "-d dir": "Extract into this directory (created if needed). Defaults to the current directory.",
            "-x pattern": "Leave out entries matching a glob pattern. Can be repeated."
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
            const spawn_result = await kernel.spawn("help", ["unzip"], shell);
            const exit_code = await spawn_result.completion;
            spawn_result.process.kill(exit_code);
            return exit_code;
        }

        const modes = ["l", "t", "p"].filter((mode) => flags.has(mode));
        if (modes.length > 1) {
            term.writeln(`${PREFABS.error}Choose only one of -l, -t and -p.${STYLE.reset_all}`);
            return 1;
        }

        if (positional.length === 0) {
            term.writeln(`${PREFABS.error}An archive path is required. Run unzip -h for usage.${STYLE.reset_all}`);
            return 1;
        }

        const [archive_arg, ...member_args] = positional;
        const includes = member_args.map(glob_to_regex);
        const excludes = (values.get("x") ?? []).map(glob_to_regex);
        const overwrite = flags.has("o");
        const junk_paths = flags.has("j");
        const quiet = flags.has("q");

        const archive_path = fs.absolute(archive_arg);

        if (await fs.dir_exists(archive_path)) {
            term.writeln(`${PREFABS.error}Cannot read a directory: ${archive_path}${STYLE.reset_all}`);
            return 1;
        }

        if (!(await fs.exists(archive_path))) {
            term.writeln(`${PREFABS.error}File not found: ${archive_path}${STYLE.reset_all}`);
            return 1;
        }

        let entries: ArchiveEntry[];
        try {
            const content = await fs.read_file(archive_path, true) as Uint8Array;

            let format: ArchiveFormat | null;
            const format_arg = values.get("f")?.at(-1);
            if (format_arg !== undefined) {
                format = parse_format_name(format_arg);
                if (format === null) {
                    term.writeln(`${PREFABS.error}Unknown format: ${format_arg}. Choose from ${ARCHIVE_FORMATS.join(", ")}.${STYLE.reset_all}`);
                    return 1;
                }
            } else {
                format = await detect_format(content);
                if (format === null) {
                    term.writeln(`${PREFABS.error}Not a recognised archive: ${archive_path}. Use -f to force a format.${STYLE.reset_all}`);
                    return 1;
                }
            }

            // a gzip that doesn't store its file's name is named after the archive, without .gz
            const archive_name = archive_path.split("/").pop()!;
            const fallback_name = /\.gz$/i.test(archive_name) ? archive_name.replace(/\.gz$/i, "") : `${archive_name}.out`;

            entries = await read_archive(format, content, fallback_name);
        } catch (e) {
            term.writeln(`${PREFABS.error}Cannot read ${archive_path}: ${(e as Error).message}${STYLE.reset_all}`);
            return 1;
        }

        const selected = entries.filter((entry) =>
            (includes.length === 0 || matches_any(entry.path, includes)) && !matches_any(entry.path, excludes)
        );

        if (selected.length === 0) {
            term.writeln(`${PREFABS.error}No matching entries in ${archive_path}.${STYLE.reset_all}`);
            return 1;
        }

        if (flags.has("l")) {
            term.writeln(`${FG.blue}${"Size".padStart(10)}  ${"Packed".padStart(10)}  ${"Saved".padStart(5)}  ${"Method".padEnd(8)}  ${"Modified".padEnd(16)}  Name${STYLE.reset_all}`);

            let total_size = 0;
            let total_packed = 0;
            for (const entry of selected) {
                total_size += entry.size;
                total_packed += entry.compressed_size;

                const name = entry.is_dir ? `${PREFABS.dir_name}${entry.path}${STYLE.reset_all}` : entry.path;
                term.writeln(`${format_size(entry.size).padStart(10)}  ${format_size(entry.compressed_size).padStart(10)}  ${`${savings_percent(entry.size, entry.compressed_size)}%`.padStart(5)}  ${entry.method.padEnd(8)}  ${format_date(entry.modified)}  ${name}`);
            }

            term.writeln(`${FG.blue}${format_size(total_size).padStart(10)}  ${format_size(total_packed).padStart(10)}  ${`${savings_percent(total_size, total_packed)}%`.padStart(5)}  ${selected.length} entries${STYLE.reset_all}`);
            return 0;
        }

        if (flags.has("t")) {
            let failures = 0;
            for (const entry of selected) {
                if (entry.is_dir) {
                    continue;
                }

                try {
                    await entry.read();
                    if (!quiet) {
                        term.writeln(`${status("testing")}${entry.path}  ${FG.green}OK${STYLE.reset_all}`);
                    }
                } catch (e) {
                    failures++;
                    term.writeln(`${status("testing")}${entry.path}  ${PREFABS.error}FAILED${STYLE.reset_all} (${(e as Error).message})`);
                }
            }

            if (failures > 0) {
                term.writeln(`${PREFABS.error}${failures} entr${failures === 1 ? "y" : "ies"} failed in ${archive_path}.${STYLE.reset_all}`);
                return 1;
            }

            if (!quiet) {
                term.writeln(`No errors detected in ${archive_path}.`);
            }
            return 0;
        }

        if (flags.has("p")) {
            for (const entry of selected) {
                if (entry.is_dir) {
                    continue;
                }

                try {
                    term.write(text_decoder.decode(await entry.read()));
                } catch (e) {
                    term.writeln(`${PREFABS.error}Cannot read ${entry.path}: ${(e as Error).message}${STYLE.reset_all}`);
                    return 1;
                }
            }
            return 0;
        }

        const destination = values.has("d") ? fs.absolute(values.get("d")!.at(-1)!) : fs.get_cwd();

        try {
            if (!(await fs.dir_exists(destination))) {
                if (await fs.exists(destination)) {
                    term.writeln(`${PREFABS.error}Destination is a file: ${destination}${STYLE.reset_all}`);
                    return 1;
                }
                await fs.make_dir(destination);
            }
        } catch (e) {
            term.writeln(`${PREFABS.error}Cannot create ${destination}: ${(e as Error).message}${STYLE.reset_all}`);
            return 1;
        }

        if (!quiet) {
            term.writeln(`Archive: ${PREFABS.file_path}${archive_path}${STYLE.reset_all}`);
        }

        let failures = 0;
        let skipped = 0;

        for (const entry of selected) {
            const parts = safe_path_parts(entry.path);

            // refuse anything that would land outside the destination (zip slip)
            if (parts === null || parts.length === 0) {
                failures++;
                term.writeln(`${FG.yellow}warning:${STYLE.reset_all} unsafe path, skipping: ${entry.path}`);
                continue;
            }

            if (entry.is_dir) {
                if (!junk_paths) {
                    try {
                        await fs.make_dir(fs.join(destination, ...parts));
                        if (!quiet) {
                            term.writeln(`${status("creating")}${entry.path}`);
                        }
                    } catch (e) {
                        failures++;
                        term.writeln(`${PREFABS.error}Cannot create ${entry.path}: ${(e as Error).message}${STYLE.reset_all}`);
                    }
                }
                continue;
            }

            const target_parts = junk_paths ? [parts[parts.length - 1]] : parts;
            const target = fs.join(destination, ...target_parts);

            try {
                if (await fs.dir_exists(target)) {
                    failures++;
                    term.writeln(`${FG.yellow}warning:${STYLE.reset_all} a directory is in the way, skipping: ${target}`);
                    continue;
                }

                if (!overwrite && await fs.exists(target)) {
                    skipped++;
                    if (!quiet) {
                        term.writeln(`${status("skipping")}${entry.path} (exists, use -o to overwrite)`);
                    }
                    continue;
                }

                const content = await entry.read();

                if (target_parts.length > 1) {
                    await fs.make_dir(fs.join(destination, ...target_parts.slice(0, -1)));
                }

                await fs.write_file(target, content);

                if (!quiet) {
                    term.writeln(`${status(entry.method === "deflated" ? "inflating" : "extracting")}${target_parts.join("/")}`);
                }
            } catch (e) {
                failures++;
                term.writeln(`${PREFABS.error}Cannot extract ${entry.path}: ${(e as Error).message}${STYLE.reset_all}`);
            }
        }

        if (!quiet && skipped > 0) {
            term.writeln(`${skipped} existing file(s) skipped.`);
        }

        return failures > 0 ? 1 : 0;
    }
} satisfies Program;
