/**
* @module Userspace
* @description API documentation for the userspace program API.
*/

export type {UserspaceKernel, SpawnResult, ParsedCommandLine} from "../kernel";
export type {UserspaceFileSystem, FSEventType, FSEventHandler} from "../kernel/filesystem";
export type {
    UserspaceProcessManager,
    UserspaceProcessContext,
    UserspaceOtherProcessContext,
    ProcessAttachment,
    UserspaceIPCManager,
    IPCMessage,
    IPCChannelListener,
    IPCServiceOnConnectionCallback,
} from "../kernel/processes";
export type {UserspaceWindowManager, UserspaceWindow, UserspaceOtherWindow, WindowEvent} from "../kernel/windowing";
export type {UserspaceProgramRegistry, ProgramRegistrant} from "../kernel/prog_registry";
export type {SoundRegistry} from "../kernel/sfx_registry";

export type {WrappedTerminal, KeyEvent, KeyEventHandler, RegisteredKeyEventIdentifier, ReadLineBuffer, ReadLineKeyHandler} from "../kernel/term_ctl";

export type {AbstractShell, AbstractShellMemory} from "../abstract_shell";
