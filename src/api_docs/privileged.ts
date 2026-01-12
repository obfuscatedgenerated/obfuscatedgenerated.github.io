/**
* @module Kernel (Privileged)
* @description API documentation for the additional privileged full kernel access API (granted to programs with privileged access).
*/

export type { Kernel } from "../kernel";
export type { AbstractFileSystem } from "../kernel/filesystem";
export type { ProcessManager, ProcessContext, IPCManager } from "../kernel/processes";
export type { ProgramRegistry } from "../kernel/prog_registry";
export type { AbstractWindow, AbstractWindowManager } from "../kernel/windowing";
