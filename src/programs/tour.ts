import type { AsyncProgram } from "../types";
import { ANSI, NEWLINE, WrappedTerminal } from "../term_ctl";


const wait_block = (term: WrappedTerminal) => {
    term.write(NEWLINE);
    term.writeln(`${ANSI.STYLE.italic}Press any key to continue...${ANSI.STYLE.reset_all}`)
    return term.wait_for_keypress();
};

const run_cmd = async (term: WrappedTerminal, cmd: string) => {
    term.writeln(`${ANSI.STYLE.bold}$ ${cmd}${ANSI.STYLE.reset_all}${NEWLINE}`);
    await term.execute(cmd);
    term.write(NEWLINE);
};


const welcome = async (term: WrappedTerminal) => {
    // extract from ANSI to make code less verbose
    const { STYLE, PREFABS, FG } = ANSI;

    term.reset();

    term.writeln(`${STYLE.bold + FG.magenta}Welcome to OllieOS!`);
    term.writeln(`===================${STYLE.reset_all}`);
    term.write(NEWLINE);

    term.writeln("This tour covers the basic commands and features of OllieOS.");
    term.writeln(`First, let's use ${PREFABS.program_name}mefetch${STYLE.reset_all} to view info about me.`);
    term.write(NEWLINE);

    term.writeln("Normally, you would type the command into the terminal and press RETURN, but for this tour, the command will be run automatically.");
    term.write(NEWLINE);

    await wait_block(term);
};

const mefetch = async (term: WrappedTerminal) => {
    // extract from ANSI to make code less verbose
    const { STYLE, PREFABS, FG } = ANSI;

    term.reset();

    term.writeln(`${STYLE.bold + FG.magenta}mefetch`);
    term.writeln(`=======${STYLE.reset_all}`);
    term.write(NEWLINE);

    await run_cmd(term, "mefetch");

    term.writeln(`The ${PREFABS.program_name}mefetch${STYLE.reset_all} command is used to display information about a GitHub user.`);
    term.writeln("By default, it uses my username, obfuscatedgenerated. You can also specify a different username as an argument.");
    term.writeln("If another username is used, less information will be displayed.");
    term.write(NEWLINE);

    term.write(`Now, let's use ${PREFABS.program_name}rss${STYLE.reset_all} to read my blog.`);
    term.write(NEWLINE);

    await wait_block(term);
};

const rss = async (term: WrappedTerminal) => {
    // extract from ANSI to make code less verbose
    const { STYLE, PREFABS, FG } = ANSI;

    term.reset();

    term.writeln(`${STYLE.bold + FG.magenta}rss`);
    term.writeln(`===${STYLE.reset_all}`);
    term.write(NEWLINE);

    await run_cmd(term, "rss -m 1");

    term.writeln(`The ${PREFABS.program_name}rss${STYLE.reset_all} command is used to read RSS feeds.`);
    term.writeln("By default, it uses my blog's RSS feed. You can also specify a different RSS feed as an argument.");
    term.writeln("A plaintext RSS feed is recommended, but the program can also parse basic HTML.");
    term.write(NEWLINE);

    term.writeln("For the output above, the -m 1 flag was used to only display the first item in the feed. Without it, all items would be displayed.");
    term.write(NEWLINE);

    term.writeln(`Let's use the ${PREFABS.program_name}help${STYLE.reset_all} command to view a list of all available commands, and to get help with a specific command.`);
    term.write(NEWLINE);

    await wait_block(term);
};

const help = async (term: WrappedTerminal) => {
    // extract from ANSI to make code less verbose
    const { STYLE, PREFABS, FG } = ANSI;

    term.reset();

    term.writeln(`${STYLE.bold + FG.magenta}help`);
    term.writeln(`====${STYLE.reset_all}`);
    term.write(NEWLINE);

    await run_cmd(term, "help");

    term.write(NEWLINE);
    term.write(NEWLINE);

    term.writeln(`The ${PREFABS.program_name}help${STYLE.reset_all} command is used to view a list of all available commands, and to get help with a specific command.`);
    term.writeln("If a command is specified as an argument, the help text for that command will be displayed.");
    term.write(NEWLINE);

    term.writeln(`For example, let's view the help text for the ${PREFABS.program_name}rss${STYLE.reset_all} command:`);
    term.write(NEWLINE);

    await run_cmd(term, "help rss");

    await wait_block(term);
};


const end = async (term: WrappedTerminal) => {
    // extract from ANSI to make code less verbose
    const { STYLE, FG } = ANSI;

    term.reset();

    term.writeln(`${STYLE.bold + FG.magenta}Thanks for using OllieOS!`);
    term.writeln(`=========================${STYLE.reset_all}`);
    term.write(NEWLINE);

    term.writeln("That's all for now! Thanks for using OllieOS.");
    term.writeln("The OS will now restart.");
    term.write(NEWLINE);

    await wait_block(term);

    term.execute("shutdown -r -t 0");
};


export default {
    name: "tour",
    description: "Runs the onboarding tour.",
    usage_suffix: "",
    arg_descriptions: {},
    async_main: async (data) => {
        // extract from data to make code less verbose
        const { term } = data;

        await welcome(term);

        await mefetch(term);
        await rss(term);
        await help(term);

        await end(term);

        return 0;
    }
} as AsyncProgram;
