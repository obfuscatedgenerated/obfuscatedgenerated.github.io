import type { AsyncProgram } from "../types";

import { ANSI, NEWLINE } from "../term_ctl";

export default {
    name: "rss",
    description: "Reads from an RSS feed.",
    usage_suffix: "[-h] [url] [-m <items>]",
    arg_descriptions: {
        "Arguments:": {
            "url": "The URL to the XML feed (plaintext feed recommended). Defaults to https://blog.ollieg.codes/rss/feed.text.xml"
        },
        "Flags:": {
            "-h": "Print this help message.",
            "-m": "The maximum number of items to display. Defaults to no limit."
        }
    },
    async_main: async (data) => {
        // extract from data to make code less verbose
        const { args, term } = data;

        // extract from ANSI to make code less verbose
        const { PREFABS, STYLE, FG } = ANSI;

        if (args.includes("-h")) {
            term.execute("help rss");
            return 0;
        }

        let max_items: number | undefined = undefined;
        if (args.includes("-m")) {
            // get the index of the flag
            const index = args.indexOf("-m");

            // get the value after the flag
            const value = args[index + 1];

            // check if the value is valid
            if (!value || isNaN(parseInt(value)) || parseInt(value) < 0) {
                term.writeln(`${PREFABS.error}Invalid value for -m flag. Expected a positive integer.${STYLE.reset_all}`);
                return 1;
            }

            // set the max items
            max_items = parseInt(value);

            // remove the flag and value from the args
            args.splice(index, 2);
        }


        // check if the user provided a URL
        let url = "https://blog.ollieg.codes/rss/feed.text.xml";
        if (args.length !== 0) {
            url = args.shift();
        }

        // validate url
        try {
            const proc_url = new URL(url);

            if (proc_url.protocol !== "http:" && proc_url.protocol !== "https:") {
                throw new Error("Invalid protocol");
            }
        } catch (e) {
            term.writeln(`${PREFABS.error}Invalid URL. Expected a valid HTTP or HTTPS protocol URL.${STYLE.reset_all}`);
            return 1;
        }

        // fetch the feed
        // TODO: potential DRY with webget
        let response: Response;

        term.writeln(`${FG.green}Fetching feed...${STYLE.reset_all}`);

        try {
            response = await fetch(url);
        } catch (e) {
            term.writeln(`${PREFABS.error}Failed to fetch feed.${STYLE.reset_all}`);
            term.writeln(`${PREFABS.error}${"message" in e ? e.message : e}${STYLE.reset_all}`);
            console.error(e);

            return 1;
        }

        if (!response.ok) {
            term.writeln(`${PREFABS.error}Request not OK.${STYLE.reset_all}`);

            // get the error message
            const text = await response.text();

            if (text !== "") {
                term.writeln(`${PREFABS.error}${text}${STYLE.reset_all}`);
            }

            return 1;
        }

        // get the text
        const text = (await response.text()).replace(/\n/g, NEWLINE);

        // parse the text
        const parser = new DOMParser();

        let doc: Document;

        try {
            doc = parser.parseFromString(text, "text/xml");
        } catch (e) {
            term.writeln(`${PREFABS.error}Failed to parse feed.${STYLE.reset_all}`);
            term.writeln(`${PREFABS.error}${"message" in e ? e.message : e}${STYLE.reset_all}`);
            console.error(e);

            return 1;
        }

        term.write(NEWLINE);

        // print the title if it exists
        const feed_title = doc.getElementsByTagName("title").item(0)?.textContent ?? "Untitled feed";
        term.writeln(`${FG.cyan + STYLE.bold + STYLE.italic}${feed_title}${STYLE.reset_all}`);

        term.write(NEWLINE);
        term.writeln(`${FG.gray}------${STYLE.reset_all}`);
        term.write(NEWLINE);

        // get the items
        const items = doc.getElementsByTagName("item");

        if (max_items === undefined) {
            max_items = items.length;
        }

        // print the items
        for (let i = 0; i < max_items; i++) {
            const item = items.item(i);

            // check if the item exists
            if (!item) {
                // hit the end of the items, break
                break;
            }

            // get each field of the item if they exist

            // title
            const item_title = item.getElementsByTagName("title").item(0)?.textContent ?? "Untitled item";

            // link
            const link = item.getElementsByTagName("link").item(0)?.textContent ?? "";

            // description
            let description = item.getElementsByTagName("description").item(0)?.textContent ?? "";

            // if the description is html, attempt to convert it to plaintext
            if (description.startsWith("<![CDATA[")) {
                // remove the cdata tags
                description = description.substring(9, description.length - 3);

                // parse the description
                const description_doc = parser.parseFromString(description, "text/html");

                // get the html tag
                const html = description_doc.getElementsByTagName("html").item(0);

                // get the text content
                description = html?.textContent ?? description;
            }

            // pubDate
            const pubDate = item.getElementsByTagName("pubDate").item(0)?.textContent ?? "";

            // print the item
            term.writeln(`${FG.green + STYLE.bold + STYLE.underline}${item_title}${STYLE.reset_all}`);
            term.writeln(`${FG.cyan}${link}${STYLE.reset_all}`);
            term.writeln(`${FG.yellow}${pubDate}${STYLE.reset_all}`);
            term.write(NEWLINE);
            term.writeln(`${description}`);
            term.write(NEWLINE);
            term.writeln(`${FG.gray}------${STYLE.reset_all}`);
            term.write(NEWLINE);
        }

        return 0;
    }
} as AsyncProgram;