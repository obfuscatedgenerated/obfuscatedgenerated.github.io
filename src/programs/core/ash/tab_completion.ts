import type {WrappedTerminal} from "../../../term_ctl";
import type {CompletionData} from "../../../types";

import {parse_line} from "./parser";

// TODO this is really poor OOP
let cached_matches: string[] = [];
let current_cached_match_index = 0;

const complete_command = (term: WrappedTerminal, discard_cached_matches: boolean) => {
    // get the program registry
    const registry = term.get_program_registry();
    const programs = registry.listProgramNames(true, true);

    // check for existing matches
    let match: string;
    if (!discard_cached_matches && cached_matches.length > 0) {
        // if the current line hasn't changed, just get the next match
        current_cached_match_index = (current_cached_match_index + 1) % cached_matches.length;
        match = cached_matches[current_cached_match_index] || "";
    } else {
        // if the current line has changed, refresh the matches
        cached_matches = programs.filter((program) => program.startsWith(term._current_line));
        current_cached_match_index = 0;

        // get the first match
        match = cached_matches[current_cached_match_index] || "";

        // mark as unmodified
        discard_cached_matches = false;
    }

    return {match, discard_cached_matches};
}

const is_async_generator = (obj: unknown): obj is AsyncGenerator<string> => {
    return obj && typeof obj[Symbol.asyncIterator] === "function";
}

const get_completeable_arguments = async (term: WrappedTerminal) => {
    // parse the line

    const parsed_line = parse_line(term._current_line);
    if (parsed_line.type !== "command") {
        console.warn("Tab completion for non-command lines is not yet implemented");
        return null;
    }

    // destructure parsed line
    const {command, args, unsubbed_args, raw_parts} = parsed_line;

    // get the command from the registry
    const registry = term.get_program_registry();
    const program = registry.getProgram(command);
    if (!program) {
        console.warn(`Tab completion for unknown command "${command}"`);
        return null;
    }

    // if the program has no completion generator, complete based on file paths
    if (!program.completion) {
        // TODO need to change data structure first
        console.warn(`Tab completion for command "${command}" with no completion generator is not yet implemented`);
        return null;
    }

    const completion_data = {
        term,
        command,
        args,
        raw_parts: raw_parts,
        unsubbed_args,
        current_partial: raw_parts[raw_parts.length - 1] || "",
        arg_index: raw_parts.length - 2, // -1 for current arg, -1 for program name
    };

    const completion_result = await program.completion(completion_data);

    // if the result is an async generator, get all values for now
    // in future this will be done incrementally, but the current data structure doesn't support that yet
    if (is_async_generator(completion_result)) {
        const results: string[] = [];
        for await (const value of completion_result) {
            results.push(value);
        }
        return results;
    } else {
        if (completion_result === null) {
            // TODO fall back to file path completion
            console.warn(`Tab completion for command "${command}" with null completion result is not yet implemented`);
            return null;
        }

        return completion_result;
    }
}

const complete_argument = async (term: WrappedTerminal, discard_cached_matches: boolean) => {
    // get the completeable arguments
    const completeable_arguments = await get_completeable_arguments(term);
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
        cached_matches = completeable_arguments.filter((arg) => arg.startsWith(term._current_line.split(" ").pop() || ""));
        current_cached_match_index = 0;

        // get the first match
        match = cached_matches[current_cached_match_index] || "";

        // mark as unmodified
        discard_cached_matches = false;
    }

    return {match, discard_cached_matches};
}

const fill_completed_command = (term: WrappedTerminal, match: string) => {
    // erase the current line
    term.write("\b \b".repeat(term._current_index));

    // write the match
    term.write(match);

    // NOTE: above is done rather than filling what is remaining because if tab is hit again, the next match will be written

    // update current line and index
    term._current_line = match;
    term._current_index = match.length;
}

const fill_completed_argument = (term: WrappedTerminal, match: string) => {
    // get the current line parts
    const parts = term._current_line.split(" ");
    const current_arg_partial = parts.pop() || "";

    // erase the current argument partial
    term.write("\b \b".repeat(current_arg_partial.length));

    // write the match
    term.write(match);

    // NOTE: above is done rather than filling what is remaining because if tab is hit again, the next match will be written

    // update current line and index
    parts.push(match);
    term._current_line = parts.join(" ");
    term._current_index = term._current_line.length;
}

// TODO: how does this work? would be good to make it linked to the terminal instance. what is discard_cached_matches even for?
export const tab_complete = async (term: WrappedTerminal, discard_cached_matches = false): Promise<boolean> => {
    // if the current line is empty, do nothing
    if (term._current_line.length === 0) {
        return;
    }

    // if the current line has no spaces, tab complete the command
    if (!term._current_line.includes(" ")) {
        const {match, discard_cached_matches: updated_discard} = complete_command(term, discard_cached_matches);
        discard_cached_matches = updated_discard;

        // if there is a match, tab complete
        if (match) {
            fill_completed_command(term, match);
        }
    } else {
        // otherwise, tab complete the argument
        const {match, discard_cached_matches: updated_discard} = await complete_argument(term, discard_cached_matches);
        discard_cached_matches = updated_discard;

        // if there is a match, tab complete
        if (match) {
            fill_completed_argument(term, match);
        }
    }

    return discard_cached_matches;
}

// TODO: the discard cache arg is janky. come up with a better solution. should also be using generators directly instead of arrays for completions

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
