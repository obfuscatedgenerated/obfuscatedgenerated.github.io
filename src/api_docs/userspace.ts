/**
 * @group Userspace
 * @groupDescription API documentation for the userspace program API.
 *
 * @category Kernel
 */
export {UserspaceKernel, UserspaceSpawnResult, ParsedCommandLine} from "../kernel";

/**
 * @group Userspace
 * @category Kernel
 */
export {Remote, RemoteProxy} from "../kernel/rpc";

/**
 * @group Userspace
 * @category Terminal
 */
export {UserspaceTerminal, UserspaceKeyEvent, UserspaceKeyEventHandler, UserspaceKeyHandlerProps, ReadLineBuffer, UserspaceReadLineKeyHandler} from "../kernel/term_ctl";

/**
 * @group Userspace
 * @category Filesystem
 */
export {
    UserspaceFileSystem,
    FSEventType,
    FSEventHandler,
    PathNotFoundError,
    MoveDestinationDirectoryNotEmptyError,
    NonRecursiveDirectoryError,
    ReadOnlyError,
    ProtectedFileReadError
} from "../kernel/filesystem";

/**
 * @group Userspace
 * @category Processes
 */
export {
    UserspaceProcessManager,
    UserspaceProcessContext,
    UserspaceOtherProcessContext,
    UserspaceSpawnedProcessContext,
    ProcessAttachment,
    UserspaceIPCManager,
    IPCMessage,
    IPCChannelListener,
    IPCServiceOnConnectionCallback,
} from "../kernel/processes";

/**
 * @group Userspace
 * @category Windowing
 */
export {UserspaceWindowManager, UserspaceWindow, UserspaceOtherWindow, WindowEvent, UserspaceAccessibleCompositionLayer, ScreenSize} from "../kernel/windowing";

/**
 * @group Userspace
 * @category Shells
 */
export {AbstractShell, AbstractShellMemory, UserspaceShell, UserspaceShellMemory} from "../abstract_shell";

/**
 * @group Userspace
 * @category Networking
 */
export {UserspaceNetworkManager, UserspaceClientSocket, UserspaceServerSocket, PortInUseError, SocketReadyState, SocketCloseListener, SocketDataListener, UserspaceSocketConnectionListener, NetworkStateChangeListener} from "../kernel/network";

/**
 * @group Userspace
 * @category Platform
 */
export {UserspacePlatformAPI, PlatformCapability} from "../kernel/platform";
