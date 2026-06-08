import {AbstractShell} from "../abstract_shell";
//import {AbstractFileSystem} from "./filesystem";
import {
    AbstractClientSocket,
    AbstractNetworkManager,
    AbstractServerSocket,
    PortInUseError,
    SocketReadyState
} from "./network";
import {AbstractTerminal} from "./term_ctl";
import {AbstractWindow, AbstractWindowManager} from "./windowing";
import {XTermTerminal} from "../term_impl/xterm";
//import {DOMWindowManager} from "../window_impl/dom";

export const sdk = Object.freeze({
    AbstractShell,
    //AbstractFileSystem,
    AbstractClientSocket,
    AbstractServerSocket,
    AbstractNetworkManager,
    PortInUseError,
    SocketReadyState,
    AbstractTerminal,
    AbstractWindow,
    AbstractWindowManager,
    XTermTerminal,
    //DOMWindowManager
});

