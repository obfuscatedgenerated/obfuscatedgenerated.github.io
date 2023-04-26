import type { AsyncProgram } from "../types";

import { ANSI, NEWLINE } from "../term_ctl";

import { convert as convert_html_to_text } from "html-to-text";

const HTML_TAG_REGEX = /<\/?[a-z][\s\S]*>/i;

export default {
    name: "rss",
    description: "Reads from an RSS feed.",
    usage_suffix: "[-h] [url] [-m <items>]",
    arg_descriptions: {
        "Arguments:": {
            "url": "The URL to the XML feed (plaintext feed recommended, unless the HTML is basic). Defaults to https://blog.ollieg.codes/rss/feed.xml"
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
        let url = "https://blog.ollieg.codes/rss/feed.xml";
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

        // get the text and convert newlines (\r\n or \n) to the terminal's newline
        const text = (await response.text()).replace(/\r\n|\n/g, NEWLINE);

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

        // print the site link if it exists
        const site_link = doc.getElementsByTagName("link").item(0)?.textContent ?? "";
        term.writeln(`${FG.cyan}${site_link}${STYLE.reset_all}`);

        // print the site description if it exists
        const site_description = doc.getElementsByTagName("description").item(0)?.textContent ?? "";
        term.writeln(`${site_description}`);

        term.write(NEWLINE);
        term.writeln(`${FG.gray}------${STYLE.reset_all}`);
        term.write(NEWLINE);

        // get the items
        const items = doc.getElementsByTagName("item");

        if (max_items === undefined) {
            max_items = items.length;
        }

        // print the items
        for (let item_idx = 0; item_idx < max_items; item_idx++) {
            const item = items.item(item_idx);

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
            if (HTML_TAG_REGEX.test(description)) {
                term.writeln(`${FG.gray}(interpreting description as HTML)${STYLE.reset_all}`)
                term.write(NEWLINE);

                // reparse as html
                description = item.getElementsByTagName("description").item(0)?.innerHTML ?? "";

                // remove CDATA tags if present
                description = description.replace(/<!\[CDATA\[|\]\]>/g, "");

                // parse the description using custom highlighters
                description = convert_html_to_text(description,
                    {
                        formatters: {
                            "ansi_formatter": (elem, walk, builder, options) => {
                                builder.openBlock();
                                builder.addInline(options.opener);
                                walk(elem.children, builder);
                                builder.addInline(STYLE.reset_all);
                                builder.closeBlock();
                            },
                            "img_highlight": (elem, walk, builder, options) => {
                                const img_fmt = builder.options.formatters["image"];
                                if (img_fmt) {
                                    builder.addInline(STYLE.bold + FG.magenta);
                                    img_fmt(elem, walk, builder, options);
                                    builder.addInline(STYLE.reset_all);
                                }
                            },
                            "a_highlight": (elem, walk, builder, options) => {
                                const a_fmt = builder.options.formatters["anchor"];
                                if (a_fmt) {
                                    builder.addInline(STYLE.bold + FG.blue);
                                    a_fmt(elem, walk, builder, options);
                                    builder.addInline(STYLE.reset_all);
                                }
                            }
                        },
                        selectors: [
                            {
                                selector: "b",
                                format: "ansi_formatter",
                                options: {
                                    opener: STYLE.bold
                                }
                            },
                            {
                                selector: "strong",
                                format: "ansi_formatter",
                                options: {
                                    opener: STYLE.bold
                                }
                            },
                            {
                                selector: "i",
                                format: "ansi_formatter",
                                options: {
                                    opener: STYLE.italic
                                }
                            },
                            {
                                selector: "em",
                                format: "ansi_formatter",
                                options: {
                                    opener: STYLE.italic
                                }
                            },
                            {
                                selector: "u",
                                format: "ansi_formatter",
                                options: {
                                    opener: STYLE.underline
                                }
                            },
                            {
                                selector: "img",
                                format: "img_highlight"
                            },
                            {
                                selector: "a",
                                format: "a_highlight"
                            }
                        ]
                    }
                );
            }

            // trim start and end whitespace
            description = description.trim();

            // replace newlines again in case the description was html
            description = description.replace(/\r\n|\n/g, NEWLINE);

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