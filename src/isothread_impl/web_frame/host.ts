// the document inside a program's sandboxed frame. it loads the isothread entry (the same bundle workers run), then hands it the start message
// the frame's body is the window's content, so it fills the frame
export const FRAME_SRCDOC = `<!DOCTYPE html>
<html>
<head>
<style>
html, body {
    margin: 0;
    width: 100%;
    height: 100%;
    overflow: hidden;
}
</style>
</head>
<body>
<script>
const on_start = (event) => {
    if (event.source !== window.parent) {
        return;
    }

    window.removeEventListener("message", on_start);

    const {entry_source, source, source_url, entry} = event.data;
    const ports = [...event.ports];

    const blob_url = URL.createObjectURL(new Blob([entry_source], {type: "text/javascript"}));
    const script = document.createElement("script");
    script.src = blob_url;

    script.addEventListener("load", () => {
        URL.revokeObjectURL(blob_url);

        // the entry is listening by now, and expects the same message a worker would get
        window.dispatchEvent(new MessageEvent("message", {data: {source, source_url, entry}, ports}));
    });

    document.head.appendChild(script);
};

window.addEventListener("message", on_start);
</script>
</body>
</html>`;
