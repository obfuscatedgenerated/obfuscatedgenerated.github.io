// the document inside the sandboxed iframe
// its opaque origin is inherited by the workers it creates, which is what isolates them from the os's storage
// the message port is passed straight through to the worker
export const HOST_SRCDOC = `<!DOCTYPE html>
<script>
const workers = new Map();

window.addEventListener("message", (event) => {
    if (event.source !== window.parent) {
        return;
    }

    const message = event.data;

    switch (message.type) {
        case "spawn": {
            const blob_url = URL.createObjectURL(new Blob([message.worker_source], {type: "text/javascript"}));
            const worker = new Worker(blob_url);
            URL.revokeObjectURL(blob_url);

            worker.postMessage({source: message.source, source_url: message.source_url, entry: message.entry}, [event.ports[0]]);
            workers.set(message.id, worker);
            break;
        }
        case "terminate": {
            const worker = workers.get(message.id);
            if (worker) {
                worker.terminate();
                workers.delete(message.id);
            }
            break;
        }
    }
});
</script>`;
