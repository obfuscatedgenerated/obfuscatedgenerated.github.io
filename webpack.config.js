/* eslint-env node */

import path from "path";
import hb from "handlebars";
import fs from "fs";
import ExtraWatchWebpackPlugin from "extra-watch-webpack-plugin";

function hb_build() {
    console.log("Compiling index");
    let index_template = fs.readFileSync("./src/index.handlebars", "utf8");
    let compiled = hb.compile(index_template);
    let html = compiled({ });
    fs.writeFileSync("./index.html", html);
    console.log("Compiled index");
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
                files: ["./src/*.handlebars"],
            }),
        ],
        entry: "./src/index.ts",
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