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
    let unpkg_deps = package.dependencies;

    // can't do imgtoascii
    delete unpkg_deps["imgtoascii"];

    // replace version field of dependencies with unpkg link at specific version
    for (let dep in unpkg_deps) {
        unpkg_deps[dep] = `https://unpkg.com/${dep}@${unpkg_deps[dep]}`;
    }

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