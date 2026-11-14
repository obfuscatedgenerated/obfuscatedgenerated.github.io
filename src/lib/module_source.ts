/**
 * Imports a program's module source in its own scope. The source URL names it in stack traces and devtools instead of a long data URL.
 */
export const import_module_source = async (source: string, source_url: string): Promise<Record<string, unknown>> => {
    const named_source = `${source}\n//# sourceURL=${source_url}`;
    const data_url = `data:text/javascript;base64,${btoa(unescape(encodeURIComponent(named_source)))}`;

    return await import(/* webpackIgnore: true */ data_url);
};
