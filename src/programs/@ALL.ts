export { default as ignition } from "./core/ignition";
export { default as jetty } from "./core/jetty";
export { default as ash } from "./core/ash";
export { default as default_privilege_agent } from "./core/default_privilege_agent";
export { default as recovery } from "./core/recovery";

export { default as help } from "./help";
export { default as shutdown } from "./shutdown";
export { default as clear } from "./clear";
export { default as echo } from "./echo";
export { default as unset } from "./unset";
export { default as ls } from "./ls";
export { default as cd } from "./cd";
export { default as pwd } from "./pwd";
export { default as edit } from "./edit";
export { default as webget } from "./webget";
export { default as cat } from "./cat";
export { default as hex } from "./hex";
export { default as mefetch } from "./mefetch";
export { default as reader } from "./reader";
export { default as selfdestruct } from "./selfdestruct";
export { default as imagine } from "./imagine";
export { default as ascmagine } from "./ascmagine";
export { default as fsedit } from "./fsedit";
export { default as rm } from "./rm";
export { default as bugreport } from "./bugreport";
export { default as repo } from "./repo";
export { default as rss } from "./rss";
export { default as legacy } from "./legacy";
export { default as tour } from "./tour";
export { default as pkg } from "./pkg";
export { default as touch } from "./touch";
export { default as mkdir } from "./mkdir";
export { default as mv } from "./mv";
export { default as window } from "./window";
export { default as alias } from "./alias";
export { default as unalias } from "./unalias";
export { default as ps } from "./ps";
export { default as kill } from "./kill";
export { default as spark } from "./spark";

export { default as ipc_bg_test } from "./ipc_bg_test";
export { default as ipc_fg_test } from "./ipc_fg_test";

// shhhhh!
export { default as tb_test } from "./taskbar_test";
export { default as vm_test } from "./vm_test";

export { default as trigger_create_trigger } from "./pkg/triggers/create_trigger";
export { default as trigger_remove_trigger } from "./pkg/triggers/remove_trigger";

// TODO: copy program
// TODO: create an API for creating programs, mount any programs found in /bin/ (dont list in help)
// TODO: video player from files or youtube using ascii video streaming or some super duper optimised sixel
// TODO: bonus programs such as the video player can be packages now! i think everything else should stay embedded
