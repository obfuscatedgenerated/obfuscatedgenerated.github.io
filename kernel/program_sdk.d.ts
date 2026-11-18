import { AbstractShell } from "../abstract_shell";
import { AbstractClientSocket, AbstractNetworkManager, AbstractServerSocket, PortInUseError, SocketReadyState } from "./network";
import { AbstractTerminal } from "./term_ctl";
import { AbstractWindow, AbstractWindowManager } from "./windowing";
import { AbstractPlatformAPI } from "./platform";
export declare const sdk: Readonly<{
    AbstractShell: typeof AbstractShell;
    AbstractClientSocket: typeof AbstractClientSocket;
    AbstractServerSocket: typeof AbstractServerSocket;
    AbstractNetworkManager: typeof AbstractNetworkManager;
    PortInUseError: typeof PortInUseError;
    SocketReadyState: typeof SocketReadyState;
    AbstractTerminal: typeof AbstractTerminal;
    AbstractWindow: typeof AbstractWindow;
    AbstractWindowManager: typeof AbstractWindowManager;
    AbstractPlatformAPI: typeof AbstractPlatformAPI;
    lazy: {
        XTermTerminal: () => Promise<typeof import("../term_impl/xterm").XTermTerminal>;
    };
}>;
