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

        const root = document.createElement("div");
        root.style.display = "flex";
        root.style.height = "100%";
        root.style.width = "100%";
        root.style.justifyContent = "space-between";

        wind.dom.appendChild(root);

        const buttons = document.createElement("div");
        buttons.style.display = "flex";
        buttons.style.height = "100%";
        buttons.style.alignItems = "center";
        buttons.style.gap = "1vh";
        buttons.style.padding = "0 1vh";

        const icons = document.createElement("div");
        icons.style.display = "flex";
        icons.style.height = "100%";
        icons.style.alignItems = "center";
        icons.style.gap = "1vh";
        icons.style.padding = "0 1vh";

        root.appendChild(buttons);
        root.appendChild(icons);

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

        if (kernel.has_network_manager()) {
            // add icon to reflect network status
            const net_manager = kernel.get_network_manager();
            const net_icon = document.createElement("span");
            net_icon.style.height = "3vh";
            net_icon.style.width = "3vh";
            net_icon.style.fontSize = "3vh";
            net_icon.style.display = "flex";
            net_icon.style.justifyContent = "center";
            net_icon.style.alignItems = "center";

            const is_up = await net_manager.is_up();
            net_icon.style.color = is_up ? "green" : "red";
            net_icon.innerText = is_up ? "🌐︎" : "🔌︎";
            net_icon.title = is_up ? "Online" : "Offline";

            // update when status changes
            process.network_add_manager_listener("state_change", (now_up) => {
                net_icon.style.color = now_up ? "green" : "red";
                net_icon.innerText = now_up ? "🌐︎" : "🔌︎";
                net_icon.title = now_up ? "Online" : "Offline";
            });

            icons.appendChild(net_icon);
        }

        wind.show();

        process.detach();
        return 0;
    }
} as Program;