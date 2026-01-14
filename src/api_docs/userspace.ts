/**
 * @group Userspace
 * @groupDescription API documentation for the userspace program API.
 *
 * @category Kernel
 */
export {UserspaceKernel, SpawnResult, ParsedCommandLine} from "../kernel";

/**
 * @group Userspace
 * @category Terminal
 */
export {WrappedTerminal, KeyEvent, KeyEventHandler, RegisteredKeyEventIdentifier, ReadLineBuffer, ReadLineKeyHandler} from "../kernel/term_ctl";

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
    ReadOnlyError
} from "../kernel/filesystem";

/**
 * @group Userspace
 * @category Processes
 */
export {
    UserspaceProcessManager,
    UserspaceProcessContext,
    UserspaceOtherProcessContext,
    ProcessAttachment,
    UserspaceIPCManager,
    IPCMessage,
    IPCChannelListener,
    IPCServiceOnConnectionCallback,
} from "../kernel/processes";

/**
 * @group Userspace
 * @category Programs
 */
export {UserspaceProgramRegistry, ProgramRegistrant} from "../kernel/prog_registry";

/**
 * @group Userspace
 * @category Windowing
 */
export {UserspaceWindowManager, UserspaceWindow, UserspaceOtherWindow, WindowEvent} from "../kernel/windowing";

/**
 * @group Userspace
 * @category Sound
 */
export {SoundRegistry} from "../kernel/sfx_registry";

/**
 * @group Userspace
 * @category Shells
 */
export {AbstractShell, AbstractShellMemory} from "../abstract_shell";
