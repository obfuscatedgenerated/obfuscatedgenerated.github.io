export type ArchiveFormat = "zip" | "tar" | "tgz" | "gz";

export const ARCHIVE_FORMATS: ArchiveFormat[] = ["zip", "tar", "tgz", "gz"];

export const FORMAT_EXTENSIONS: Record<ArchiveFormat, string> = {
    zip: ".zip",
    tar: ".tar",
    tgz: ".tar.gz",
    gz: ".gz",
};

/**
 * A file or directory going into an archive. Directories have no data and their path ends with a slash.
 */
export interface ArchiveInput {
    path: string;
    data: Uint8Array | null;
    modified?: Date;
}

/**
 * A file or directory found in an archive. Its data is only decompressed when read, so listing a large archive stays cheap.
 */
export interface ArchiveEntry {
    path: string;
    is_dir: boolean;
    size: number;
    compressed_size: number;
    modified: Date;
    method: string;
    read(): Promise<Uint8Array>;
}

export interface WrittenEntry {
    path: string;
    size: number;
    compressed_size: number;
    method: string;
}

export interface ZipWriteOptions {
    store_only: boolean;
}

export class ArchiveError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "ArchiveError";
    }
}

const text_encoder = new TextEncoder();
const text_decoder = new TextDecoder();

// ---- checksums and compression ----

const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let index = 0; index < 256; index++) {
        let value = index;
        for (let bit = 0; bit < 8; bit++) {
            value = (value & 1) ? (0xEDB88320 ^ (value >>> 1)) : (value >>> 1);
        }
        table[index] = value >>> 0;
    }
    return table;
})();

export const crc32 = (data: Uint8Array): number => {
    let crc = 0xFFFFFFFF;
    for (const byte of data) {
        crc = CRC_TABLE[(crc ^ byte) & 0xFF] ^ (crc >>> 8);
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
};

const pipe_through = async (data: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> => {
    const writer = stream.writable.getWriter();

    // failures surface through the readable side, so the writer's own rejections are silenced
    writer.write(data as Uint8Array<ArrayBuffer>).catch(() => undefined);
    writer.close().catch(() => undefined);

    return new Uint8Array(await new Response(stream.readable).arrayBuffer());
};

const deflate_raw = (data: Uint8Array) => pipe_through(data, new CompressionStream("deflate-raw"));

const inflate_raw = async (data: Uint8Array): Promise<Uint8Array> => {
    try {
        return await pipe_through(data, new DecompressionStream("deflate-raw"));
    } catch (e) {
        throw new ArchiveError(`Corrupt deflate data: ${(e as Error).message}`);
    }
};

const gunzip_stream = async (data: Uint8Array): Promise<Uint8Array> => {
    try {
        return await pipe_through(data, new DecompressionStream("gzip"));
    } catch (e) {
        throw new ArchiveError(`Corrupt gzip data: ${(e as Error).message}`);
    }
};

// ---- byte helpers ----

class ByteWriter {
    readonly #chunks: Uint8Array[] = [];
    #length = 0;

    get length(): number {
        return this.#length;
    }

    bytes(data: Uint8Array): void {
        this.#chunks.push(data);
        this.#length += data.length;
    }

    u16(value: number): void {
        const chunk = new Uint8Array(2);
        new DataView(chunk.buffer).setUint16(0, value, true);
        this.bytes(chunk);
    }

    u32(value: number): void {
        const chunk = new Uint8Array(4);
        new DataView(chunk.buffer).setUint32(0, value >>> 0, true);
        this.bytes(chunk);
    }

    finish(): Uint8Array {
        const result = new Uint8Array(this.#length);
        let offset = 0;
        for (const chunk of this.#chunks) {
            result.set(chunk, offset);
            offset += chunk.length;
        }
        return result;
    }
}

const view_of = (data: Uint8Array) => new DataView(data.buffer, data.byteOffset, data.byteLength);

const check_bounds = (data: Uint8Array, offset: number, length: number, what: string) => {
    if (offset < 0 || offset + length > data.length) {
        throw new ArchiveError(`Archive is truncated (${what}).`);
    }
};

// ---- tar header helpers, also used for format detection ----

const TAR_BLOCK = 512;

const parse_octal = (field: Uint8Array): number | null => {
    const text = text_decoder.decode(field).replace(/\0.*$/s, "").trim();
    if (text.length === 0 || !/^[0-7]+$/.test(text)) {
        return null;
    }
    return parseInt(text, 8);
};

const tar_checksum = (header: Uint8Array): number => {
    let sum = 0;
    for (let index = 0; index < TAR_BLOCK; index++) {
        // the checksum field itself counts as spaces
        sum += (index >= 148 && index < 156) ? 0x20 : header[index];
    }
    return sum;
};

// ---- format detection ----

const is_tar_header = (data: Uint8Array, offset = 0): boolean => {
    if (data.length < offset + 512) {
        return false;
    }

    // ustar magic, or failing that a valid header checksum (old v7 tars have no magic)
    if (text_decoder.decode(data.subarray(offset + 257, offset + 262)) === "ustar") {
        return true;
    }

    const stored = parse_octal(data.subarray(offset + 148, offset + 156));
    return stored !== null && stored === tar_checksum(data.subarray(offset, offset + 512));
};

/**
 * Works out an archive's format from its first bytes. A gzip holding a tar is reported as tgz.
 */
export const detect_format = async (data: Uint8Array): Promise<ArchiveFormat | null> => {
    if (data.length >= 4 && data[0] === 0x50 && data[1] === 0x4B && (data[2] === 0x03 || data[2] === 0x05) && (data[3] === 0x04 || data[3] === 0x06)) {
        return "zip";
    }

    if (data.length >= 2 && data[0] === 0x1F && data[1] === 0x8B) {
        const inner = await gunzip_stream(data);
        return is_tar_header(inner) ? "tgz" : "gz";
    }

    if (is_tar_header(data)) {
        return "tar";
    }

    return null;
};

/**
 * Picks a format from a file name's extension.
 */
export const format_from_name = (name: string): ArchiveFormat | null => {
    const lower = name.toLowerCase();

    if (lower.endsWith(".tar.gz") || lower.endsWith(".tgz")) {
        return "tgz";
    }

    if (lower.endsWith(".zip")) {
        return "zip";
    }

    if (lower.endsWith(".tar")) {
        return "tar";
    }

    if (lower.endsWith(".gz")) {
        return "gz";
    }

    return null;
};

/**
 * Accepts the names people tend to type for each format.
 */
export const parse_format_name = (name: string): ArchiveFormat | null => {
    switch (name.toLowerCase().replace(/^\./, "")) {
        case "zip":
            return "zip";
        case "tar":
            return "tar";
        case "tgz":
        case "tar.gz":
        case "targz":
            return "tgz";
        case "gz":
        case "gzip":
            return "gz";
        default:
            return null;
    }
};

// ---- zip ----

const ZIP_LOCAL_SIGNATURE = 0x04034B50;
const ZIP_CENTRAL_SIGNATURE = 0x02014B50;
const ZIP_END_SIGNATURE = 0x06054B50;
const ZIP_FLAG_ENCRYPTED = 0x0001;
const ZIP_FLAG_UTF8 = 0x0800;
const ZIP_METHOD_STORE = 0;
const ZIP_METHOD_DEFLATE = 8;
const ZIP_VERSION = 20;

const to_dos_time = (date: Date): { time: number, date: number } => {
    // dos dates can't go before 1980
    const year = Math.max(date.getFullYear(), 1980);
    return {
        time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
        date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
    };
};

const from_dos_time = (time: number, date: number): Date => new Date(
    ((date >> 9) & 0x7F) + 1980,
    ((date >> 5) & 0x0F) - 1,
    date & 0x1F,
    (time >> 11) & 0x1F,
    (time >> 5) & 0x3F,
    (time & 0x1F) * 2,
);

const ZIP_METHOD_NAMES: Record<number, string> = {
    [ZIP_METHOD_STORE]: "stored",
    [ZIP_METHOD_DEFLATE]: "deflated",
};

export const write_zip = async (inputs: ArchiveInput[], options: ZipWriteOptions): Promise<{ archive: Uint8Array, written: WrittenEntry[] }> => {
    const body = new ByteWriter();
    const central = new ByteWriter();
    const written: WrittenEntry[] = [];

    for (const input of inputs) {
        const name = text_encoder.encode(input.path);
        const data = input.data ?? new Uint8Array(0);
        const checksum = crc32(data);
        const { time, date } = to_dos_time(input.modified ?? new Date());

        // deflate only when it actually saves space, as zip itself does
        let method = ZIP_METHOD_STORE;
        let stored = data;
        if (!options.store_only && input.data !== null && data.length > 0) {
            const deflated = await deflate_raw(data);
            if (deflated.length < data.length) {
                method = ZIP_METHOD_DEFLATE;
                stored = deflated;
            }
        }

        if (body.length > 0xFFFFFFFF || stored.length > 0xFFFFFFFF) {
            throw new ArchiveError("Archive is too large for zip without zip64, which isn't supported.");
        }

        const local_offset = body.length;

        body.u32(ZIP_LOCAL_SIGNATURE);
        body.u16(ZIP_VERSION);
        body.u16(ZIP_FLAG_UTF8);
        body.u16(method);
        body.u16(time);
        body.u16(date);
        body.u32(checksum);
        body.u32(stored.length);
        body.u32(data.length);
        body.u16(name.length);
        body.u16(0);
        body.bytes(name);
        body.bytes(stored);

        central.u32(ZIP_CENTRAL_SIGNATURE);
        central.u16(ZIP_VERSION);
        central.u16(ZIP_VERSION);
        central.u16(ZIP_FLAG_UTF8);
        central.u16(method);
        central.u16(time);
        central.u16(date);
        central.u32(checksum);
        central.u32(stored.length);
        central.u32(data.length);
        central.u16(name.length);
        central.u16(0); // extra length
        central.u16(0); // comment length
        central.u16(0); // disk number
        central.u16(0); // internal attributes
        central.u32(input.data === null ? 0x10 : 0); // external attributes, msdos directory bit
        central.u32(local_offset);
        central.bytes(name);

        written.push({ path: input.path, size: data.length, compressed_size: stored.length, method: ZIP_METHOD_NAMES[method] });
    }

    if (inputs.length > 0xFFFF) {
        throw new ArchiveError("Too many entries for zip without zip64, which isn't supported.");
    }

    const central_offset = body.length;
    const central_bytes = central.finish();

    body.bytes(central_bytes);
    body.u32(ZIP_END_SIGNATURE);
    body.u16(0);
    body.u16(0);
    body.u16(inputs.length);
    body.u16(inputs.length);
    body.u32(central_bytes.length);
    body.u32(central_offset);
    body.u16(0);

    return { archive: body.finish(), written };
};

export const read_zip = (data: Uint8Array): ArchiveEntry[] => {
    const view = view_of(data);

    // the end record sits in the last 22 bytes plus up to 64k of comment
    let end_offset = -1;
    for (let offset = data.length - 22; offset >= Math.max(0, data.length - 22 - 0xFFFF); offset--) {
        if (view.getUint32(offset, true) === ZIP_END_SIGNATURE) {
            end_offset = offset;
            break;
        }
    }

    if (end_offset === -1) {
        throw new ArchiveError("Not a valid zip file (no end of central directory record).");
    }

    const entry_count = view.getUint16(end_offset + 10, true);
    let offset = view.getUint32(end_offset + 16, true);

    if (entry_count === 0xFFFF || offset === 0xFFFFFFFF) {
        throw new ArchiveError("Zip64 archives aren't supported.");
    }

    const entries: ArchiveEntry[] = [];

    for (let index = 0; index < entry_count; index++) {
        check_bounds(data, offset, 46, "central directory");

        if (view.getUint32(offset, true) !== ZIP_CENTRAL_SIGNATURE) {
            throw new ArchiveError("Corrupt zip central directory.");
        }

        const flags = view.getUint16(offset + 8, true);
        const method = view.getUint16(offset + 10, true);
        const time = view.getUint16(offset + 12, true);
        const date = view.getUint16(offset + 14, true);
        const expected_crc = view.getUint32(offset + 16, true);
        const compressed_size = view.getUint32(offset + 20, true);
        const size = view.getUint32(offset + 24, true);
        const name_length = view.getUint16(offset + 28, true);
        const extra_length = view.getUint16(offset + 30, true);
        const comment_length = view.getUint16(offset + 32, true);
        const local_offset = view.getUint32(offset + 42, true);

        check_bounds(data, offset + 46, name_length, "file name");
        const raw_name = data.subarray(offset + 46, offset + 46 + name_length);

        // names without the utf-8 flag are officially cp437, but nearly every modern tool writes utf-8 anyway, so both are read as utf-8
        const path = text_decoder.decode(raw_name);

        offset += 46 + name_length + extra_length + comment_length;

        const is_dir = path.endsWith("/");
        const method_name = ZIP_METHOD_NAMES[method] ?? `method ${method}`;

        entries.push({
            path,
            is_dir,
            size,
            compressed_size,
            modified: from_dos_time(time, date),
            method: (flags & ZIP_FLAG_ENCRYPTED) ? "encrypted" : method_name,
            read: async () => {
                if (flags & ZIP_FLAG_ENCRYPTED) {
                    throw new ArchiveError("Encrypted entries aren't supported.");
                }

                check_bounds(data, local_offset, 30, "local header");
                if (view.getUint32(local_offset, true) !== ZIP_LOCAL_SIGNATURE) {
                    throw new ArchiveError("Corrupt zip local header.");
                }

                // the local header's name and extra lengths can differ from the central directory's
                const data_start = local_offset + 30 + view.getUint16(local_offset + 26, true) + view.getUint16(local_offset + 28, true);
                check_bounds(data, data_start, compressed_size, "file data");
                const stored = data.subarray(data_start, data_start + compressed_size);

                let content: Uint8Array;
                if (method === ZIP_METHOD_STORE) {
                    content = stored.slice();
                } else if (method === ZIP_METHOD_DEFLATE) {
                    content = await inflate_raw(stored);
                } else {
                    throw new ArchiveError(`Unsupported compression method ${method}.`);
                }

                if (content.length !== size || crc32(content) !== expected_crc) {
                    throw new ArchiveError("Checksum mismatch, the entry is corrupt.");
                }

                return content;
            },
        });
    }

    return entries;
};

// ---- tar ----

const read_tar_string = (field: Uint8Array): string => {
    const end = field.indexOf(0);
    return text_decoder.decode(end === -1 ? field : field.subarray(0, end));
};

const write_tar_string = (header: Uint8Array, offset: number, length: number, value: string) => {
    header.set(text_encoder.encode(value).subarray(0, length), offset);
};

const write_tar_octal = (header: Uint8Array, offset: number, length: number, value: number) => {
    write_tar_string(header, offset, length, value.toString(8).padStart(length - 1, "0") + "\0");
};

const pad_to_block = (length: number) => (TAR_BLOCK - (length % TAR_BLOCK)) % TAR_BLOCK;

const make_tar_header = (name: string, prefix: string, size: number, type: string, modified: Date, is_dir: boolean): Uint8Array => {
    const header = new Uint8Array(TAR_BLOCK);
    write_tar_string(header, 0, 100, name);
    write_tar_octal(header, 100, 8, is_dir ? 0o755 : 0o644);
    write_tar_octal(header, 108, 8, 0);
    write_tar_octal(header, 116, 8, 0);
    write_tar_octal(header, 124, 12, size);
    write_tar_octal(header, 136, 12, Math.max(0, Math.floor(modified.getTime() / 1000)));
    write_tar_string(header, 156, 1, type);
    write_tar_string(header, 257, 6, "ustar\0");
    write_tar_string(header, 263, 2, "00");
    write_tar_string(header, 345, 155, prefix);

    const checksum = tar_checksum(header);
    write_tar_string(header, 148, 8, checksum.toString(8).padStart(6, "0") + "\0 ");
    return header;
};

// ustar fits names up to 100 bytes, or 255 when they can be split at a slash into a prefix
const split_ustar_name = (path: string): { name: string, prefix: string } | null => {
    if (text_encoder.encode(path).length <= 100) {
        return { name: path, prefix: "" };
    }

    for (let slash = path.indexOf("/"); slash !== -1; slash = path.indexOf("/", slash + 1)) {
        const prefix = path.slice(0, slash);
        const name = path.slice(slash + 1);
        if (text_encoder.encode(prefix).length <= 155 && text_encoder.encode(name).length <= 100 && name.length > 0) {
            return { name, prefix };
        }
    }

    return null;
};

export const write_tar = (inputs: ArchiveInput[]): { archive: Uint8Array, written: WrittenEntry[] } => {
    const out = new ByteWriter();
    const written: WrittenEntry[] = [];

    for (const input of inputs) {
        const data = input.data ?? new Uint8Array(0);
        const is_dir = input.data === null;
        const modified = input.modified ?? new Date();
        const type = is_dir ? "5" : "0";

        let split = split_ustar_name(input.path);
        if (split === null) {
            // gnu long name extension: a pseudo entry holding the full name, then a header with a truncated one
            const long_name = text_encoder.encode(input.path + "\0");
            out.bytes(make_tar_header("././@LongLink", "", long_name.length, "L", modified, false));
            out.bytes(long_name);
            out.bytes(new Uint8Array(pad_to_block(long_name.length)));
            split = { name: input.path.slice(0, 100), prefix: "" };
        }

        out.bytes(make_tar_header(split.name, split.prefix, data.length, type, modified, is_dir));
        out.bytes(data);
        out.bytes(new Uint8Array(pad_to_block(data.length)));

        written.push({ path: input.path, size: data.length, compressed_size: data.length, method: "stored" });
    }

    // two empty blocks end the archive
    out.bytes(new Uint8Array(TAR_BLOCK * 2));

    return { archive: out.finish(), written };
};

const parse_pax = (data: Uint8Array): Record<string, string> => {
    const records: Record<string, string> = {};
    const text = text_decoder.decode(data);
    let offset = 0;

    // each record is "<length> <key>=<value>\n", where length counts the whole record
    while (offset < text.length) {
        const space = text.indexOf(" ", offset);
        if (space === -1) {
            break;
        }

        const length = parseInt(text.slice(offset, space), 10);
        if (!Number.isFinite(length) || length <= 0) {
            break;
        }

        const record = text.slice(space + 1, offset + length - 1);
        const equals = record.indexOf("=");
        if (equals !== -1) {
            records[record.slice(0, equals)] = record.slice(equals + 1);
        }

        offset += length;
    }

    return records;
};

export const read_tar = (data: Uint8Array): ArchiveEntry[] => {
    const entries: ArchiveEntry[] = [];
    let offset = 0;
    let pending_name: string | null = null;

    while (offset + TAR_BLOCK <= data.length) {
        const header = data.subarray(offset, offset + TAR_BLOCK);

        // an all zero block marks the end
        if (header.every((byte) => byte === 0)) {
            break;
        }

        const expected = parse_octal(header.subarray(148, 156));
        if (expected === null || expected !== tar_checksum(header)) {
            throw new ArchiveError(`Corrupt tar header at offset ${offset}.`);
        }

        const size = parse_octal(header.subarray(124, 136)) ?? 0;
        const mtime = parse_octal(header.subarray(136, 148)) ?? 0;
        const type = String.fromCharCode(header[156] || 0x30);
        const data_start = offset + TAR_BLOCK;

        check_bounds(data, data_start, size, "file data");
        const content = data.subarray(data_start, data_start + size);

        offset = data_start + size + pad_to_block(size);

        if (type === "L") {
            pending_name = read_tar_string(content);
            continue;
        }

        if (type === "x") {
            const pax = parse_pax(content);
            if (pax.path) {
                pending_name = pax.path;
            }
            continue;
        }

        if (type === "g") {
            continue;
        }

        let path = pending_name;
        pending_name = null;

        if (path === null) {
            const name = read_tar_string(header.subarray(0, 100));
            const prefix = text_decoder.decode(header.subarray(257, 262)) === "ustar" ? read_tar_string(header.subarray(345, 500)) : "";
            path = prefix ? `${prefix}/${name}` : name;
        }

        const is_dir = type === "5" || path.endsWith("/");
        const is_file = type === "0" || type === "7";

        entries.push({
            path: is_dir && !path.endsWith("/") ? `${path}/` : path,
            is_dir,
            size: is_file ? size : 0,
            compressed_size: is_file ? size : 0,
            modified: new Date(mtime * 1000),
            method: is_dir ? "stored" : is_file ? "stored" : `type ${type}`,
            read: async () => {
                if (!is_file && !is_dir) {
                    throw new ArchiveError(`Unsupported tar entry type "${type}" (links and devices can't be extracted).`);
                }
                return content.slice();
            },
        });
    }

    return entries;
};

// ---- gzip (single file) ----

const GZIP_FLAG_EXTRA = 0x04;
const GZIP_FLAG_NAME = 0x08;

/**
 * Gzips data, storing the original file name in the header so gunzipping can restore it.
 */
export const write_gzip = async (data: Uint8Array, name: string | null, modified: Date = new Date()): Promise<Uint8Array> => {
    const out = new ByteWriter();
    out.bytes(new Uint8Array([0x1F, 0x8B, 0x08, name ? GZIP_FLAG_NAME : 0]));
    out.u32(Math.max(0, Math.floor(modified.getTime() / 1000)));
    out.bytes(new Uint8Array([0x00, 0xFF]));

    if (name) {
        // the header name is latin-1, so anything outside it is dropped
        out.bytes(Uint8Array.from([...name].filter((char) => char.charCodeAt(0) < 256 && char !== "\0").map((char) => char.charCodeAt(0))));
        out.bytes(new Uint8Array([0]));
    }

    out.bytes(await deflate_raw(data));
    out.u32(crc32(data));
    out.u32(data.length);
    return out.finish();
};

/**
 * Reads the original file name and modified time from a gzip header, if it has them.
 */
export const read_gzip_header = (data: Uint8Array): { name: string | null, modified: Date | null } => {
    if (data.length < 10 || data[0] !== 0x1F || data[1] !== 0x8B) {
        throw new ArchiveError("Not a gzip file.");
    }

    const flags = data[3];
    const mtime = view_of(data).getUint32(4, true);
    let offset = 10;

    if (flags & GZIP_FLAG_EXTRA) {
        check_bounds(data, offset, 2, "gzip header");
        offset += 2 + view_of(data).getUint16(offset, true);
    }

    let name: string | null = null;
    if (flags & GZIP_FLAG_NAME) {
        const end = data.indexOf(0, offset);
        if (end === -1) {
            throw new ArchiveError("Corrupt gzip header.");
        }
        name = String.fromCharCode(...data.subarray(offset, end));
    }

    // the comment and header crc come after the name, but nothing here needs them
    return { name, modified: mtime > 0 ? new Date(mtime * 1000) : null };
};

export const read_gzip = async (data: Uint8Array): Promise<Uint8Array> => gunzip_stream(data);

/**
 * Builds an archive of the given format. Gzip only holds a single file.
 */
export const write_archive = async (format: ArchiveFormat, inputs: ArchiveInput[], options: ZipWriteOptions): Promise<{ archive: Uint8Array, written: WrittenEntry[] }> => {
    switch (format) {
        case "zip":
            return write_zip(inputs, options);
        case "tar":
            return write_tar(inputs);
        case "tgz": {
            const { archive, written } = write_tar(inputs);
            return { archive: await write_gzip(archive, null), written };
        }
        case "gz": {
            const files = inputs.filter((input) => input.data !== null);
            if (files.length !== 1 || inputs.length !== 1) {
                throw new ArchiveError("Gzip holds exactly one file. Use tgz for more than one, or for directories.");
            }

            const [file] = files;
            const name = file.path.split("/").pop() ?? null;
            const archive = await write_gzip(file.data!, name, file.modified);
            return { archive, written: [{ path: file.path, size: file.data!.length, compressed_size: archive.length, method: "deflated" }] };
        }
    }
};

/**
 * Lists the entries of an archive of the given format.
 * @param fallback_name Name for a gzip's single file when its header doesn't store one.
 */
export const read_archive = async (format: ArchiveFormat, data: Uint8Array, fallback_name: string): Promise<ArchiveEntry[]> => {
    switch (format) {
        case "zip":
            return read_zip(data);
        case "tar":
            return read_tar(data);
        case "tgz":
            return read_tar(await read_gzip(data));
        case "gz": {
            const header = read_gzip_header(data);
            const content = await read_gzip(data);
            return [{
                path: header.name || fallback_name,
                is_dir: false,
                size: content.length,
                compressed_size: data.length,
                modified: header.modified ?? new Date(),
                method: "deflated",
                read: async () => content,
            }];
        }
    }
};

/**
 * Turns a shell style glob (* and ?) into a regex matching the whole string.
 */
export const glob_to_regex = (pattern: string): RegExp => {
    const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".");
    return new RegExp(`^${escaped}$`);
};

/**
 * Whether a path in an archive matches a pattern, by its full path or its file name.
 */
export const matches_any = (path: string, patterns: RegExp[]): boolean => {
    const trimmed = path.replace(/\/$/, "");
    const base = trimmed.split("/").pop() ?? trimmed;
    return patterns.some((pattern) => pattern.test(trimmed) || pattern.test(base) || pattern.test(path));
};

/**
 * Splits an archive path into safe parts to extract to. Returns null for paths that would escape the destination (.. or absolute).
 */
export const safe_path_parts = (path: string): string[] | null => {
    const parts = path.split(/[/\\]+/).filter((part) => part.length > 0 && part !== ".");

    if (parts.some((part) => part === ".." || /^[a-zA-Z]:$/.test(part))) {
        return null;
    }

    return parts;
};

export const format_size = (bytes: number): string => {
    if (bytes < 1024) {
        return `${bytes} B`;
    }

    const units = ["KiB", "MiB", "GiB"];
    let value = bytes / 1024;
    let unit_index = 0;
    while (value >= 1024 && unit_index < units.length - 1) {
        value /= 1024;
        unit_index++;
    }

    return `${value.toFixed(1)} ${units[unit_index]}`;
};

/**
 * How much smaller the compressed size is, as zip reports it.
 */
export const savings_percent = (size: number, compressed_size: number): number => {
    if (size === 0) {
        return 0;
    }
    return Math.max(0, Math.round((1 - compressed_size / size) * 100));
};


export interface ParsedArgs {
    flags: Set<string>;
    values: Map<string, string[]>;
    positional: string[];
}

/**
 * Parses short flags the way unix tools do: they can be combined (-rq), take values separately or attached (-o out, -oout), come in any order, and -- ends them.
 * @param boolean_flags Flags that take no value, e.g. "r".
 * @param value_flags Flags that take a value, e.g. "o". Repeating one collects every value.
 */
export const parse_args = (args: string[], boolean_flags: string, value_flags: string): ParsedArgs => {
    const flags = new Set<string>();
    const values = new Map<string, string[]>();
    const positional: string[] = [];

    for (let index = 0; index < args.length; index++) {
        const arg = args[index];

        if (arg === "--") {
            positional.push(...args.slice(index + 1));
            break;
        }

        if (!arg.startsWith("-") || arg === "-") {
            positional.push(arg);
            continue;
        }

        for (let char_index = 1; char_index < arg.length; char_index++) {
            const flag = arg[char_index];

            if (boolean_flags.includes(flag)) {
                flags.add(flag);
                continue;
            }

            if (value_flags.includes(flag)) {
                let value = arg.slice(char_index + 1);
                if (value.length === 0) {
                    index++;
                    if (index >= args.length) {
                        throw new ArchiveError(`Flag -${flag} needs a value.`);
                    }
                    value = args[index];
                }

                values.set(flag, [...(values.get(flag) ?? []), value]);
                break;
            }

            throw new ArchiveError(`Unknown flag: -${flag}`);
        }
    }

    return { flags, values, positional };
};
