import type { SyncProgram } from "../types";
import { ANSI } from "../term_ctl";

import { image2sixel } from "sixel";


// TODO: implement indexeddb fs to allow saving binary files properly
const convert_file_data_to_image_data = (data: Uint8Array, mime: string) => {
    // get the png data
    const file_data = new Uint8Array(data);

    // create a canvas to draw the image on
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    // create an image to draw the png data on
    const img = new Image();
    img.src = URL.createObjectURL(new Blob([file_data], { type: mime }));

    // draw the image on the canvas
    ctx.drawImage(img, 0, 0);

    // get the image data
    const img_data = ctx.getImageData(0, 0, canvas.width, canvas.height);

    // convert image data to uint8array
    const data_arr = new Uint8Array(img_data.data);

    return { array: data_arr, width: img_data.width, height: img_data.height };
};

export default {
    name: "imagine",
    description: "Views images natively in the terminal.",
    usage_suffix: "<path> [-w <width>] [-u]",
    arg_descriptions: {
        "Arguments:": {
            "path": "The path to the image to view."
        },
        "Options:": {
            "-w": "The width of the image in columns. Defaults to the width of the image.",
            "-u": "Path is an web URL instead of a local filesystem path."
        }
    },
    main: (data) => {
        // extract from data to make code less verbose
        const { args, term } = data;

        // extract from ANSI to make code less verbose
        const { STYLE, PREFABS } = ANSI;

        //if (!args.includes("-letmein")) {
        //    term.write(`${PREFABS.error}This program is currently in development.${STYLE.reset_all}`);
        //    return 1;
        //}

        // get fs
        const fs = term.get_fs();

        // get the path to the image
        const path = args[0];

        if (!path) {
            term.write(`${PREFABS.error}No path specified.${STYLE.reset_all}`);
            return 1;
        }

        // get the width of the image specified or the terminal width
        let width_arg = args.includes("-w") ? parseInt(args[args.indexOf("-w") + 1]) : undefined;
        const is_web_url = args.includes("-u");

        let abs_path: string;
        if (!is_web_url) {
            // process the path
            abs_path = fs.absolute(path);
            if (!fs.exists(abs_path)) {
                term.write(`${PREFABS.error}No such file or directory: ${path}${STYLE.reset_all}`);
                return 1;
            }

        } else {
            // check path is a valid URL
            try {
                new URL(path);
                abs_path = path;
            } catch (e) {
                term.write(`${PREFABS.error}Invalid URL: ${path}${STYLE.reset_all}`);
                return 1;
            }
        }

        // check path is a .png or .jpg
        const ext = abs_path.slice(-4);
        if (ext !== ".png" && ext !== ".jpg") {
            term.write(`${PREFABS.error}File is not a .png or .jpg: ${path}${STYLE.reset_all}`);
            return 1;
        }

        const mime = ext === ".png" ? "image/png" : "image/jpeg";

        // get the image data
        const content = fs.read_file(abs_path, true) as Uint8Array;
        const { array: img_data, width: img_width, height: img_height } = convert_file_data_to_image_data(content, mime);

        if (!width_arg) {
            width_arg = img_width;
        }

        // scale the height to fit the width
        const width_scale = width_arg / img_width;
        const new_height = img_height * width_scale;

        try {
            // convert the Uint8Array to a sixel image
            const sixel = image2sixel(img_data, width_arg, new_height);

            // write the sixel image to the terminal
            term.write(sixel);
        } catch (e) {
            term.write(`${PREFABS.error}Failed to convert image to sixel.${STYLE.reset_all}`);
            console.error(e);
            return 1;
        }

        return 0;
    }
} as SyncProgram;