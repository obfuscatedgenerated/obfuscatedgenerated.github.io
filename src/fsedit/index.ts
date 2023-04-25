// import all fs implementations
import * as fs_impls from "../fs_impl/@ALL";

// import the fs interface
import { FileSystem } from "../filesystem";

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
const fs: FileSystem = new fs_impl();

// create a lock file at root
const lock_path = fs.absolute("/.fs.lock");
if (fs.exists(lock_path)) {
    alert("fsedit is already running on this filesystem.");
    window.close();
}

fs.write_file(lock_path, `locked at ${new Date().toISOString()}`);

// bind an event listener to the window close event
window.addEventListener("beforeunload", () => {
    // remove the lock file
    fs.delete_file(lock_path);
});


// save a reference to the editor pane and the file tree
const editor = document.getElementById("editor") as HTMLDivElement;
const file_tree = document.getElementById("file-tree") as HTMLDivElement;

let render_directory: (dir: string) => void;

const render_item = (dir: string, name: string) => {
    const joined_path = fs.join(dir, name);
    const abs_path = fs.absolute(joined_path);

    console.log("rendering", joined_path);

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
        if (fs.dir_exists(abs_path)) {
            // if dir, render the dir
            render_directory(abs_path);
        } else {
            // open the file in the editor
        }
    };


    li.appendChild(icon);
    li.appendChild(text);
    file_tree.appendChild(li);
};

render_directory = (dir: string) => {
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
};

// render the root directory
render_directory("/");