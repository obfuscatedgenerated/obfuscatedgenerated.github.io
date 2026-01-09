import {WrappedTerminal} from "../../../term_ctl";
import {AshMemory} from "./memory";

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

const VAR_ASSIGNMENT_REGEX = /^([a-zA-Z0-9_]+)=(.+)$/;

export const parse_line = (line: string, memory?: AshMemory): LineParseResult => {
    if (line.length === 0) {
        // if the line is empty, nothing to parse
        return null;
    }

    // TODO: handle multiple commands separated by semicolons

    // remove leading and trailing whitespace and split by spaces, unless contained in single or double quotes
    // TODO: use a proper stack based parser for readability and maintainability
    const raw_parts = line.split(/ +(?=(?:(?:[^"']*["'][^"']*["'])*[^"']*$))/);
    const sub = line.trim().split(/ +(?=(?:(?:[^"']*["'][^"']*["'])*[^"']*$))/);

    // handle aliases
    // for each part, check if it's an alias, and if so, replace it with the value
    // if the value ends with a space, check the next part as well
    for (let i = 0; i < sub.length; i++) {
        const part = sub[i];
        const alias_value = memory ? memory.get_alias(part) : undefined;

        if (!alias_value) {
            // not an alias, abort (alias only applies to the first word unless chaining)
            break;
        }

        // split the alias value into parts
        const alias_parts = alias_value.split(/ +(?=(?:(?:[^"']*["'][^"']*["'])*[^"']*$))/);

        // if ends with a space, remove the trailing empty part
        if (alias_value.endsWith(" ")) {
            alias_parts.pop();
        }

        // remove the current part and insert the alias parts
        sub.splice(i, 1, ...alias_parts);

        // adjust the index to account for the new parts
        i += alias_parts.length - 1;

        // if the alias value ends with a space, check the next part as well
        if (!alias_value.endsWith(" ")) {
            break;
        }
    }

    const skip_variable_sub_idxs = [];

    // remove quotes from arguments if starting and ending with quotes
    // if they are single quotes then disable substitution
    for (let i = 0; i < sub.length; i++) {
        if (i === 0) {
            // skip the first argument (the command)
            continue;
        }

        const arg = sub[i];

        if (arg.startsWith("\"") && arg.endsWith("\"")) {
            sub[i] = arg.slice(1, -1);
        }

        if (arg.startsWith("'") && arg.endsWith("'")) {
            sub[i] = arg.slice(1, -1);
            skip_variable_sub_idxs.push(i - 1); // skip variable substitution for this argument (adjust for slice)
        }
    }

    // the first word is the command, the rest are arguments
    const command = sub[0];

    if (command === "#") {
        // if the command is a comment, just ignore
        return null;
    }

    // determine if the line is a variable assignment with regex
    if (command.includes("=")) {
        const match = line.match(VAR_ASSIGNMENT_REGEX);

        if (match) {
            const var_name = match[1];
            let var_value = match[2];

            // remove single or double quotes from the value
            // TODO: make this more unixy when we add semicolons
            if (var_value.startsWith("'") || var_value.startsWith("\"")) {
                var_value = var_value.slice(1, -1);
            }

            // this is a variable assignment
            return {
                type: "var",

                var_name,
                var_value
            }
        }
    }

    const args = sub.slice(1);

    // if the last arg value is &, run in bg and remove it from args BEFORE variable substitution
    let run_in_bg = false;
    if (args.length > 0 && args[args.length - 1] === "&") {
        run_in_bg = true;
        args.pop();
    }

    const unsubbed_args = args.slice();

    // substitute args with variables
    for (let arg_idx = 0; arg_idx < args.length; arg_idx++) {
        if (skip_variable_sub_idxs.includes(arg_idx)) {
            // skip variable substitution for this argument
            continue;
        }

        let arg = args[arg_idx];

        // replaces any instance of $VAR or ${VAR} with the value of the variable VAR (alphabetical only except special var $?)
        // TODO: backslash to escape dollar sign without using single quotes
        arg = arg.replace(/\$(\w+|\?)|\$\{([^}]+)\}/g, (match, var1, var2) => {
            const var_name = var1 || var2;
            const var_value = memory ? memory.get_variable(var_name) : undefined;

            if (!var_value) {
                // if the variable is not set, return the original match
                return match;
            }

            return var_value;
        });

        args[arg_idx] = arg;
    }

    // this is a command
    return {
        type: "command",

        command,
        args,
        unsubbed_args,
        raw_parts,
        run_in_bg
    };
}
