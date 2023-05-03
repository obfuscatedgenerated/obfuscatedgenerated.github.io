import type { AsyncProgram } from "../types";
import { ANSI } from "../term_ctl";

import { image2sixel } from "sixel";


const convert_file_data_to_image_data = async (data: Uint8Array, mime: string) => {
    // create a canvas to draw the image on
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    // create an image to draw the png data on
    const img = new Image();
    img.src = URL.createObjectURL(new Blob([data], { type: mime }));

    // wait for the image to load via promise
    await new Promise((resolve, reject) => {
        img.onload = () => {
            resolve(null);
        };
    });

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

const MAX_COLORS = 256 * 3;

export default {
    name: "imagine",
    description: "Views images natively in the terminal.",
    usage_suffix: "<path> [-w <width>]",
    arg_descriptions: {
        "Arguments:": {
            "path": "The path to the image to view."
        },
        "Options:": {
            "-w": "The width of the image in columns. Defaults to the width of the image."
        }
    },
    async_main: async (data) => {
        // extract from data to make code less verbose
        const { args, term } = data;

        // extract from ANSI to make code less verbose
        const { STYLE, PREFABS } = ANSI;

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

        // process the path
        const abs_path = fs.absolute(path);
        if (!fs.exists(abs_path)) {
            term.write(`${PREFABS.error}No such file or directory: ${path}${STYLE.reset_all}`);
            return 1;
        }

        // check path is a .png or .jpg
        const ext = abs_path.slice(-4).toLowerCase();
        if (ext !== ".png" && ext !== ".jpg") {
            term.write(`${PREFABS.error}File is not a .png or .jpg: ${path}${STYLE.reset_all}`);
            return 1;
        }

        const mime = ext === ".png" ? "image/png" : "image/jpeg";

        // get the image data
        const content = fs.read_file(abs_path, true) as Uint8Array;
        const { array: img_data, width: img_width, height: img_height } = await convert_file_data_to_image_data(content, mime);

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
            const sixel = image2sixel(scaled_img_data, width_arg, new_height, MAX_COLORS);

            // write the sixel image to the terminal
            term.write(sixel);
        } catch (e) {
            term.write(`${PREFABS.error}Failed to convert image to sixel.${STYLE.reset_all}`);
            console.error(e);
            return 1;
        }

        return 0;
    }
} as AsyncProgram;