/**
 * @group Kernel (Privileged)
 * @groupDescription API documentation for the additional privileged full kernel access API (granted to programs with privileged access).
 *
 * @category Kernel
 */
export { Kernel } from "../kernel";

/**
 * @group Kernel (Privileged)
 * @category Filesystem
 */
export { AbstractFileSystem } from "../kernel/filesystem";

/**
 * @group Kernel (Privileged)
 * @category Processes
 */
export { ProcessManager, ProcessContext, IPCManager } from "../kernel/processes";

/**
 * @group Kernel (Privileged)
 * @category Programs
 */
export { ProgramRegistry } from "../kernel/prog_registry";

/**
 * @group Kernel (Privileged)
 * @category Windowing
 */
export { AbstractWindow, AbstractWindowManager } from "../kernel/windowing";

// TODO: figure out why groups/categories dont always descend properly (manually defined groups on kernel etc) or just define it everywhere on each interface
