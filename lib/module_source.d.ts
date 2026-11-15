/**
 * Imports a program's module source in its own scope. The source URL names it in stack traces and devtools instead of a long data URL.
 */
export declare const import_module_source: (source: string, source_url: string) => Promise<Record<string, unknown>>;
