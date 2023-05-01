// import all fs implementations
import * as fs_impls from "../fs_impl/@ALL";

// import the fs interface
import { FileSystem } from "../filesystem";

// other imports
import { NEWLINE } from "../term_ctl";

const params = new URLSearchParams(window.location.search);

if (!params.has("type")) {
    alert("Missing 'type' query parameter.");
    window.close();
}

// get the fs implementation
const fs_impl_name = params.get("type");
const fs_impl = fs_impls[fs_impl_name];

if (!fs_impl) {
    alert(`FS implementation '${fs_impl_name}' not found.`);
    window.close();
}

// instance the fs implementation
// NOTE: cache will be separate from the main window, use direct methods on all files not completely controlled by fsedit
const fs: FileSystem = new fs_impl();

// TODO: replace all alerts and confirms with sweetalert2

// create a lock file at root
const lock_path = fs.absolute("/.fs.lock");
let is_locked = false;
if (fs.exists_direct(lock_path)) {
    alert("fsedit is already running on this filesystem. (If this is not the case, delete the file '.fs.lock' in the root directory and try again.)");
    window.close();
}

const lock_str = `locked at ${new Date().toISOString()}`;
fs.write_file(lock_path, lock_str);
fs.set_readonly(lock_path, true);
is_locked = true;


// save a reference to the editor and the file tree
const file_editor = document.getElementById("file-editor") as HTMLDivElement;
const file_tree = document.getElementById("file-tree") as HTMLDivElement;

// save a reference to the titles
const title = document.getElementById("title") as HTMLHeadingElement;
const file_name = document.getElementById("file-name") as HTMLHeadingElement;

// save a reference to the textarea
const content_area = document.getElementById("file-content") as HTMLTextAreaElement;


let render_directory: (dir: string) => void;

let current_abs_path: string;
let current_readonly: boolean;
const render_file_editor = (abs_path: string, name: string) => {
    // hide the file tree
    file_tree.style.display = "none";

    // show the file editor
    file_editor.style.display = "block";

    current_readonly = fs.is_readonly_direct(abs_path);

    // lock the file by setting it to readonly when editing
    if (!current_readonly) {
        // uncache the file
        fs.remote_remove_from_cache(abs_path);

        // set the file to readonly
        fs.set_readonly_direct(abs_path, true);
    }

    // set the heading
    file_name.innerText = current_readonly ? `Viewing read-only file: ${name}` : `Editing file: ${name}`;

    // set the content area readonly if needed
    content_area.readOnly = current_readonly;

    // set visibility of save and delete buttons based on readonly
    document.getElementById("save-button").style.display = current_readonly ? "none" : "block";
    document.getElementById("delete-button").style.display = current_readonly ? "none" : "block";

    // get the file contents
    let content = fs.read_file_direct(abs_path, false) as string;

    // replace NEWLINE with local newline
    content = content.replace(new RegExp(NEWLINE, "g"), "\n");

    // set the content area value
    content_area.value = content;

    // set the current path
    current_abs_path = abs_path;
}

const close_file_editor = () => {
    // unset from cache
    fs.remote_remove_from_cache(current_abs_path);

    // revert the file to original readonly state
    fs.set_readonly_direct(current_abs_path, current_readonly);

    // unset current values
    current_abs_path = undefined;
    current_readonly = undefined;

    // hide the file editor
    file_editor.style.display = "none";

    // show the file tree
    file_tree.style.display = "block";
}

const save_file_in_editor = () => {
    // get the file contents
    let content = content_area.value;

    // replace local newline with NEWLINE
    content = content.replace(/(?:\r\n|\r|\n)/g, NEWLINE);

    // save the file
    fs.remote_remove_from_cache(current_abs_path);
    fs.write_file_direct(current_abs_path, content); // TODO: works with localstorage but not guaranteed to work with other fs implementations. make specific remote methods for ops
}


const render_item = (dir: string, name: string) => {
    const abs_path = fs.absolute(name);

    // if the absolute path is the same as the absolute path of the dir, skip
    if (abs_path === dir) {
        return;
    }

    const li = document.createElement("li");
    const icon = document.createElement("i");
    const text = document.createElement("a");

    icon.classList.add("fa-solid");

    if (fs.dir_exists(abs_path)) {
        icon.classList.add("fa-folder");
        icon.title = "Directory";
    } else {
        icon.classList.add("fa-file");
        icon.title = "File";
    }

    text.innerText = name;
    text.href = "#";
    text.onclick = () => {
        // check path still exists
        if (!fs.exists(abs_path)) {
            alert(`Path '${abs_path}' no longer exists.`);

            // re-render the directory
            render_directory(dir);
            return;
        }


        if (fs.dir_exists(abs_path)) {
            // if dir, render the dir
            render_directory(abs_path);
        } else {
            // open the file in the editor
            render_file_editor(abs_path, name);
        }
    };


    li.appendChild(icon);
    li.appendChild(text);
    file_tree.appendChild(li);
};

render_directory = (dir: string) => {
    // set the cwd
    fs.set_cwd(fs.absolute(dir));

    // list files in the directory
    const dir_contents = fs.list_dir(dir);

    // clear the file tree
    file_tree.innerHTML = "";

    // if this isn't root, add a link to go up a directory
    if (dir !== fs.get_root()) {
        render_item(dir, "..");
    }

    // render the list, using the correct font awesome icon for each file (dir or file)
    for (const name of dir_contents) {
        render_item(dir, name);
    }

    // set title
    const title_str = `fsedit - ${dir}`;
    title.innerText = title_str;
    document.title = title_str;

    // update the url
    params.set("dir", dir);
    window.history.replaceState({}, "", `?${params.toString()}`);
};


// bind the exit button
document.getElementById("exit-button").onclick = () => {
    if (!current_readonly) {
        const save = confirm("Save changes before exiting?");

        if (save) {
            save_file_in_editor();
        } else {
            // get confirmation
            if (!confirm("Are you sure you want to exit without saving?")) {
                return;
            }
        }
    }

    // close the editor
    close_file_editor();
}

// bind the save button
document.getElementById("save-button").onclick = () => {
    save_file_in_editor();

    alert("File saved.");
}

// bind the download button
document.getElementById("download-button").onclick = () => {
    const download_direct = confirm("Download directly from filesystem? This ignores any unsaved edits made, but will be the latest version and most binary compatible. Additionally, line endings will be in the filesystem's format.")

    let content: string;

    if (download_direct) {
        content = fs.read_file_direct(current_abs_path, false) as string;
    } else {
        content = content_area.value;
    }

    // create a blob
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);

    // download the file
    const a = document.createElement("a");
    a.href = url;
    a.download = current_abs_path.split("/").pop() as string;
    a.click();
    a.remove();
}

document.getElementById("delete-button").onclick = () => {
    alert("Not implemented yet.");
}

document.getElementById("rename-button").onclick = () => {
    alert("Not implemented yet.");
}

// TODO: bind other buttons
// TODO: add file creation and uploading from main page


// bind an event listener to the window close event
window.addEventListener("beforeunload", (e) => {
    // if current path is set, confirm they want to close
    if (current_abs_path && !current_readonly) {
        e.returnValue = "You have unsaved changes. Are you sure you want to exit?";
        return e.returnValue;
    }
});

// bind an event listener to the window close event
window.addEventListener("unload", () => {
    if (current_abs_path) {
        // remove from cache
        fs.remote_remove_from_cache(current_abs_path);

        // revert the file to original readonly state
        fs.set_readonly_direct(current_abs_path, current_readonly);
    }

    if (is_locked) {
        // remove the lock file
        fs.delete_file_direct(lock_path);
        is_locked = false;
    }
});


// render the initial directory
if (params.has("dir")) {
    if (!fs.dir_exists(params.get("dir"))) {
        alert(`Directory '${params.get("dir")}' does not exist.`);
        window.close();
    }

    // set cwd
    fs.set_cwd(params.get("dir"));

    render_directory(params.get("dir"));
} else {
    render_directory(fs.get_root());
}
