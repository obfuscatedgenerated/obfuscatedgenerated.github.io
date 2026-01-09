import {ANSI, NEWLINE} from "../../term_ctl";
import type { WrappedTerminal } from "../../term_ctl";
import { ProgramMainData } from "../../types"
import {graph_query, repo_query} from "./index";
import type {Kernel} from "../../kernel";
import type {AbstractShell} from "../../abstract_shell";

// extract from ANSI to make code less verbose
const { STYLE, FG, CURSOR } = ANSI;

const ROWS = 10;

const view_pkg_info = async (pkg_name: string, term: WrappedTerminal, kernel: Kernel, shell?: AbstractShell) => {
    const pkg_data = await repo_query.get_pkg_json(pkg_name);
    const pkg_versions = await repo_query.get_pkg_versions(pkg_name);

    term.clear();

    term.write(NEWLINE);
    term.writeln(`${STYLE.bold}${FG.cyan}${pkg_name}`);
    term.write(STYLE.dim);
    term.writeln("=".repeat(pkg_name.length));
    term.writeln(STYLE.reset_all);

    // check for installed version
    const installed_version = graph_query.get_pkg_version(pkg_name);

    term.write(NEWLINE);
    term.writeln(`${STYLE.bold}Available versions:${STYLE.no_bold_or_dim}`);
    for (const version of pkg_versions) {
        term.writeln(`  - ${version} ${installed_version === version ? `${STYLE.italic}(installed)${STYLE.reset_all}` : ""}`);
    }

    term.write(NEWLINE);
    term.writeln(`${STYLE.bold}Description:${STYLE.no_bold_or_dim} ${pkg_data.description || "No description provided."}`);
    term.writeln(`${STYLE.bold}Author:${STYLE.no_bold_or_dim} ${pkg_data.author || "Unknown"}`);
    term.writeln(`${STYLE.bold}License:${STYLE.no_bold_or_dim} ${pkg_data.license || "Unknown"}`);

    let printed_link_header = false;

    if (pkg_data.homepage_url) {
        if (!printed_link_header) {
            term.write(NEWLINE);
            printed_link_header = true;
        }

        term.writeln(`${STYLE.bold}Homepage:${STYLE.no_bold_or_dim} ${pkg_data.homepage_url}`);
    }

    if (pkg_data.repo_url) {
        if (!printed_link_header) {
            term.write(NEWLINE);
            printed_link_header = true;
        }

        term.writeln(`${STYLE.bold}Repository:${STYLE.no_bold_or_dim} ${pkg_data.repo_url}`);
    }

    term.write(NEWLINE);

    term.writeln(`${STYLE.dim}Press 'i' to install the latest version of this package.${STYLE.reset_all}`);
    term.writeln(`${STYLE.dim}Press any other key to return to the list...${STYLE.reset_all}`);

    const key = await term.wait_for_keypress();

    if (key.domEvent.key === "i") {
        // double check installation
        term.write(NEWLINE);
        term.write(`${STYLE.bold}Are you sure you want to install '${pkg_name}'? (y/N)${STYLE.no_bold_or_dim}`);

        const confirm_key = await term.wait_for_keypress();

        if (confirm_key.domEvent.key.toLowerCase() === "y") {
            term.write(" yes");
            term.write(NEWLINE);

            await kernel.spawn("pkg", ["install", pkg_name], shell).completion;

            term.write(NEWLINE);
            term.writeln(`${STYLE.dim}Press any key to return to the list...${STYLE.reset_all}`);
            await term.wait_for_keypress();
        } else {
            term.write(" no");
            term.writeln(NEWLINE);

            term.writeln(`${STYLE.dim}Installation cancelled. Press any key to return to the list...${STYLE.reset_all}`);
            await term.wait_for_keypress();
        }
    }
}

// TODO: accept name argument to jump to specific package

export const browse_subcommand = async (data: ProgramMainData) => {
    // extract from data to make code less verbose
    const { args, term, kernel, shell } = data;

    // remove subcommand name
    args.shift();

    const provided = await repo_query.get_provided_list();

    let offset = 0;
    let selected_index = 0;
    const draw = () => {
        term.clear();

        term.write(NEWLINE);
        term.writeln("(use up/down arrow keys to scroll, enter to show more info, escape to quit)");
        term.write(NEWLINE);
        term.write(CURSOR.invisible);

        // show ... if there are more items above
        if (offset > 0) {
            term.writeln(`  ${STYLE.dim}...${STYLE.reset_all}`);
        } else {
            term.write(NEWLINE);
        }

        const slice = provided.slice(offset, offset + ROWS);
        for (const [index, name] of slice.entries()) {
            // check for installed version
            const installed_version = graph_query.get_pkg_version(name);

            // highlight selected item
            if (offset + index === selected_index) {
                term.write(`${FG.cyan}${STYLE.dim}> ${STYLE.no_bold_or_dim}${STYLE.bold}`);
            } else {
                term.write("  ");
            }

            term.writeln(`${name} ${installed_version ? `${STYLE.italic}(installed: ${installed_version})` : ""}${STYLE.reset_all}`);
        }

        // show ... if there are more items below
        if (offset + ROWS < provided.length) {
            term.writeln(`  ${STYLE.dim}...${STYLE.reset_all}`);
        } else {
            term.write(NEWLINE);
        }
    }

    // TODO: type to filter

    let quit = false;
    while (!quit) {
        draw();

        const key = await term.wait_for_keypress();
        console.log(key);
        switch (key.domEvent.key) {
            case "Escape":
                quit = true;
                break;
            case "ArrowUp":
                if (selected_index > 0) {
                    selected_index--;
                    if (selected_index < offset) {
                        offset--;
                    }
                }
                break;
            case "ArrowDown":
                if (selected_index < provided.length - 1) {
                    selected_index++;
                    if (selected_index >= offset + ROWS) {
                        offset++;
                    }
                }
                break;
            case "Enter": {
                const pkg_name = provided[selected_index];
                await view_pkg_info(pkg_name, term, kernel, shell);
                break;
            }
        }
    }

    term.clear();
    term.write(CURSOR.visible);
    return 0;
}
