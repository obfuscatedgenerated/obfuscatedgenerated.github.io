/* eslint-env node */
/* eslint-disable @typescript-eslint/no-var-requires */

const path = require("path");
const hb = require("handlebars");
const fs = require("fs");
const ExtraWatchWebpackPlugin = require("extra-watch-webpack-plugin");

const crypto = require("crypto");
const {LimitChunkCountPlugin} = require("webpack").optimize;

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

    let html = compiled({ title: `OllieOS v${version}`, desc: "Ollie's Portfolio", version, build_year: new Date().getFullYear() });
    fs.writeFileSync("./index.html", html);
    console.log("Compiled index");

    console.log("Compiling fsedit");
    let fsedit_template = fs.readFileSync("./src/fsedit/index.handlebars", "utf8");
    let fsedit_compiled = hb.compile(fsedit_template);
    let fsedit_html = fsedit_compiled({ title: "OllieOS - Filesystem Editor", desc: "fsedit for OllieOS", version });
    fs.writeFileSync("./fsedit/index.html", fsedit_html);
    console.log("Compiled fsedit");
}

// every builtin listed in @ALL becomes its own self-contained bundle
const builtin_entries = () => {
    const all = fs.readFileSync("./src/programs/@ALL.ts", "utf8");
    const entries = {};
    for (const match of all.matchAll(/^export \* as (\w+) from "(.+)";$/gm)) {
        entries[match[1]] = path.resolve(__dirname, "src/programs", match[2]);
    }
    return entries;
};

// a hash per builtin, so the os only fetches the ones that changed
const builtin_manifest_plugin = {
    apply: (compiler) => {
        const {Compilation, sources} = compiler.webpack;

        compiler.hooks.thisCompilation.tap("builtin_manifest", (compilation) => {
            // report stage runs after the bundles are final, while their contents are still in memory
            compilation.hooks.processAssets.tap({name: "builtin_manifest", stage: Compilation.PROCESS_ASSETS_STAGE_REPORT}, () => {
                const hashes = {};
                for (const [name, entrypoint] of compilation.entrypoints) {
                    const file = entrypoint.getFiles().find((entry_file) => entry_file.endsWith(".js"));
                    const source = compilation.getAsset(file).source.source();
                    hashes[name] = crypto.createHash("sha256").update(source).digest("hex").slice(0, 16);
                }

                compilation.emitAsset("manifest.json", new sources.RawSource(JSON.stringify(hashes, null, 2)));
            });
        });
    },
};

const rules = [
    {
        test: /\.tsx?$/,
        use: "ts-loader",
        exclude: /node_modules/,
    },
    {
        test: /\.css$/,
        oneOf: [
            {
                resourceQuery: /raw/, // ?raw import to import file as string
                type: "asset/source",
            },

            // otherwise, treat as normal css and inject into page
            {use: ["style-loader", "css-loader"]}
        ]
    }
];

const devtool = (argv) => argv.mode === "development" ? "inline-source-map" : "hidden-source-map";

module.exports = (env, argv) => [
    {
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
            })
        ],
        entry: {
            main: "./src/index.ts",
            fsedit: "./src/fsedit/index.ts",
            isothread_worker: "./src/isothread_impl/web_worker/worker.ts",
        },
        devtool: devtool(argv),
        module: {
            rules,
        },
        resolve: {
            extensions: [".ts", ".js"],
        },
        output: {
            filename: "[name].bundle.js",
            chunkFilename: "[name].[contenthash].chunk.js",
            path: path.resolve(__dirname, "public/script"),
        },
    },
    {
        name: "builtins",
        entry: builtin_entries(),
        devtool: devtool(argv),
        module: {rules},
        resolve: {extensions: [".ts", ".js"]},
        plugins: [new LimitChunkCountPlugin({maxChunks: 1}), builtin_manifest_plugin],
        optimization: {splitChunks: false, runtimeChunk: false},
        output: {
            filename: "[name].js",
            path: path.resolve(__dirname, "public/bin"),
            library: {type: "module"},
        },
        experiments: {outputModule: true},
    },
];

// TODO: would be great to modernise this with my now much better web deployment knowledge
