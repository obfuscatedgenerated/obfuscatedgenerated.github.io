import { WrappedTerminal } from "./term_ctl";
import { CompletionData } from "./types";
export declare const tab_complete: (term: WrappedTerminal, discard_cached_matches?: boolean) => Promise<boolean>;
export declare const helper_completion_options: (options: string[]) => (data: CompletionData) => AsyncGenerator<string>;
export declare const helper_completion_options_ordered: (options: string[][]) => (data: CompletionData) => AsyncGenerator<string>;
