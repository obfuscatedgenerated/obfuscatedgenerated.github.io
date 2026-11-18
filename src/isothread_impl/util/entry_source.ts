const sources_by_url = new Map<string, Promise<string>>();

/**
 * Fetches the isothread entry bundle as text, once per URL. It has to be text because isolated (opaque origin) contexts can't load a script from a URL on the OS's origin.
 */
export const fetch_entry_source = (entry_url: string): Promise<string> => {
    let source = sources_by_url.get(entry_url);

    if (!source) {
        source = (async () => {
            // revalidate every boot, as ?v= only changes on release and a stale entry silently runs old protocol code
            const response = await fetch(entry_url, {cache: "no-cache"});
            if (!response.ok) {
                throw new Error(`Failed to fetch isothread entry from ${entry_url}: ${response.status}`);
            }

            return await response.text();
        })();

        sources_by_url.set(entry_url, source);
    }

    return source;
};
