/* eslint-env node */
/* eslint-disable @typescript-eslint/no-var-requires */

const path = require("path");
const hb = require("handlebars");
const fs = require("fs");
const ExtraWatchWebpackPlugin = require("extra-watch-webpack-plugin");

// make fsedit dir
if (!fs.existsSync("./fsedit")) {
    fs.mkdirSync("./fsedit");
}

function hb_build() {
    console.log("Compiling index");
    let index_template = fs.readFileSync("./src/index.handlebars", "utf8");
    let compiled = hb.compile(index_template);
    const package = require("./package.json");
    let version = package.version;
    let deps = package.dependencies;
    let unpkg_deps = {};

    // can't do imgtoascii
    delete deps["imgtoascii"];

    // replace version field of dependencies with unpkg link at specific version
    for (let dep in deps) {
        unpkg_deps[dep] = `https://unpkg.com/${dep}@${deps[dep]}`;
    }

    // inject a fake dep, xterm, that points to @xterm/xterm to help support older compiled ollieos programs
    // alias other renamed modules to their new names
    unpkg_deps["xterm"] = `https://unpkg.com/@xterm/xterm@${deps["@xterm/xterm"]}`;
    unpkg_deps["xterm-addon-fit"] = `https://unpkg.com/@xterm/addon-fit@${deps["@xterm/addon-fit"]}`;
    unpkg_deps["xterm-addon-image"] = `https://unpkg.com/@xterm/addon-image@${deps["@xterm/addon-image"]}`;
    unpkg_deps["xterm-addon-web-links"] = `https://unpkg.com/@xterm/addon-web-links@${deps["@xterm/addon-web-links"]}`;

    let unpkg_imp_map = {"imports": unpkg_deps};
    unpkg_imp_map = JSON.stringify(unpkg_imp_map);

    let html = compiled({ title: `OllieOS v${version}`, desc: "Ollie's Portfolio", version, unpkg_imp_map });
    fs.writeFileSync("./index.html", html);
    console.log("Compiled index");

    console.log("Compiling fsedit");
    let fsedit_template = fs.readFileSync("./src/fsedit/index.handlebars", "utf8");
    let fsedit_compiled = hb.compile(fsedit_template);
    let fsedit_html = fsedit_compiled({ title: "OllieOS - Filesystem Editor", desc: "fsedit for OllieOS" });
    fs.writeFileSync("./fsedit/index.html", fsedit_html);
    console.log("Compiled fsedit");
}

module.exports = (env, argv) => {
    let dt = argv.mode === "development" ? "inline-source-map" : "hidden-source-map";
    console.log(`Building in ${argv.mode} mode`);
    console.log(`Using ${dt}`);
    return {
        plugins: [
            {
                apply: (compiler) => {
                    compiler.hooks.compile.tap("hbhook_compile", () => {
                        hb_build();
                    });
                },
            },
            new ExtraWatchWebpackPlugin({
                files: ["./src/*.handlebars", "./src/fsedit/*.handlebars"],
            }),
        ],
        entry: {
            main: "./src/index.ts",
            fsedit: "./src/fsedit/index.ts",
        },
        devtool: dt,
        module: {
            rules: [
                {
                    test: /\.tsx?$/,
                    use: "ts-loader",
                    exclude: /node_modules/,
                },
                {
                    test: /\.css$/,
                    use: ["style-loader", "css-loader"]
                }
            ],
        },
        resolve: {
            extensions: [".ts", ".js"],
        },
        output: {
            filename: "[name].bundle.js",
            path: path.resolve(__dirname, "public/script"),
        },
    }
};