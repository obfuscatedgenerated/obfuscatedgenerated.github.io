// import all fs implementations
import * as fs_impls from "../fs_impl/@ALL";

// import the fs interface
import { FileSystem } from "../filesystem";

const params = new URLSearchParams(window.location.search);

if (!params.has("type")) {
    alert("Missing 'type' query parameter.");
    window.close();
}

const fs_impl_name = params.get("type");

// get the fs implementation
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
