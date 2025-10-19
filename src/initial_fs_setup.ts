import { AbstractFileSystem } from "./filesystem";
import { ANSI, NEWLINE } from "./term_ctl";

const setup_motd = (fs: AbstractFileSystem) => {
    // create etc directory if it doesn't exist
    const absolute_etc = fs.absolute("/etc");
    if (!fs.dir_exists(absolute_etc)) {
        fs.make_dir(absolute_etc);
    }

    // create motd file if it doesn't exist
    const motd_content = `┌─ Welcome to ${ANSI.STYLE.italic + ANSI.STYLE.bold + ANSI.FG.magenta}OllieOS...${ANSI.STYLE.reset_all} ───────────────────┐
│  ${ANSI.STYLE.bold + ANSI.FG.blue}Type ${ANSI.PREFABS.program_name}help${ANSI.STYLE.no_italic + ANSI.FG.blue} for a list of commands.${ANSI.STYLE.reset_all}        │
│  ${ANSI.STYLE.bold + ANSI.FG.blue}Type ${ANSI.PREFABS.program_name}mefetch${ANSI.STYLE.no_italic + ANSI.FG.blue} for info about me.${ANSI.STYLE.reset_all}          │
│  ${ANSI.STYLE.bold + ANSI.FG.blue}Type ${ANSI.PREFABS.program_name}cd projects${ANSI.STYLE.no_italic + ANSI.FG.blue} to view project info.${ANSI.STYLE.reset_all}   │
│  ${ANSI.STYLE.bold + ANSI.FG.blue}Type ${ANSI.PREFABS.program_name}bugreport${ANSI.STYLE.no_italic + ANSI.FG.blue} to open the bug reporter.${ANSI.STYLE.reset_all} │
└───────────────────────────────────────────┘`.replace(/\n/g, NEWLINE);

    const absolute_motd = fs.absolute("/etc/motd.txt");
    if (!fs.exists(absolute_motd)) {
        fs.write_file(absolute_motd, motd_content);
    }
};

const setup_rc_profile = (fs: AbstractFileSystem) => {
    // create .ollie_profile file if it doesn't exist
    const profile_content = `# OllieOS configuration file${NEWLINE}# This file is run when the OS starts (before mounting /usr/bin).${NEWLINE}${NEWLINE}cat /etc/motd.txt${NEWLINE}echo "OllieOS v$VERSION ($ENV)"${NEWLINE}`;
    const absolute_profile = fs.absolute("~/.ollie_profile");
    if (!fs.exists(absolute_profile)) {
        fs.write_file(absolute_profile, profile_content);
    }

    // create .ollierc file if it doesn't exist
    const rc_content = `# OllieOS configuration file${NEWLINE}# This file is run when a shell is created (after mounting /usr/bin).${NEWLINE}${NEWLINE}`;
    const absolute_rc = fs.absolute("~/.ollierc");
    if (!fs.exists(absolute_rc)) {
        fs.write_file(absolute_rc, rc_content);
    }
};

const setup_credits = (fs: AbstractFileSystem) => {
    // create credits file
    const credits_content = `
Credits
=======

This website was made by obfuscatedgenerated using the following technologies:

- TypeScript
- xterm.js
- Handlebars.js
- Webpack

As well as the following libraries:

- imgToAscii (modified)
- node-sixel
- @xterm/addon-fit
- @xterm/addon-web-links
- @xterm/addon-image
- xterm-link-provider
- howler.js
- html-to-text
- some code from rss-parser (modified)

Additionally, fsedit uses:

- Font Awesome

The source code is available on GitHub at https://github.com/obfuscatedgenerated/obfuscatedgenerated.github.io and is licensed under the MIT license.
`.replace(/\n/g, NEWLINE);

    // only overwrite the file if it doesn't exist or the content is different
    const absolute_credits = fs.absolute("~/credits.txt");
    if (!fs.exists(absolute_credits) || fs.read_file(absolute_credits) !== credits_content) {
        fs.write_file(absolute_credits, credits_content, true);
        fs.set_readonly(absolute_credits, true);
    }
};

// syncs the data repository from the data service (data.ollieg.codes)
const setup_data_repo = async (fs: AbstractFileSystem) => {
    console.log("Syncing data repository...");

    // check if data dir exists locally
    const data_dir = fs.absolute("/var/lib/data");
    let existing_rev = "";
    if (!fs.dir_exists(data_dir)) {
        fs.make_dir(data_dir);
    } else {
        // read the existing revision from version.json
        const version_file = fs.join(data_dir, "version.json");
        if (fs.exists(version_file)) {
            const version_data = JSON.parse(fs.read_file(version_file) as string);
            existing_rev = version_data.rev;
        }
    }

    try {
        // fetch the latest revision from the data service
        const svc_version = await fetch("https://data.ollieg.codes/version.json").then(res => res.json());
        const latest_rev = svc_version.rev;

        // if the revisions match, no need to update
        if (existing_rev === latest_rev) {
            console.log("Data repository is already up to date.");
            return;
        }

        // back up existing data folder
        const possible_backup_dir = fs.absolute(`/var/lib/data.old_${existing_rev}`);
        if (existing_rev) {
            fs.move_dir(data_dir, possible_backup_dir);
            fs.make_dir(data_dir);
        }

        // fetch the index file
        const index = await fetch("https://data.ollieg.codes/index.json").then(res => res.json());

        // check if the index file has the optional "groups" field
        if (!index.groups) {
            throw new Error("Index file is missing 'groups' field.");
        }

        // write the index and version file to the data folder
        fs.write_file(fs.join(data_dir, "index.json"), JSON.stringify(index, null, 2), true);
        fs.write_file(fs.join(data_dir, "version.json"), JSON.stringify(svc_version, null, 2), true);

        // for each group, fetch the index and then fetch each file listed in its index
        for (const group of index.groups) {
            console.log(`Syncing data group: ${group}`);

            // ensure the group directory exists
            const group_dir = fs.join(data_dir, group);
            if (!fs.dir_exists(group_dir)) {
                fs.make_dir(group_dir);
            }

            // fetch the group index
            const group_index = await fetch(`https://data.ollieg.codes/${group}/index.json`).then(res => res.json());

            // ensure the group index is an array
            if (!Array.isArray(group_index)) {
                throw new Error(`Group index for ${group} is not an array.`);
            }

            // write the group index to the group folder
            fs.write_file(fs.join(group_dir, "index.json"), JSON.stringify(group_index, null, 2), true);

            // for each file in the group index, fetch the file and write it to the data folder
            for (const entry of group_index) {
                console.log(`  Fetching file: ${entry}.json`);

                const file_data = await fetch(`https://data.ollieg.codes/${group}/${entry}.json`).then(res => res.text());
                const file_path = fs.join(group_dir, `${entry}.json`);

                fs.write_file(file_path, file_data, true);
            }
        }

        console.log("Data repository synced successfully.");

        // delete backup if exists
        if (fs.dir_exists(possible_backup_dir)) {
            fs.delete_dir(possible_backup_dir, true);
        }

        // return new rev
        return latest_rev;
    } catch (e) {
        console.error("Failed to sync data repository:");
        console.error(e);

        // restore backup if exists
        const possible_backup_dir = fs.absolute(`/var/lib/data.old_${existing_rev}`);
        if (fs.dir_exists(possible_backup_dir)) {
            console.error("Restoring backup...");
            fs.move_dir(data_dir, fs.absolute("/var/lib/data.discard"));
            fs.move_dir(possible_backup_dir, data_dir);
            fs.delete_dir(fs.absolute("/var/lib/data.discard"), true);
        } else {
            // just delete the data dir in progress to prevent partial data
            fs.delete_dir(data_dir, true);
        }
    }

    return null;
}

const fetch_file_with_ttl = async (url: string, skip_cache: boolean) => {
    // check if url exists in TTL cache
    const ttl_cache = localStorage.getItem("fetch_ttl_cache");
    const ttl_cache_obj = ttl_cache ? JSON.parse(ttl_cache) : {};

    // if the url's TTL hasn't expired, don't fetch the file
    // saves time acquiring heavy files at startup whilst still allowing for updates at some point
    if (!skip_cache && ttl_cache_obj[url]) {
        if (ttl_cache_obj[url] > Date.now()) {
            return null;
        }
    }

    // fetch the file and convert it to a Uint8Array
    const response = await fetch(url);
    const array_buffer = await response.arrayBuffer();

    // add the url to the TTL cache
    ttl_cache_obj[url] = Date.now() + 1000 * 60 * 60 * 24 * 7; // 1 week
    localStorage.setItem("fetch_ttl_cache", JSON.stringify(ttl_cache_obj));

    return new Uint8Array(array_buffer);
};

const generate_project_folder = async (fs: AbstractFileSystem, base_dir: string, data_projects_dir: string, project_entry: string, project_data: any = null): Promise<boolean> => {
    console.log(`Generating project folder for ${project_entry}...`);

    const project_dir = fs.join(base_dir, project_entry);
    fs.make_dir(project_dir);

    // generate info.txt
    const info_content = `

${project_data.name}
=${"=".repeat(project_data.name.length)}

${project_data.primary_language ? `Primary Language: ${project_data.primary_language}\n\n` : ""}${project_data.description}
${project_data.live_url ? `\nLive URL: ${project_data.live_url}` : ""}${project_data.repo_url ? `\nRepository: ${project_data.repo_url}\n` : ""}
`.replace(/\n/g, NEWLINE);

    fs.write_file(fs.join(project_dir, "info.txt"), info_content.trim(), true);

    // download image with ttl if defined
    // not a fatal failure so don't return false on failure
    if (project_data.image) {
        const file_ext_regex = /\.([a-zA-Z0-9]+)(?:\?|$)/;
        const match = project_data.image.match(file_ext_regex);

        // if theres no file extension, default to png bc why not :)
        const image_ext = match ? match[1] : "png";
        if (image_ext) {
            const absolute_file = fs.join(project_dir, `image.${image_ext}`);
            let content: Uint8Array | null;

            try {
                // if the file doesn't exist, skip the TTL cache
                const skip_cache = !fs.exists(absolute_file);

                // fetch the file if TTL cache is expired or doesn't exist
                content = await fetch_file_with_ttl(project_data.image, skip_cache);

                // write the file if content is not null
                if (content) {
                    fs.write_file(absolute_file, content, true);
                }
            } catch (e) {
                console.error(`Failed to fetch image for project ${project_entry}:`);
                console.error(e);
            }
        } else {
            console.warn(`Project image for ${project_entry} has unsupported file extension; skipping image.`);
        }
    }

    console.log(`Project folder for ${project_entry} generated successfully.`);

    // recurse for sub_projects
    if (project_data.sub_projects && Array.isArray(project_data.sub_projects)) {
        for (const sub_project_entry of project_data.sub_projects) {
            const success = await generate_project_folder(fs, project_dir, data_projects_dir, sub_project_entry.name, sub_project_entry);
            if (!success) {
                console.error(`Failed to generate sub-project folder for ${sub_project_entry}`);
                return false;
            }
        }
    }

    return true;
}

const setup_projects = async (fs: AbstractFileSystem, data_rev: string | null) => {
    // if data_rev is null, try read it from the data repo
    if (!data_rev) {
        try {
            const version_file = fs.absolute("/var/lib/data/version.json");
            if (fs.exists(version_file)) {
                const version_data = JSON.parse(fs.read_file(version_file) as string);
                data_rev = version_data.rev;
            } else {
                throw new Error("Version file does not exist.");
            }
        } catch (e) {
            console.error("Failed to read data revision from data repository:");
            console.error(e);
            data_rev = null;
        }
    }

    // if data rev is still null, skip project setup
    if (!data_rev) {
        console.warn("Data repo not synced; skipping project setup.");
        return;
    }

    // create projects directory if it doesn't exist
    const absolute_projects = fs.absolute("~/projects");
    let project_rev = "";
    if (!fs.dir_exists(absolute_projects)) {
        fs.make_dir(absolute_projects);
    } else {
        // read the existing revision from the hidden .rev file
        const version_file = fs.join(absolute_projects, ".rev");
        if (fs.exists(version_file)) {
            project_rev = fs.read_file(version_file) as string;
        }
    }

    // if the revisions match, no need to update
    if (project_rev === data_rev) {
        console.log("Projects are already up to date.");
        return;
    }

    // back up existing projects folder
    const possible_backup_dir = fs.absolute(`~/projects.old_${project_rev}`);
    if (project_rev) {
        fs.move_dir(absolute_projects, possible_backup_dir);
        fs.make_dir(absolute_projects);
    }

    try {
        // for each project in the data repo, convert the json to the file structure in the projects folder
        const data_projects_dir = fs.absolute("/var/lib/data/project");
        const project_index_file = fs.join(data_projects_dir, "index.json");

        if (!fs.exists(project_index_file)) {
            throw new Error("Project index file does not exist in data repository.");
        }

        const projects = JSON.parse(fs.read_file(project_index_file) as string);
        if (!Array.isArray(projects)) {
            throw new Error("Project index file is not an array.");
        }

        for (const project_entry of projects) {
            console.log(`Setting up project: ${project_entry}`);

            const project_file = fs.join(data_projects_dir, `${project_entry}.json`);
            if (!fs.exists(project_file)) {
                console.warn(`Project file for ${project_entry} does not exist; skipping.`);
                return false;
            }

            const project_data = JSON.parse(fs.read_file(project_file) as string);

            const success = await generate_project_folder(fs, absolute_projects, data_projects_dir, project_entry, project_data);
            if (!success) {
                // TODO: is it better to still keep partial data or throw an error?
                throw new Error(`Failed to generate project folder for ${project_entry}`);
            }
        }
    } catch (e) {
        console.error("Failed to set up projects:");
        console.error(e);

        // restore backup if exists
        if (fs.dir_exists(possible_backup_dir)) {
            console.error("Restoring backup...");
            fs.move_dir(absolute_projects, fs.absolute("~/projects.discard"));
            fs.move_dir(possible_backup_dir, absolute_projects);
            fs.delete_dir(fs.absolute("~/projects.discard"), true);
        } else {
            // just delete the projects dir in progress to prevent partial data
            fs.delete_dir(absolute_projects, true);
        }

        return;
    }
};


// TODO: move mefetch to pull from person data

export const initial_fs_setup = async (fs: AbstractFileSystem) => {
    setup_motd(fs);
    setup_rc_profile(fs);
    setup_credits(fs);


    const latest_rev = await setup_data_repo(fs);
    await setup_projects(fs, latest_rev);
};
