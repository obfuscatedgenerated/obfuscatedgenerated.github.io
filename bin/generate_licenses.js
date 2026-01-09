const checker = require("license-checker-rseidelsohn");
const fs = require("fs");

const manual = [
    {
        name: "rss-parser (Adapted Code)",
        licenses: "MIT",
        text: `MIT License

Copyright (c) 2016 Bobby Brennan

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`
    }
];

checker.init({
    start: ".",
    production: true,
}, (err, packages) => {
    if (err) {
        console.error(err);
        process.exit(1);
    }

    const all_packages = [];

    Object.keys(packages).forEach(pkg_name => {
        // ignore ollieos
        if (pkg_name.startsWith("ollieos@")) {
            return;
        }

        // check if licenseText exists, if not read from licenseFile
        let text = "See Repository";
        if (packages[pkg_name].licenseText) {
            text = packages[pkg_name].licenseText;
        } else if (packages[pkg_name].licenseFile) {
            try {
                text = fs.readFileSync(packages[pkg_name].licenseFile, "utf8");
            } catch (e) {
                console.warn(`Could not read license file for ${pkg_name}: ${e}`);
            }
        }

        all_packages.push({
            name: pkg_name,
            licenses: packages[pkg_name].licenses,
            text,
        });
    });

    manual.forEach(entry => all_packages.push(entry));
    
    fs.writeFileSync("./public/script/3rdpartylicenses.txt", all_packages.map(pkg => {
        return `Package: ${pkg.name}\nLicense: ${pkg.licenses}\n\n${pkg.text}\n\n-----------------------\n`;
    }).join(""), "utf8");
});
