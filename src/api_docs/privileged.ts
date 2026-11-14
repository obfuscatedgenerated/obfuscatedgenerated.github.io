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
 * @category Terminal
 */
export {AbstractTerminal, KeyEvent, KeyEventHandler, RegisteredKeyEventIdentifier, ReadLineKeyHandler} from "../kernel/term_ctl";

/**
 * @group Kernel (Privileged)
 * @category Processes
 */
export { ProcessManager, ProcessContext, IPCManager } from "../kernel/processes";

/**
 * @group Kernel (Privileged)
 * @category Windowing
 */
export { AbstractWindow, AbstractWindowManager, WindowCompositionLayer, PrivilegedCompositionLayer } from "../kernel/windowing";

/**
 * @group Kernel (Privileged)
 * @category Networking
 */
export { AbstractNetworkManager, AbstractServerSocket, AbstractClientSocket, ServerSocketEvent, ServerSocketEventListener, ClientSocketEvent, ClientSocketEventListener, SocketConnectionListener } from "../kernel/network";

/**
 * @group Kernel (Privileged)
 * @category Platform
 */
export {AbstractPlatformAPI} from "../kernel/platform";


// TODO: figure out why groups/categories dont always descend properly (manually defined groups on kernel etc) or just define it everywhere on each interface
