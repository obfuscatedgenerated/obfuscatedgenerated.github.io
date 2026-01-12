# OllieOS API Documentation

Welcome to the OllieOS Program API documentation.

This document provides an overview of the APIs available to your program and their usage.

The APIs and context are exposed to the program by passing a [data object](./interfaces/Program_Types.ProgramMainData.html) to the program's `main` function.

## Categories

### [Userspace API](./modules/Userspace.html)

All programs have access to the Userspace API, providing limited access to the kernel but allowing interaction with the system.

### [Kernel (Privileged) API](./modules/Kernel_(Privileged).html)

Programs that start privileged, or successfully [request elevation](./interfaces/Userspace.UserspaceKernel.html#request_privilege-1), have access to the Kernel API, which provides full access to the system.

This is a responsibility, and programs should only request elevation when absolutely necessary.

### [Program Types](./modules/Program_Types.html)

Additional information on the type assertions applied to define a program in OllieOS.

## Example Program

Here is a minimal example of how programs are structured in OllieOS, according to the [Program interface](./interfaces/Program_Types.Program.html):

```ts
import type { Program } from "ollieos/types";

export default {
    name: "hwpkg",
    description: "Says hello to the world!",
    usage_suffix: "",
    arg_descriptions: {},
    compat: "2.0.0",
    main: async (data) => {
        const { term } = data;

        term.writeln("hello package!");

        return 0;
    }
} as Program;
```
