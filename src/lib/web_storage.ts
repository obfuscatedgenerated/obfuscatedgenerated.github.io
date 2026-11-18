/**
 * localStorage, IndexedDB and the other storage APIs that isolated programs don't have (their origin is opaque), backed by files in the OllieOS filesystem.
 * Also provides sessionStorage and navigator.storage, and document.cookie in frames.
 *
 * Nothing is installed by default. A program that needs them calls {@link install_web_storage} before running the code that uses them
 * (e.g. a game that saves its settings), and only its own thread or frame gets them.
 *
 * IndexedDB is provided by fake-indexeddb, kept in memory and saved to the filesystem after every transaction that changes it.
 * Each database is saved as one file, so this suits settings and saves of a few MB, not large datasets.
 * Two running copies of the same program would overwrite each other's saves (the last to write wins).
 *
 * @module
 */

import {
    IDBCursor as FakeIDBCursor,
    IDBCursorWithValue as FakeIDBCursorWithValue,
    IDBDatabase as FakeIDBDatabase,
    IDBFactory as FakeIDBFactory,
    IDBIndex as FakeIDBIndex,
    IDBKeyRange as FakeIDBKeyRange,
    IDBObjectStore as FakeIDBObjectStore,
    IDBOpenDBRequest as FakeIDBOpenDBRequest,
    IDBRequest as FakeIDBRequest,
    IDBTransaction as FakeIDBTransaction,
    IDBVersionChangeEvent as FakeIDBVersionChangeEvent,
} from "fake-indexeddb";

/**
 * The parts of the filesystem used to persist storage. A program's own `kernel.get_fs()` provides them.
 *
 * @group Web Storage
 */
export interface WebStorageFileSystem {
    absolute(path: string): string;
    exists(path: string): Promise<boolean>;
    dir_exists(path: string): Promise<boolean>;
    make_dir(path: string): Promise<void>;
    read_file(path: string, as_uint?: boolean): Promise<string | Uint8Array>;
    write_file(path: string, data: string | Uint8Array): Promise<void>;
    delete_file(path: string): Promise<void>;
    list_dir(path: string): Promise<string[]>;
}

export interface WebStorageOptions {
    /** Install localStorage (and sessionStorage, which isn't persisted). Default true. */
    local_storage?: boolean;
    /** Install IndexedDB. Default true. */
    indexed_db?: boolean;
    /** Install document.cookie, in programs that have a document (needs_dom). Cookies without an expiry only last until the program exits. Default true. */
    cookies?: boolean;
    /** Install navigator.storage (estimate, persist and persisted). Default true. */
    storage_manager?: boolean;
}

const LOCAL_STORAGE_FILE = "local_storage.json";
const COOKIES_FILE = "cookies.json";

// reported to programs asking how much they can store. the filesystem doesn't impose one, so this is just generous
const STORAGE_QUOTA_BYTES = 1024 * 1024 * 1024;
const INDEXED_DB_DIR = "indexed_db";

// writes are batched, so a burst of changes is one write
const SAVE_DELAY_MS = 250;

// ---------- encoding values that json can't hold (binary data, dates), which indexeddb stores often contain

type TypedArrayName = "Int8Array" | "Uint8Array" | "Uint8ClampedArray" | "Int16Array" | "Uint16Array" | "Int32Array" | "Uint32Array" | "Float32Array" | "Float64Array" | "BigInt64Array" | "BigUint64Array";

const TYPED_ARRAYS: Record<TypedArrayName, new (buffer: ArrayBuffer) => ArrayBufferView> = {
    Int8Array, Uint8Array, Uint8ClampedArray, Int16Array, Uint16Array, Int32Array, Uint32Array, Float32Array, Float64Array, BigInt64Array, BigUint64Array,
};

type Encoded =
    | null | boolean | number | string
    | Encoded[]
    | { $: "object", value: Record<string, Encoded> }
    | { $: "undefined" }
    | { $: "number", value: string }
    | { $: "bigint", value: string }
    | { $: "date", value: number }
    | { $: "buffer", value: string }
    | { $: "typed", kind: TypedArrayName, value: string }
    | { $: "map", value: [Encoded, Encoded][] }
    | { $: "set", value: Encoded[] };

const bytes_to_base64 = (bytes: Uint8Array): string => {
    // chunked, so large data doesn't overflow the argument limit of String.fromCharCode
    const chunk_size = 0x8000;
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += chunk_size) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + chunk_size));
    }
    return btoa(binary);
};

const base64_to_bytes = (base64: string): Uint8Array => Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));

const encode = (value: unknown): Encoded => {
    if (value === null) {
        return null;
    }

    if (typeof value === "boolean" || typeof value === "string") {
        return value;
    }

    if (value === undefined) {
        return {$: "undefined"};
    }

    if (typeof value === "number") {
        // json has no NaN or infinities
        return Number.isFinite(value) ? value : {$: "number", value: String(value)};
    }

    if (typeof value === "bigint") {
        return {$: "bigint", value: value.toString()};
    }

    if (Array.isArray(value)) {
        return value.map(encode);
    }

    if (value instanceof Date) {
        return {$: "date", value: value.getTime()};
    }

    if (value instanceof ArrayBuffer) {
        return {$: "buffer", value: bytes_to_base64(new Uint8Array(value))};
    }

    if (ArrayBuffer.isView(value) && !(value instanceof DataView)) {
        const bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
        return {$: "typed", kind: value.constructor.name as TypedArrayName, value: bytes_to_base64(bytes)};
    }

    if (value instanceof Map) {
        return {$: "map", value: [...value].map(([map_key, map_value]) => [encode(map_key), encode(map_value)])};
    }

    if (value instanceof Set) {
        return {$: "set", value: [...value].map(encode)};
    }

    if (typeof value === "object") {
        const encoded: Record<string, Encoded> = {};
        for (const [property, property_value] of Object.entries(value)) {
            encoded[property] = encode(property_value);
        }

        return {$: "object", value: encoded};
    }

    throw new TypeError(`Can't store a value of type ${typeof value}`);
};

const decode = (encoded: Encoded): unknown => {
    if (encoded === null || typeof encoded !== "object") {
        return encoded;
    }

    if (Array.isArray(encoded)) {
        return encoded.map(decode);
    }

    switch (encoded.$) {
        case "object": {
            const decoded: Record<string, unknown> = {};
            for (const [property, property_value] of Object.entries(encoded.value)) {
                decoded[property] = decode(property_value);
            }
            return decoded;
        }
        case "undefined":
            return undefined;
        case "number":
            return Number(encoded.value);
        case "bigint":
            return BigInt(encoded.value);
        case "date":
            return new Date(encoded.value);
        case "buffer":
            return base64_to_bytes(encoded.value).buffer;
        case "typed": {
            const bytes = base64_to_bytes(encoded.value);
            const TypedArray = TYPED_ARRAYS[encoded.kind] ?? Uint8Array;
            return new TypedArray(bytes.buffer as ArrayBuffer);
        }
        case "map":
            return new Map(encoded.value.map(([map_key, map_value]) => [decode(map_key), decode(map_value)]));
        case "set":
            return new Set(encoded.value.map(decode));
    }
};

// runs a save after a short delay, and never two at once
const create_saver = (save: () => Promise<void>): (() => void) => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let running: Promise<void> = Promise.resolve();

    return () => {
        if (timer !== null) {
            return;
        }

        timer = setTimeout(() => {
            timer = null;
            running = running.then(save).catch((error) => console.error("Failed to save web storage:", error));
        }, SAVE_DELAY_MS);
    };
};

// ---------- localStorage

class FileBackedStorage implements Storage {
    readonly #items: Map<string, string>;
    readonly #on_change: () => void;

    constructor(items: Map<string, string>, on_change: () => void) {
        this.#items = items;
        this.#on_change = on_change;
    }

    get length(): number {
        return this.#items.size;
    }

    key(index: number): string | null {
        return [...this.#items.keys()][index] ?? null;
    }

    getItem(key: string): string | null {
        return this.#items.get(String(key)) ?? null;
    }

    setItem(key: string, value: string): void {
        this.#items.set(String(key), String(value));
        this.#on_change();
    }

    removeItem(key: string): void {
        if (this.#items.delete(String(key))) {
            this.#on_change();
        }
    }

    clear(): void {
        if (this.#items.size > 0) {
            this.#items.clear();
            this.#on_change();
        }
    }

    [name: string]: unknown;
}

// like the real one, items can also be read and written as properties (localStorage.foo = "bar")
const as_storage = (storage: FileBackedStorage): Storage => new Proxy(storage, {
    get: (target, property) => {
        if (typeof property === "symbol" || property in target) {
            // read from the storage itself, as its getters use private fields the proxy doesn't have
            const value = Reflect.get(target, property, target);
            return typeof value === "function" ? value.bind(target) : value;
        }

        return target.getItem(property) ?? undefined;
    },
    set: (target, property, value) => {
        if (typeof property === "symbol" || property in target) {
            return Reflect.set(target, property, value);
        }

        target.setItem(property, value);
        return true;
    },
    deleteProperty: (target, property) => {
        if (typeof property !== "symbol") {
            target.removeItem(property);
        }
        return true;
    },
    has: (target, property) => typeof property === "symbol" || property in target ? property in target : target.getItem(property) !== null,
    ownKeys: () => [...Array(storage.length).keys()].map((index) => storage.key(index)!),
    getOwnPropertyDescriptor: (target, property) => {
        if (typeof property === "symbol") {
            return undefined;
        }

        const value = target.getItem(property);
        return value === null ? undefined : {value, writable: true, enumerable: true, configurable: true};
    },
}) as Storage;

const create_local_storage = async (fs: WebStorageFileSystem, dir: string): Promise<Storage> => {
    const file_path = `${dir}/${LOCAL_STORAGE_FILE}`;

    const items = new Map<string, string>();
    if (await fs.exists(file_path)) {
        try {
            const stored = JSON.parse(await fs.read_file(file_path) as string) as Record<string, string>;
            for (const [key, value] of Object.entries(stored)) {
                items.set(key, String(value));
            }
        } catch (error) {
            console.error(`Failed to read ${file_path}, starting empty:`, error);
        }
    }

    const schedule_save = create_saver(() => fs.write_file(file_path, JSON.stringify(Object.fromEntries(items))));
    return as_storage(new FileBackedStorage(items, schedule_save));
};

// ---------- IndexedDB

interface SavedIndex {
    name: string;
    key_path: string | string[];
    unique: boolean;
    multi_entry: boolean;
}

interface SavedStore {
    name: string;
    key_path: string | string[] | null;
    auto_increment: boolean;
    indexes: SavedIndex[];
    records: [Encoded, Encoded][];
}

interface SavedDatabase {
    name: string;
    version: number;
    stores: SavedStore[];
}

const request_to_promise = <T>(request: IDBRequest<T>): Promise<T> => new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
});

// database names can contain anything (classicube's is "/classicube"), so they're encoded for file names
const database_file_name = (name: string): string => `${encodeURIComponent(name)}.json`;

const read_records = (store: IDBObjectStore): Promise<[Encoded, Encoded][]> => new Promise((resolve, reject) => {
    const records: [Encoded, Encoded][] = [];
    const request = store.openCursor();

    request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) {
            resolve(records);
            return;
        }

        records.push([encode(cursor.primaryKey), encode(cursor.value)]);
        cursor.continue();
    };
    request.onerror = () => reject(request.error);
});

const dump_database = async (database: IDBDatabase): Promise<SavedDatabase> => {
    const store_names = [...database.objectStoreNames];
    const stores: SavedStore[] = [];

    if (store_names.length > 0) {
        const transaction = database.transaction(store_names, "readonly");

        for (const store_name of store_names) {
            const store = transaction.objectStore(store_name);
            const indexes = [...store.indexNames].map((index_name) => {
                const index = store.index(index_name);
                return {name: index.name, key_path: index.keyPath, unique: index.unique, multi_entry: index.multiEntry};
            });

            stores.push({
                name: store.name,
                key_path: store.keyPath,
                auto_increment: store.autoIncrement,
                indexes,
                records: await read_records(store),
            });
        }
    }

    return {name: database.name, version: database.version, stores};
};

const restore_database = async (factory: IDBFactory, saved: SavedDatabase): Promise<void> => {
    const request = factory.open(saved.name, saved.version);

    request.onupgradeneeded = () => {
        const database = request.result;

        for (const saved_store of saved.stores) {
            const store = database.createObjectStore(saved_store.name, {keyPath: saved_store.key_path, autoIncrement: saved_store.auto_increment});

            for (const saved_index of saved_store.indexes) {
                store.createIndex(saved_index.name, saved_index.key_path, {unique: saved_index.unique, multiEntry: saved_index.multi_entry});
            }

            for (const [encoded_key, encoded_value] of saved_store.records) {
                // in-line keys are part of the value, out-of-line ones are given separately
                if (saved_store.key_path === null) {
                    store.put(decode(encoded_value), decode(encoded_key) as IDBValidKey);
                } else {
                    store.put(decode(encoded_value));
                }
            }
        }
    };

    const database = await request_to_promise(request);
    database.close();
};

const create_indexed_db = async (fs: WebStorageFileSystem, dir: string): Promise<IDBFactory> => {
    const databases_dir = `${dir}/${INDEXED_DB_DIR}`;
    const factory = new FakeIDBFactory() as unknown as IDBFactory;

    // load every saved database into memory before the program can open one
    if (await fs.dir_exists(databases_dir)) {
        for (const entry of await fs.list_dir(databases_dir)) {
            const file = entry.split("/").pop() ?? entry;
            if (!file.endsWith(".json")) {
                continue;
            }

            try {
                const saved = JSON.parse(await fs.read_file(`${databases_dir}/${file}`) as string) as SavedDatabase;
                await restore_database(factory, saved);
            } catch (error) {
                console.error(`Failed to load saved database ${file}, skipping it:`, error);
            }
        }
    }

    const savers = new Map<string, () => void>();

    const schedule_save = (database: IDBDatabase) => {
        let saver = savers.get(database.name);
        if (!saver) {
            const database_name = database.name;
            saver = create_saver(async () => {
                // a fresh connection, as the program may have closed its own by now
                const connection = await request_to_promise(factory.open(database_name));
                try {
                    const saved = await dump_database(connection);
                    if (!(await fs.dir_exists(databases_dir))) {
                        await fs.make_dir(databases_dir);
                    }
                    await fs.write_file(`${databases_dir}/${database_file_name(database_name)}`, JSON.stringify(saved));
                } finally {
                    connection.close();
                }
            });
            savers.set(database.name, saver);
        }

        saver();
    };

    // watches a connection's transactions, so anything that changes the database is saved once it commits
    const watch_database = (database: IDBDatabase): IDBDatabase => {
        const original_transaction = database.transaction.bind(database);

        database.transaction = ((store_names: string | string[], mode?: IDBTransactionMode, options?: IDBTransactionOptions) => {
            const transaction = original_transaction(store_names, mode, options);
            if (mode === "readwrite") {
                transaction.addEventListener("complete", () => schedule_save(database));
            }
            return transaction;
        }) as IDBDatabase["transaction"];

        return database;
    };

    const original_open = factory.open.bind(factory);
    factory.open = ((name: string, version?: number) => {
        const request = original_open(name, version);

        // schema changes happen in the upgrade transaction
        request.addEventListener("upgradeneeded", () => {
            request.transaction?.addEventListener("complete", () => schedule_save(request.result));
        });

        request.addEventListener("success", () => watch_database(request.result));
        return request;
    }) as IDBFactory["open"];

    const original_delete = factory.deleteDatabase.bind(factory);
    factory.deleteDatabase = ((name: string) => {
        const request = original_delete(name);
        request.addEventListener("success", () => {
            const file_path = `${databases_dir}/${database_file_name(name)}`;
            fs.exists(file_path)
                .then((exists) => exists ? fs.delete_file(file_path) : undefined)
                .catch((error) => console.error(`Failed to delete saved database ${name}:`, error));
        });
        return request;
    }) as IDBFactory["deleteDatabase"];

    return factory;
};

// ---------- document.cookie

interface StoredCookie {
    value: string;
    // ms since the epoch, or null for a session cookie
    expires: number | null;
}

// only name=value and the attributes that decide when a cookie ends matter here: there is one program, so domain, path and secure have nothing to choose between
const parse_cookie = (text: string): {name: string, cookie: StoredCookie} | null => {
    const [pair, ...attributes] = text.split(";");
    const separator = pair.indexOf("=");

    // a cookie with no "=" has an empty name, as in browsers
    const name = separator === -1 ? "" : pair.slice(0, separator).trim();
    const value = separator === -1 ? pair.trim() : pair.slice(separator + 1).trim();

    let expires: number | null = null;
    for (const attribute of attributes) {
        const attribute_separator = attribute.indexOf("=");
        const attribute_name = (attribute_separator === -1 ? attribute : attribute.slice(0, attribute_separator)).trim().toLowerCase();
        const attribute_value = attribute_separator === -1 ? "" : attribute.slice(attribute_separator + 1).trim();

        // max-age wins over expires, as in browsers
        if (attribute_name === "max-age") {
            const seconds = parseInt(attribute_value, 10);
            if (!isNaN(seconds)) {
                expires = Date.now() + seconds * 1000;
                break;
            }
        } else if (attribute_name === "expires") {
            const date = Date.parse(attribute_value);
            if (!isNaN(date)) {
                expires = date;
            }
        }
    }

    if (name === "" && value === "") {
        return null;
    }

    return {name, cookie: {value, expires}};
};

const install_cookies = async (fs: WebStorageFileSystem, dir: string): Promise<void> => {
    const file_path = `${dir}/${COOKIES_FILE}`;
    const cookies = new Map<string, StoredCookie>();

    if (await fs.exists(file_path)) {
        try {
            const stored = JSON.parse(await fs.read_file(file_path) as string) as Record<string, StoredCookie>;
            for (const [name, cookie] of Object.entries(stored)) {
                cookies.set(name, cookie);
            }
        } catch (error) {
            console.error(`Failed to read ${file_path}, starting empty:`, error);
        }
    }

    const is_live = (cookie: StoredCookie) => cookie.expires === null || cookie.expires > Date.now();

    // session cookies end with the program, so only cookies with an expiry are saved
    const schedule_save = create_saver(() => {
        const persistent = [...cookies].filter(([, cookie]) => cookie.expires !== null && is_live(cookie));
        return fs.write_file(file_path, JSON.stringify(Object.fromEntries(persistent)));
    });

    Object.defineProperty(document, "cookie", {
        get: () => [...cookies]
            .filter(([, cookie]) => is_live(cookie))
            .map(([name, cookie]) => name === "" ? cookie.value : `${name}=${cookie.value}`)
            .join("; "),
        set: (text: string) => {
            const parsed = parse_cookie(String(text));
            if (!parsed) {
                return;
            }

            // setting an expiry in the past is how cookies are deleted
            if (is_live(parsed.cookie)) {
                cookies.set(parsed.name, parsed.cookie);
            } else {
                cookies.delete(parsed.name);
            }

            schedule_save();
        },
        configurable: true,
        enumerable: true,
    });
};

// ---------- navigator.storage

const install_storage_manager = (usage_bytes: () => number): void => {
    // estimate, persist and persisted are what programs use to check before storing. getDirectory (opfs) isn't provided, so programs that feature detect it fall back
    const storage_manager = {
        estimate: async (): Promise<StorageEstimate> => ({usage: usage_bytes(), quota: STORAGE_QUOTA_BYTES}),
        // it's all in the filesystem, which the browser doesn't clear on its own
        persist: async (): Promise<boolean> => true,
        persisted: async (): Promise<boolean> => true,
    };

    Object.defineProperty(navigator, "storage", {value: storage_manager, writable: true, configurable: true, enumerable: true});
};

// ---------- install

const define_global = (name: string, value: unknown) => {
    Object.defineProperty(globalThis, name, {value, writable: true, configurable: true, enumerable: true});
};

/**
 * Gives the calling program localStorage and IndexedDB, saved under the given directory. Call it before running code that uses them.
 * Installs into the program's own thread or frame only.
 *
 * @param program_fs The program's filesystem, i.e. `kernel.get_fs()`.
 * @param dir Where to keep the data, e.g. "~/.local/share/my_program". Created if it doesn't exist.
 *
 * @example
 * await install_web_storage(kernel.get_fs(), "~/.local/share/classicube");
 *
 * @group Web Storage
 */
export const install_web_storage = async (program_fs: WebStorageFileSystem, dir: string, options: WebStorageOptions = {}): Promise<void> => {
    // the size of each file read or written, for navigator.storage.estimate()
    const file_sizes = new Map<string, number>();
    const size_of = (data: string | Uint8Array) => typeof data === "string" ? new TextEncoder().encode(data).length : data.length;

    const fs: WebStorageFileSystem = {
        absolute: (path) => program_fs.absolute(path),
        exists: (path) => program_fs.exists(path),
        dir_exists: (path) => program_fs.dir_exists(path),
        make_dir: (path) => program_fs.make_dir(path),
        list_dir: (path) => program_fs.list_dir(path),
        read_file: async (path, as_uint) => {
            const data = await program_fs.read_file(path, as_uint);
            file_sizes.set(path, size_of(data));
            return data;
        },
        write_file: async (path, data) => {
            await program_fs.write_file(path, data);
            file_sizes.set(path, size_of(data));
        },
        delete_file: async (path) => {
            await program_fs.delete_file(path);
            file_sizes.delete(path);
        },
    };

    const absolute_dir = fs.absolute(dir);
    if (!(await fs.dir_exists(absolute_dir))) {
        // make_dir doesn't create parents, so each level is made in turn
        let current = "";
        for (const part of absolute_dir.split("/").filter((segment) => segment.length > 0)) {
            current += `/${part}`;
            if (!(await fs.dir_exists(current))) {
                await fs.make_dir(current);
            }
        }
    }

    if (options.local_storage ?? true) {
        define_global("localStorage", await create_local_storage(fs, absolute_dir));

        // session storage only lasts as long as the program, so it is never saved
        define_global("sessionStorage", as_storage(new FileBackedStorage(new Map(), () => undefined)));
    }

    if (options.indexed_db ?? true) {
        define_global("indexedDB", await create_indexed_db(fs, absolute_dir));

        // libraries check for these before using indexeddb
        define_global("IDBCursor", FakeIDBCursor);
        define_global("IDBCursorWithValue", FakeIDBCursorWithValue);
        define_global("IDBDatabase", FakeIDBDatabase);
        define_global("IDBFactory", FakeIDBFactory);
        define_global("IDBIndex", FakeIDBIndex);
        define_global("IDBKeyRange", FakeIDBKeyRange);
        define_global("IDBObjectStore", FakeIDBObjectStore);
        define_global("IDBOpenDBRequest", FakeIDBOpenDBRequest);
        define_global("IDBRequest", FakeIDBRequest);
        define_global("IDBTransaction", FakeIDBTransaction);
        define_global("IDBVersionChangeEvent", FakeIDBVersionChangeEvent);
    }

    // only frames have a document
    if ((options.cookies ?? true) && typeof document !== "undefined") {
        await install_cookies(fs, absolute_dir);
    }

    if (options.storage_manager ?? true) {
        install_storage_manager(() => [...file_sizes.values()].reduce((total, size) => total + size, 0));
    }
};
