import type { Program } from "../types";

export default {
    name: "taskbar_test",
    description: "",
    usage_suffix: "",
    arg_descriptions: {},
    compat: "2.0.0",
    hide_from_help: true,
    completion: async () => [],
    main: async (data) => {
        // extract from data to make code less verbose
        const { kernel, term, process, shell } = data;

        if (!kernel.has_window_manager()) {
            term.writeln("This program requires a window manager.");
            return 1;
        }

        const wind = process.create_window();

        wind.title = "Taskbar";

        wind.set_custom_flag("no-top-bar", true);

        wind.x = "0vw";
        wind.y = "92.5vh";

        wind.height = "7.5vh";
        wind.width = "100vw";

        const buttons = document.createElement("div");
        buttons.style.display = "flex";
        buttons.style.height = "100%";
        buttons.style.alignItems = "center";
        buttons.style.gap = "1vh";
        buttons.style.padding = "0 1vh";

        wind.dom.appendChild(buttons);

        const fsedit_button = document.createElement("button");
        fsedit_button.innerText = "FSEdit";
        fsedit_button.style.height = "100%";
        fsedit_button.style.fontSize = "2vh";
        fsedit_button.onclick = () => {
            kernel.spawn("fsedit", [], shell);
        };

        buttons.appendChild(fsedit_button);

        // if minecraft is installed, add a button for it
        const prog_reg = kernel.get_program_registry();
        if (prog_reg.getProgram("minecraft")) {
            const mc_button = document.createElement("button");
            mc_button.style.height = "100%";
            mc_button.style.fontSize = "2vh";
            mc_button.onclick = () => {
                kernel.spawn("minecraft", [], shell);
            };

            const mc_image = document.createElement("img");
            mc_image.src = "https://brandlogos.net/wp-content/uploads/2022/07/minecraft-logo_brandlogos.net_faqdi-512x560.png";
            mc_image.style.height = "100%";
            mc_image.style.objectFit = "contain";
            mc_image.alt = "Minecraft";
            mc_image.draggable = false;
            mc_button.appendChild(mc_image);

            buttons.appendChild(mc_button);
        }

        wind.show();

        process.detach();
        return 0;
    }
} as Program;