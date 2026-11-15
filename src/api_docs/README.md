# OllieOS API Documentation

*Please note this documentation is a work in progress and may be incomplete or subject to change.*

Welcome to the OllieOS Program API documentation.

This document provides an overview of the APIs available to your program and their usage.

The APIs and context are exposed to the program by passing a [data object](./Program_Types/ProgramMainData.html) to the program's `main` function.

## Categories

### [Userspace API](./Userspace/Introduction.html)

All programs have access to the Userspace API, providing limited access to the kernel but allowing interaction with the system.

Userspace programs run isolated, in a thread of their own (or a sandboxed frame, for programs that set `needs_dom`), and talk to the kernel through the Userspace API. Calls to it are asynchronous, so they should be awaited.

### [Kernel (Privileged) API](./Kernel_(Privileged)/Introduction.html)

Programs that run in kernel space (`space: "kernel"`, after the user allows it) have access to the Kernel API, which provides full access to the system. So do the [kernel functions](./Program_Types/KernelFunc.html) of a userspace program, when it [requests one](./Userspace/UserspaceKernel.html#request_kernel_func) and the user allows it.

This is a responsibility, and programs should only use kernel space when absolutely necessary. Prefer a few small kernel functions over making the whole program run in kernel space.

### [Program Types](./Program_Types/Introduction.html)

Additional information on the type assertions applied to define a program in OllieOS.

## Example Program

Here is a minimal example of how programs are structured in OllieOS, according to the [Program interface](./Program_Types/Program.html):

```ts
import type { Program } from "ollieos/types";

export default {
    name: "hwpkg",
    description: "Says hello to the world!",
    usage_suffix: "",
    arg_descriptions: {},
    compat: "3.0.0",
    main: async (data) => {
        const { term } = data;

        await term.writeln("hello package!");

        return 0;
    }
} satisfies Program;
```

Programs can also export `kernel_funcs` (functions that run in kernel space when requested and allowed) and `threads` (functions that run in a thread of their own). Name them in the `Program` generic for type safe requests, e.g. `satisfies Program<{kernel_funcs: typeof kernel_funcs, threads: typeof threads}>`.
