import { AshMemory } from "./memory";
export interface LineParseResultCommand {
    type: "command";
    command: string;
    args: string[];
    unsubbed_args: string[];
    raw_parts: string[];
    run_in_bg: boolean;
}
export interface LineParseResultVarAssignment {
    type: "var";
    var_name: string;
    var_value: string;
}
export type LineParseResult = LineParseResultCommand | LineParseResultVarAssignment | null;
export declare const parse_line: (line: string, memory?: AshMemory) => LineParseResult;
