import type {AbstractFileSystem} from "./kernel/filesystem";
import type {Program} from "./types";

/**
 * Where the code of builtins comes from, so each platform can supply it its own way (the web fetches it, others could read it from disk).
 */
export interface BuiltinCodeSource {
    /**
     * Gets the hash of each builtin's current code, by name.
     */
    get_manifest(): Promise<Record<string, string>>;

    /**
     * Gets a builtin's code.
     * @param refetch Set when a first copy didn't match its hash, so the source should skip any cache.
     */
    get_code(name: string, hash: string, refetch: boolean): Promise<string>;
}

const BIN_DIR = "/bin";

// the hashes of the builtin code currently in /bin, compared on each boot so only changed builtins are fetched. kept out of /bin, where every file is a program
const BUILTIN_MANIFEST_PATH = "/var/lib/builtin_code.json";

// the manifest uses the first 16 hex characters of a sha-256
const hash_code = async (code: string): Promise<string> => {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(code));
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, 16);
};

// gets a builtin's code and checks it matches its hash, trying once more past any cache. null if it still doesn't match
const get_verified_code = async (source: BuiltinCodeSource, name: string, hash: string): Promise<string | null> => {
    for (const refetch of [false, true]) {
        const code = await source.get_code(name, hash, refetch);
        if (await hash_code(code) === hash) {
            return code;
        }
    }

    return null;
};

/**
 * Writes the code of builtins to /bin/<name>.js, so they run isolated like any program found on disk. Only builtins whose code changed since the last boot are fetched.
 * Kernelspace builtins never get a file, so they keep running from the kernel's own copy.
 * Run it after initial_fs_setup. If the manifest can't be fetched (e.g. offline), /bin is left as it was.
 */
export const sync_builtin_code = async (fs: AbstractFileSystem, builtin_programs: Record<string, Program>, source: BuiltinCodeSource): Promise<void> => {
    let manifest: Record<string, string>;
    try {
        manifest = await source.get_manifest();
    } catch (e) {
        console.error("Failed to get the builtin code manifest, leaving /bin as it is:", e);
        return;
    }

    let stored: Record<string, string> = {};
    if (await fs.exists(BUILTIN_MANIFEST_PATH)) {
        try {
            stored = JSON.parse(await fs.read_file(BUILTIN_MANIFEST_PATH) as string);
        } catch (e) {
            console.error("Failed to read the stored builtin code manifest, fetching everything:", e);
        }
    }

    const updates = Object.entries(builtin_programs).map(async ([name, program]) => {
        const code_path = `${BIN_DIR}/${name}.js`;
        const hash = manifest[name];

        // kernelspace builtins (and any that weren't built) must not have a file, or the kernel would run that instead
        if (program.space === "kernel" || !hash) {
            if (await fs.exists(code_path)) {
                await fs.delete_file(code_path);
            }

            delete stored[name];
            return;
        }

        if (stored[name] === hash && await fs.exists(code_path)) {
            return;
        }

        try {
            const code = await get_verified_code(source, name, hash);
            if (code === null) {
                // keep whatever is there, and leave the stored hash so the next boot tries again
                console.error(`Code for builtin ${name} didn't match its hash, keeping the existing copy.`);
                return;
            }

            await fs.write_file(code_path, code, true);
            stored[name] = hash;
        } catch (e) {
            console.error(`Failed to update the code for builtin ${name}, keeping the existing copy:`, e);
        }
    });

    await Promise.all(updates);

    // builtins that no longer exist are removed by initial_fs_setup, so only those still present are kept
    for (const name of Object.keys(stored)) {
        if (!(name in builtin_programs)) {
            delete stored[name];
        }
    }

    await fs.write_file(BUILTIN_MANIFEST_PATH, JSON.stringify(stored, null, 2), true);
};
