import type {Program} from "../../types";

export default {
    name: "jetty",
    description: "TTY init process",
    usage_suffix: "",
    arg_descriptions: {},
    hide_from_help: true,
    main: async (data) => {
        const {term, process} = data;

        term.reset();

        const fs = term.get_fs();

        // TODO: move this stuff term_ctl lifecycle stuff here, and some to a shell program

        // enable screen reader mode if stored in local storage
        if (localStorage.getItem("reader") === "true") {
            await term.execute("reader -s on");
        }

        // run .ollie_profile if it exists
        const absolute_profile = fs.absolute("~/.ollie_profile");
        await term.run_script(absolute_profile);

        // TODO: bring back the distinction between these two, because now mounting is handled before jetty runs, they are the same

        // run .ollierc if it exists (TODO: make shells and the OS different things! right now the difference is .ollierc runs after mounting so theres that)
        const absolute_rc = fs.absolute("~/.ollierc");
        await term.run_script(absolute_rc);

        process.detach(true);
        return 0;
    }
} as Program;
