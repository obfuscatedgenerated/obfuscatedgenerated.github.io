import type { SyncProgram } from "../types";
import { ANSI } from "../term_ctl";

import { image2sixel } from "sixel";
import { NotBase64Error } from "../filesystem";


const b64_image_to_uint8 = (image_b64: string, mime: string): { array: Uint8Array, width: number, height: number } => {
    const img = new Image();
    img.src = `data:${mime};base64,${image_b64}`;

    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;

    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);

    const data = ctx.getImageData(0, 0, img.width, img.height).data;

    return { array: new Uint8Array(data), width: img.width, height: img.height };
}

export default {
    name: "imagine",
    description: "Views images natively in the terminal.",
    usage_suffix: "<path> [-w <width>] [-u]",
    arg_descriptions: {
        "Arguments:": {
            "path": "The path to the image to view."
        },
        "Options:": {
            "-w": "The width of the image in columns. Defaults to the terminal width.",
            "-u": "Path is an web URL instead of a local filesystem path."
        }
    },
    main: (data) => {
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
        const width_arg = args.includes("-w") ? parseInt(args[args.indexOf("-w") + 1]) : term.cols;
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

        // get the image data as base64, catching the NotBase64 error
        let base64_content: string;
        try {
            base64_content = fs.read_file(abs_path, true, false);
        } catch (e) {
            if (e instanceof NotBase64Error) {
                term.write(`${PREFABS.error}File was not stored base64 encoded: ${path}${STYLE.reset_all}`);
                return 1;
            }

            throw e;
        }


        // convert the image data to a Uint8Array
        const { array, width, height } = b64_image_to_uint8(base64_content, mime);

        // scale the height to fit the width
        const scale = width_arg / height;
        const new_height = Math.floor(width_arg / scale);

        // convert the Uint8Array to a sixel image
        const sixel = image2sixel(array, width_arg, new_height);

        // write the sixel image to the terminal
        term.write(sixel);

        return 0;
    }
} as SyncProgram;