import type {UserspaceKernel} from "../../../kernel";
import type {ReadLineBuffer, AbstractTerminal, UserspaceTerminal} from "../../../kernel/term_ctl";
import type {CompletionData} from "../../../types";

import {parse_line} from "./parser";
import {AbstractShell} from "../../../abstract_shell";

// TODO this is really poor OOP
let cached_matches: string[] = [];
let current_cached_match_index = 0;

const complete_command = async (buffer: ReadLineBuffer, discard_cached_matches: boolean, kernel: UserspaceKernel) => {
    // get the program registry
    const programs = await kernel.list_programs();

    // check for existing matches
    let match: string;
    if (!discard_cached_matches && cached_matches.length > 0) {
        // if the current line hasn't changed, just get the next match
        current_cached_match_index = (current_cached_match_index + 1) % cached_matches.length;
        match = cached_matches[current_cached_match_index] || "";
    } else {
        // if the current line has changed, refresh the matches
        cached_matches = programs.filter(({name}) => name.startsWith(buffer.current_line)).map(({name}) => name);
        current_cached_match_index = 0;

        // get the first match
        match = cached_matches[current_cached_match_index] || "";

        // mark as unmodified
        discard_cached_matches = false;
    }

    return {match, discard_cached_matches};
}

const get_completeable_arguments = async (buffer: ReadLineBuffer, term: UserspaceTerminal, kernel: UserspaceKernel, shell?: AbstractShell) => {
    // parse the line

    const parsed_line = parse_line(buffer.current_line);
    if (!parsed_line) {
        console.warn("Tab completion for invalid lines is not yet implemented");
        return null;
    }

    if (parsed_line.type !== "command") {
        console.warn("Tab completion for non-command lines is not yet implemented");
        return null;
    }

    // destructure parsed line
    const {command, args, unsubbed_args, raw_parts} = parsed_line;

    const completion_data = {
        term,
        kernel,
        shell,
        command,
        args,
        raw_parts: raw_parts,
        unsubbed_args,
        current_partial: raw_parts[raw_parts.length - 1] || "",
        arg_index: raw_parts.length - 2, // -1 for current arg, -1 for program name
    };

    // the kernel runs the completion, in the program's own isothread if it has one
    const completion_result = await kernel.complete(command, completion_data);

    if (completion_result === null) {
        // TODO fall back to file path completion
        console.warn(`Tab completion for command "${command}" with no completions is not yet implemented`);
        return null;
    }

    return completion_result;
}

const complete_argument = async (buffer: ReadLineBuffer, discard_cached_matches: boolean, kernel: UserspaceKernel, term: UserspaceTerminal, shell?: AbstractShell) => {
    // get the completeable arguments
    const completeable_arguments = await get_completeable_arguments(buffer, term, kernel, shell);
    if (!completeable_arguments) {
        return {match: "", discard_cached_matches};
    }

    // check for existing matches
    let match: string;
    if (!discard_cached_matches && cached_matches.length > 0) {
        // if the current line hasn't changed, just get the next match
        current_cached_match_index = (current_cached_match_index + 1) % cached_matches.length;
        match = cached_matches[current_cached_match_index] || "";
    } else {
        // if the current line has changed, refresh the matches
        cached_matches = completeable_arguments.filter((arg) => arg.startsWith(buffer.current_line.split(" ").pop() || ""));
        current_cached_match_index = 0;

        // get the first match
        match = cached_matches[current_cached_match_index] || "";

        // mark as unmodified
        discard_cached_matches = false;
    }

    return {match, discard_cached_matches};
}

const fill_completed_command = (term: UserspaceTerminal, buffer: ReadLineBuffer, match: string) => {
    // erase the current line
    term.write("\b \b".repeat(buffer.current_index));

    // write the match
    term.write(match);

    // NOTE: above is done rather than filling what is remaining because if tab is hit again, the next match will be written

    // update current line and index
    buffer.set_current_line(match);
    buffer.set_current_index(match.length);
}

const fill_completed_argument = (term: UserspaceTerminal, buffer: ReadLineBuffer, match: string) => {
    // get the current line parts
    const parts = buffer.current_line.split(" ");
    const current_arg_partial = parts.pop() || "";

    // erase the current argument partial
    term.write("\b \b".repeat(current_arg_partial.length));

    // write the match
    term.write(match);

    // NOTE: above is done rather than filling what is remaining because if tab is hit again, the next match will be written

    // update current line and index
    parts.push(match);
    buffer.set_current_line(parts.join(" "));
    buffer.set_current_index(buffer.current_line.length);
}

// TODO: how does this work? would be good to make it linked to the terminal instance. what is discard_cached_matches even for?
export const tab_complete = async (buffer: ReadLineBuffer, term: UserspaceTerminal, kernel: UserspaceKernel, shell?: AbstractShell, discard_cached_matches = false): Promise<boolean | null> => {
    // if the current line is empty, do nothing
    if (buffer.current_line.length === 0) {
        return null;
    }

    // if the current line has no spaces, tab complete the command
    if (!buffer.current_line.includes(" ")) {
        const {match, discard_cached_matches: updated_discard} = await complete_command(buffer, discard_cached_matches, kernel);
        discard_cached_matches = updated_discard;

        // if there is a match, tab complete
        if (match) {
            fill_completed_command(term, buffer, match);
        }
    } else {
        // otherwise, tab complete the argument
        const {match, discard_cached_matches: updated_discard} = await complete_argument(buffer, discard_cached_matches, kernel, term, shell);
        discard_cached_matches = updated_discard;

        // if there is a match, tab complete
        if (match) {
            fill_completed_argument(term, buffer, match);
        }
    }

    return discard_cached_matches;
}

// TODO: the discard cache arg is janky. come up with a better solution. should also be using generators directly instead of arrays for completions
// TODO: would be much better as a class that maintains its own state and remembers term, kernel etc.

export const helper_completion_options = (options: string[]) => {
    return async function* (data: CompletionData): AsyncGenerator<string> {
        const {current_partial} = data;
        for (const option of options) {
            if (option.startsWith(current_partial)) {
                yield option;
            }
        }
    };
}

export const helper_completion_options_ordered = (options: string[][]) => {
    return async function* (data: CompletionData): AsyncGenerator<string> {
        const {current_partial, raw_parts} = data;
        const index = raw_parts.length - 1;
        const options_at_index = options[index] || [];
        for (const option of options_at_index) {
            if (option.startsWith(current_partial)) {
                yield option;
            }
        }
    };
}

// TODO: make these helpers available to 3rd party programs