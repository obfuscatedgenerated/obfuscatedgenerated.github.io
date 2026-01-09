import type {Program, ProgramMainData} from "../types";
import { ANSI, NEWLINE, type WrappedTerminal } from "../term_ctl";


const wait_block = (term: WrappedTerminal) => {
    term.write(NEWLINE);
    term.writeln(`${ANSI.STYLE.italic}Press any key to continue...${ANSI.STYLE.reset_all}`)
    return term.wait_for_keypress();
};

const run_cmd = async (data: ProgramMainData, cmd: string, args: string[] = []) => {
    data.term.writeln(`${ANSI.STYLE.bold}$ ${cmd}${ANSI.STYLE.reset_all}${NEWLINE}`);
    await data.kernel.spawn(cmd, args, data.shell).completion;
    data.term.write(NEWLINE);
};


const welcome = async (data: ProgramMainData) => {
    // extract from ANSI to make code less verbose
    const { STYLE, PREFABS, FG } = ANSI;

    const { term } = data;

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

const mefetch = async (data: ProgramMainData) => {
    // extract from ANSI to make code less verbose
    const { STYLE, PREFABS, FG } = ANSI;

    const { term } = data;

    term.reset();

    term.writeln(`${STYLE.bold + FG.magenta}mefetch`);
    term.writeln(`=======${STYLE.reset_all}`);
    term.write(NEWLINE);

    await run_cmd(data, "mefetch");

    term.writeln(`The ${PREFABS.program_name}mefetch${STYLE.reset_all} command is used to display information about a GitHub user.`);
    term.writeln("By default, it uses my username, obfuscatedgenerated. You can also specify a different username as an argument.");
    term.writeln("If another username is used, less information will be displayed.");
    term.write(NEWLINE);

    term.write(`Now, let's use ${PREFABS.program_name}rss${STYLE.reset_all} to read my blog.`);
    term.write(NEWLINE);

    await wait_block(term);
};

const rss = async (data: ProgramMainData) => {
    // extract from ANSI to make code less verbose
    const { STYLE, PREFABS, FG } = ANSI;

    const { term } = data;

    term.reset();

    term.writeln(`${STYLE.bold + FG.magenta}rss`);
    term.writeln(`===${STYLE.reset_all}`);
    term.write(NEWLINE);

    await run_cmd(data, "rss", ["-m", "1"]);

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

const fs = async (data: ProgramMainData) => {
    // extract from ANSI to make code less verbose
    const { STYLE, PREFABS, FG } = ANSI;

    const { term } = data;

    term.reset();

    term.writeln(`${STYLE.bold + FG.magenta}Filesystem`);
    term.writeln(`==========${STYLE.reset_all}`);
    term.write(NEWLINE);

    term.writeln("OllieOS has a filesystem, which is used to store files and folders.");
    term.writeln("The filesystem is persistent, so files and folders will not be deleted when the OS is restarted.");
    term.write(NEWLINE);

    term.writeln(`Let's use the ${PREFABS.program_name}ls${STYLE.reset_all} command to view the contents of the home directory.`);
    term.write(NEWLINE);

    await run_cmd(data, "ls");

    term.writeln(`There's a file in the directory called ${PREFABS.file_path}credits.txt${STYLE.reset_all}. Let's use the ${PREFABS.program_name}cat${STYLE.reset_all} command to view its contents.`);
    term.write(NEWLINE);

    await wait_block(term);
    await run_cmd(data, "cat", ["credits.txt"]);

    term.writeln(`The ${PREFABS.program_name}cat${STYLE.reset_all} command is used to view the contents of one or more files.`);
    term.writeln("If multiple files are specified, their contents will be concatenated together.");
    term.write(NEWLINE);
    
    term.writeln(`There are many other commands that can be used to interact with the filesystem, such as ${PREFABS.program_name}cd${STYLE.reset_all}, ${PREFABS.program_name}fsedit${STYLE.reset_all}, ${PREFABS.program_name}rm${STYLE.reset_all}, and more.`);
    term.writeln(NEWLINE);

    await wait_block(term);
};

const help = async (data: ProgramMainData) => {
    // extract from ANSI to make code less verbose
    const { STYLE, PREFABS, FG } = ANSI;

    const { term } = data;

    term.reset();

    term.writeln(`${STYLE.bold + FG.magenta}help`);
    term.writeln(`====${STYLE.reset_all}`);
    term.write(NEWLINE);

    await run_cmd(data, "help");

    term.write(NEWLINE);
    term.write(NEWLINE);

    term.writeln(`The ${PREFABS.program_name}help${STYLE.reset_all} command is used to view a list of all available commands, and to get help with a specific command.`);
    term.writeln("If a command is specified as an argument, the help text for that command will be displayed.");
    term.write(NEWLINE);

    term.writeln(`For example, let's view the help text for the ${PREFABS.program_name}rss${STYLE.reset_all} command:`);
    term.write(NEWLINE);

    await wait_block(term);
    await run_cmd(data, "help", ["rss"]);

    await wait_block(term);
};


const end = async (data: ProgramMainData,) => {
    // extract from ANSI to make code less verbose
    const { STYLE, FG, PREFABS } = ANSI;

    const { term } = data;

    term.reset();

    term.writeln(`${STYLE.bold + FG.magenta}Thanks for using OllieOS!`);
    term.writeln(`=========================${STYLE.reset_all}`);
    term.write(NEWLINE);

    term.writeln("That's all for now!");
    term.writeln("There is a lot more to explore, so feel free to play around with the OS and try out different commands.");
    term.write(NEWLINE);

    term.writeln("Things to try:");
    term.writeln(` - Use ${PREFABS.program_name}mefetch${STYLE.reset_all}, passing your GitHub username as an argument.`);
    term.writeln(` - Use ${PREFABS.program_name}cd${STYLE.reset_all} to enter the ${PREFABS.dir_name}projects${STYLE.reset_all} directory, and then use ${PREFABS.program_name}ls${STYLE.reset_all} to view its contents.`);
    term.writeln(` - Use ${PREFABS.program_name}imagine${STYLE.reset_all} and ${PREFABS.program_name}ascmagine${STYLE.reset_all} to view an image.`);
    term.writeln(` - Use ${PREFABS.program_name}fsedit${STYLE.reset_all} to explore the filesystem.`);
    term.writeln(` - Use ${PREFABS.program_name}webget${STYLE.reset_all} to download a file from the Internet into the OS.`);
    term.write(NEWLINE);

    term.writeln("Thanks for using OllieOS.");
    term.writeln("The OS will now restart.");
    term.write(NEWLINE);

    await wait_block(term);

    await run_cmd(data, "shutdown", ["-r", "-t", "0"]);
};


export default {
    name: "tour",
    description: "Runs the onboarding tour.",
    usage_suffix: "",
    arg_descriptions: {},
    completion: async () => [],
    main: async (data) => {
        await welcome(data);

        await mefetch(data);
        await rss(data);
        await fs(data);
        await help(data);

        await end(data);

        return 0;
    }
} as Program;
