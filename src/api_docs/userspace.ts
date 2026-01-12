/**
* @module Userspace
* @description API documentation for the userspace program API.
*/

export type {UserspaceKernel, SpawnResult, ParsedCommandLine} from "../kernel";
export type {UserspaceFileSystem, FSEventType, FSEventHandler} from "../kernel/filesystem";
export type {
    IPCMessage,
    IPCChannelListener,
    IPCServiceOnConnectionCallback,
    UserspaceProcessManager,
    UserspaceIPCManager,
    UserspaceProcessContext,
    UserspaceOtherProcessContext,
} from "../kernel/processes";
export type {UserspaceWindowManager, UserspaceWindow, UserspaceOtherWindow, WindowEvent} from "../kernel/windowing";
export type {UserspaceProgramRegistry} from "../kernel/prog_registry";
export type {SoundRegistry} from "../kernel/sfx_registry";

export type {WrappedTerminal, ReadLineBuffer, ReadLineKeyHandler} from "../kernel/term_ctl";

export type {AbstractShell, AbstractShellMemory} from "../abstract_shell";
