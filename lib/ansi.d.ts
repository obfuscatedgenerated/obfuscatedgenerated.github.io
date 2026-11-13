/**
 * Pure terminal formatting helpers: ANSI constants, regex factories and text utilities.
 *
 * This module has no kernel dependencies and holds no authority, so it is safe to bundle into any program.
 * Builtins import it directly. Packages should import it from `ollieos/ansi` rather than going through the terminal.
 *
 * @module
 */
export declare const NEWLINE = "\r\n";
export declare const ANSI: Readonly<{
    FG: Readonly<{
        reset: string;
        black: string;
        red: string;
        green: string;
        yellow: string;
        blue: string;
        magenta: string;
        cyan: string;
        white: string;
        gray: string;
    }>;
    BG: Readonly<{
        reset: string;
        black: string;
        red: string;
        green: string;
        yellow: string;
        blue: string;
        magenta: string;
        cyan: string;
        white: string;
        gray: string;
    }>;
    STYLE: Readonly<{
        reset_all: string;
        bold: string;
        dim: string;
        no_bold_or_dim: string;
        italic: string;
        no_italic: string;
        underline: string;
        double_underline: string;
        no_underline: string;
        inverse: string;
        no_inverse: string;
        hidden: string;
        no_hidden: string;
        strikethrough: string;
        no_strikethrough: string;
        negative: string;
        positive: string;
    }>;
    CURSOR: Readonly<{
        invisible: string;
        visible: string;
    }>;
    PREFABS: Readonly<{
        program_name: string;
        error: string;
        variable_name: string;
        file_path: string;
        dir_name: string;
        secret: string;
    }>;
}>;
/**
 * @returns A fresh global regex matching non-printable characters.
 *
 * @group ANSI
 */
export declare const non_printable_regex: () => RegExp;
/**
 * @returns A fresh global regex matching textual ANSI escape representations.
 *
 * @group ANSI
 */
export declare const ansi_escape_regex: () => RegExp;
/**
 * @returns A fresh global regex matching raw ANSI SGR sequences.
 *
 * @group ANSI
 */
export declare const ansi_unescaped_regex: () => RegExp;
/**
 * Checks whether a string (typically a single key) contains no non-printable characters.
 *
 * @group ANSI
 */
export declare const is_printable: (text: string) => boolean;
/**
 * Removes raw ANSI SGR sequences (colours and styles) from text, e.g. to measure its visible length.
 *
 * @group ANSI
 */
export declare const strip_ansi: (text: string) => string;
/**
 * Wraps text to the given width, breaking on spaces and preserving existing newlines.
 *
 * @group ANSI
 */
export declare const word_wrap: (text: string, width: number) => string;
