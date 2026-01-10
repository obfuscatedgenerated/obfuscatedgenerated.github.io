import type { Program } from "../types";
import { ANSI, NEWLINE } from "../term_ctl";

import { default as img2ascii } from "imgToAscii";


// TODO: DRY with mefetch
const convert_to_ascii = async (url: string, size: number): Promise<string> => {
    const img = new img2ascii(url, size, Math.round(size / 2));
    await img.loadImage;

    // convert newlines in string
    const ascii = img.stringANSI8BitColor.replace(/\n/g, NEWLINE);
    return ascii;
}

export default {
    name: "ascmagine",
    description: "Views images as ANSI/ASCII art.",
    usage_suffix: "path [-w width] [-u]",
    arg_descriptions: {
        "Arguments:": {
            "path": "The path to the image to view."
        },
        "Options:": {
            "-w": "The width of the image in COLUMNS. Defaults to the width of the terminal.",
            "-u": "Path is an web URL instead of a local filesystem path."
        }
    },
    compat: "2.0.0",
    // TODO: completion
    main: async (data) => {
        // extract from data to make code less verbose
        const { kernel, args, term } = data;

        // extract from ANSI to make code less verbose
        const { STYLE, PREFABS, FG } = ANSI;

        // get fs
        const fs = kernel.get_fs();

        // get the path to the image
        const path = args[0];

        if (!path) {
            term.writeln(`${PREFABS.error}No path specified.${STYLE.reset_all}`);
            return 1;
        }

        // get the width of the image specified or the terminal width
        const width_arg = args.includes("-w") ? parseInt(args[args.indexOf("-w") + 1]) : undefined;
        const is_web_url = args.includes("-u");

        let url: string;
        if (!is_web_url) {
            // process the path
            url = fs.absolute(path);
            if (!(await fs.exists(url))) {
                term.writeln(`${PREFABS.error}No such file or directory: ${path}${STYLE.reset_all}`);
                return 1;
            }

            // convert to blob
            const content = await fs.read_file(url, true) as Uint8Array;
            //@ts-expect-error
            const blob = new Blob([content]);

            // attempt createImageBitmap on the file to determine if it's a canvas-compatible image in the browser
            if (typeof createImageBitmap === "function") {
                try {
                    // using tiny region at low res for efficiency
                    await createImageBitmap(blob, 0, 0, 1, 1);
                } catch (e) {
                    term.writeln(`${PREFABS.error}File is not a valid image: ${path}. Did you download it as a binary file?${STYLE.reset_all}`);
                    return 1;
                }
            } else {
                term.writeln(`${FG.yellow}Warning: ${STYLE.reset_all}createImageBitmap is not supported in this browser. Falling back to list of trusted image formats.${STYLE.reset_all}`)
                
                const trusted_formats = [".png", ".jpg", ".jpeg", ".gif", ".bmp", ".ico", ".svg"];
                const ext = url.slice(-4).toLowerCase();

                if (!(trusted_formats.includes(ext))) {
                    term.writeln(`${PREFABS.error}File is not a valid image: ${path}. Did you download it as a binary file?${STYLE.reset_all}`);
                    return 1;
                }
            }

            // create a blob URL
            //@ts-expect-error
            url = URL.createObjectURL(new Blob([content]));

        } else {
            // check path is a valid URL
            try {
                new URL(path);
                url = path;
            } catch (e) {
                term.writeln(`${PREFABS.error}Invalid URL: ${path}${STYLE.reset_all}`);
                return 1;
            }

            // do a HEAD request to check the mime type
            const head_req = await fetch(url, { method: "HEAD" });
            let mime: string;

            // if the HEAD request failed, try a GET request
            if (!head_req.ok) {
                console.log("HEAD request failed, trying GET request");
                const get_req = await fetch(url);

                // if the GET request failed, error
                if (!get_req.ok) {
                    term.writeln(`${PREFABS.error}URL is not accessible: ${url}${STYLE.reset_all}`);
                    return 1;
                }

                mime = get_req.headers.get("content-type");
            } else {
                mime = head_req.headers.get("content-type");
            }

            // check the mime type is valid
            if (!mime.startsWith("image/")) {
                term.writeln(`${PREFABS.error}URL is not an image: ${url}${STYLE.reset_all}`);
                return 1;
            }
        }

        // get the image
        const img = await convert_to_ascii(url, width_arg || term.cols - 1);

        // write the image
        term.write(img);

        return 0;
    }
} as Program;