import type { Program } from "../types";
import { ANSI } from "../term_ctl";

import { image2sixel } from "sixel";


// returns null if image is invalid
const convert_to_image_data = async (url: string) => {
    // create a canvas to draw the image on
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    // create an image to draw the png data on
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = url;

    // wait for the image to load via promise
    try {
        await new Promise((resolve, reject) => {
            img.onload = () => {
                resolve(null);
            };

            img.onerror = () => {
                reject(null);
            };
        });
    } catch (e) {
        return null;
    }

    // draw the image on the canvas
    canvas.width = img.width;
    canvas.height = img.height;
    ctx.drawImage(img, 0, 0);

    // get the image data
    const img_data = ctx.getImageData(0, 0, img.width, img.height);

    // convert image data to uint8array
    const data_arr = new Uint8Array(img_data.data);

    return { array: data_arr, width: img.width, height: img.height };
};

export default {
    name: "imagine",
    description: "Views images natively in the terminal.",
    usage_suffix: "path [-w width] [-u]",
    arg_descriptions: {
        "Arguments:": {
            "path": "The path to the image to view."
        },
        "Options:": {
            "-w": "The width of the image in PIXELS. Defaults to the width of the image.",
            "-u": "Path is an web URL instead of a local filesystem path."
        }
    },
    // TODO: completion
    main: async (data) => {
        // extract from data to make code less verbose
        const { kernel, args, term } = data;

        // extract from ANSI to make code less verbose
        const { STYLE, PREFABS } = ANSI;

        // get fs
        const fs = kernel.get_fs();

        // get the path to the image
        const path = args[0];

        if (!path) {
            term.writeln(`${PREFABS.error}No path specified.${STYLE.reset_all}`);
            return 1;
        }

        // get the width of the image specified or the terminal width
        let width_arg = args.includes("-w") ? parseInt(args[args.indexOf("-w") + 1]) : undefined;
        const is_web_url = args.includes("-u");

        let url: string;
        let mime: string;
        if (!is_web_url) {
            // process the path
            url = fs.absolute(path);
            if (!(await fs.exists(url))) {
                term.writeln(`${PREFABS.error}No such file or directory: ${path}${STYLE.reset_all}`);
                return 1;
            }

            // get the extension
            const ext = url.slice(-4).toLowerCase();

            // get the mime type
            switch (ext) {
                case ".png":
                    mime = "image/png";
                    break;
                case ".jpg":
                case "jpeg":
                    mime = "image/jpeg";
                    break;
                case ".gif":
                    mime = "image/gif";
                    break;
                default:
                    term.writeln(`${PREFABS.error}File is not known to be a .png, .jpg/.jpeg or .gif: ${url}${STYLE.reset_all}`);
                    return 1;
            }


            // convert to blob URL
            const content = await fs.read_file(url, true) as Uint8Array;
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

            // do a HEAD request to get the mime type
            try {
                const head_req = await fetch(url, { method: "HEAD" });

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
                if (["image/png", "image/jpeg", "image/gif"].indexOf(mime) === -1) {
                    term.writeln(`${PREFABS.error}URL does not point to a .png, .jpg/.jpeg or .gif: ${url}${STYLE.reset_all}`);
                    return 1;
                }
            } catch (e) {
                term.writeln(`${PREFABS.error}Error accessing URL: ${url}${STYLE.reset_all}`);
                return 1;
            }
        }

        const data_out = await convert_to_image_data(url);

        if (!data_out) {
            term.writeln(`${PREFABS.error}Failed to convert image to data. Did you download it as a binary file?${STYLE.reset_all}`);
            return 1;
        }

        const { array: img_data, width: img_width, height: img_height } = data_out

        if (!width_arg) {
            width_arg = img_width;
        }

        // scale the height to fit the width
        const width_scale = width_arg / img_width;
        const new_height = img_height * width_scale;

        // scale the image data by chopping every nth pixel
        const scaled_img_data = new Uint8Array(width_arg * new_height * 4);
        for (let i = 0; i < scaled_img_data.length; i++) {
            const x = Math.floor(i / 4) % width_arg;
            const y = Math.floor(Math.floor(i / 4) / width_arg);

            const scaled_x = Math.floor(x / width_scale);
            const scaled_y = Math.floor(y / width_scale);

            const scaled_i = (scaled_y * img_width + scaled_x) * 4 + (i % 4);

            scaled_img_data[i] = img_data[scaled_i];
        }

        try {
            // convert the Uint8Array to a sixel image
            const sixel = image2sixel(scaled_img_data, width_arg, new_height);

            // write the sixel image to the terminal
            term.write(sixel);
        } catch (e) {
            term.writeln(`${PREFABS.error}Failed to convert image to sixel.${STYLE.reset_all}`);
            console.error(e);
            return 1;
        }

        return 0;
    }
} as Program;