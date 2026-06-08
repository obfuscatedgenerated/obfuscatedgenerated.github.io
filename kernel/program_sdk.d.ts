import { AbstractShell } from "../abstract_shell";
import { AbstractClientSocket, AbstractNetworkManager, AbstractServerSocket } from "./network";
import { AbstractTerminal } from "./term_ctl";
import { AbstractWindow, AbstractWindowManager } from "./windowing";
import { XTermTerminal } from "../term_impl/xterm";
export declare const sdk: Readonly<{
    AbstractShell: typeof AbstractShell;
    AbstractClientSocket: typeof AbstractClientSocket;
    AbstractServerSocket: typeof AbstractServerSocket;
    AbstractNetworkManager: typeof AbstractNetworkManager;
    AbstractTerminal: typeof AbstractTerminal;
    AbstractWindow: typeof AbstractWindow;
    AbstractWindowManager: typeof AbstractWindowManager;
    XTermTerminal: typeof XTermTerminal;
}>;
