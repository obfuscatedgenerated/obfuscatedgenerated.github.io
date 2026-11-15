# Changelog

Major versions and the minor versions that added something worth mentioning. Patch releases and anything not listed are in the tags and git history.

## 3.1.0: Relative program invocation

Programs can now be invoked relative to the current working directory, so `./program` runs a program in the current directory, and `../program` runs one in the parent directory.

## 3.0.0: Isothreads

Every userspace program now runs isolated, in a thread of its own, and talks to the kernel through an RPC layer. A misbehaving or malicious program can no longer reach the kernel, the filesystem's storage, or the page.

### New

- **Isothreads.** Userspace programs run in a web worker with an opaque origin, so they have no access to OPFS, IndexedDB, Cache Storage, cookies or the OS page. They can be killed outright, even mid-loop.
- **DOM programs stay isolated.** Programs that set `needs_dom` run in a sandboxed frame instead of a worker. The frame is the program's window, and `wind.dom` is its own document, so HTML, CSS and React work as before.
- **Ctrl+C** interrupts the foreground process, even one stuck in a loop or holding the keyboard.
- **Kernel functions.** A userspace program can export `kernel_funcs` and request one with `kernel.request_kernel_func()`. It runs in kernel space after the user allows it, and the rest of the program stays isolated.
- **Thread functions.** Programs can export `threads` and run them with `process.run_thread()`, to keep heavy work off the thread the program runs on.
- **Type safe sections.** Name a program's exports in the generic, e.g. `Program<{kernel_funcs: typeof kernel_funcs, threads: typeof threads}>`, and requests are checked by name, input and result.
- **Filesystem program lookup.** Programs are found on the filesystem instead of a registry. Builtins are described in `/bin`, and packages install to `/usr/bin` (programs) and `/usr/lib/<package>/` (everything else).
- **Isolated tab completion.** A package's completion runs in its own warm thread, so its code never loads in the kernel.
- **Platform URLs.** `platform.open_url()` opens http(s) links directly and asks before any other scheme.
- **Screen size.** `wm.get_screen_size()` gives the size windows can occupy, kept up to date.
- **Stricter package handling.** Package names, versions and file paths are validated, so a package can't install outside its own directory.

### Breaking changes

- Calls to the userspace API from a program are asynchronous. Await them, including `process.create_window()`.
- `kernel.request_privilege()` is removed. Use kernel functions, or `space: "kernel"` for programs that need full access for their whole run.
- Only `space: "kernel"` programs receive the real kernel. `start_privileged` now means the spawner vouches for the program: a kernelspace program skips its prompt, and a userspace program's kernel functions run without asking.
- `kernel.spawn()` is asynchronous.
- Programs can't create their own `Worker`. Use thread functions.
- `kernel.load_program()` is removed from userspace. Tab completion goes through `kernel.complete()`.
- The program registry is removed.
- Packages use a flat layout (`<program>.js` and `<program>.json`) and must be rebuilt with the 3.0 pkgbuild.
- The program API compat version is now 3.0.0, so programs written for 2.x won't run until updated.

### Packages

On first boot, packages installed under 2.x are moved to `/var/backup/packages/`. Run `pkg migrate` to reinstall them once the package repo has been rebuilt for 3.0. Until then, packages that haven't been rebuilt can't be installed.

## 2.10.0: Terminal userspace proxy

- Programs get a userspace proxy of the terminal instead of the terminal itself.
- The ANSI helpers moved to their own library. The old terminal properties remain as deprecated aliases.

## 2.9.0: Platform API

- A platform API for platform specific capabilities, used by the native ports.

## 2.8.0

- Rewrote the `edit` program.
- The porter network connection is made lazily.

## 2.7.0: SDK

- Exposed and documented the SDK of abstract classes, so packages can extend kernel implementations.
- Programs are loaded from blobs.
- Window focus handling, and `keep_terminal_open_after_run` for GUI launched programs.

## 2.6.0

- Processes inherit the working directory of the process that spawned them.
- Shutdown is coordinated over IPC.

## 2.5.0: Window layers and GUI programs

- Window composition layers (background, normal, top, plus privileged overlay and administrative).
- Programs can declare GUI properties (display name, icon, launch arguments).
- A windowed terminal that can run any command.
- Privilege requests are queued.

## 2.4.0: SSH

- An SSH server with virtual terminals, including resizing and persistent host keys.

## 2.3.0: Telnet and services

- Terminals split into an abstract terminal and implementations, allowing virtual terminals.
- A telnet server.
- Services can be enabled to start automatically, with protected privileged services.

## 2.2.0: Networking

- Networking through an abstract network manager, with the porter bridge implementation, so processes can listen and connect.
- Deployment moved to CI/CD with automatic tagging.

## 2.1.0: Userspace

- Programs receive userspace proxies of the kernel and filesystem instead of the objects themselves.
- Privilege requests, handled by a replaceable privilege agent.
- `/boot/init` is protected.

## 2.0.0: The kernel split

- The kernel is separated out of the terminal, which had been doing everything.
- Shells are an abstraction of their own, with the terminal reduced to input and output.
- The boot process moved into the kernel, and the init system can be changed.

## 1.4.0: Ignition

- Ignition, a systemd style init system, with services managed by `spark`.
- `jetty` for terminal sessions.
- Package triggers.

## 1.3.0: OPFS and IPC

- An OPFS filesystem implementation, with programs moved to the asynchronous filesystem API.
- Inter-process communication with services and channels.

## 1.2.0: Processes

- Process ownership, background processes, and the `ps` and `kill` commands.
- Tab completion for builtin programs.
- `pkg info` and `pkg browse`.
- Filesystem recovery.

## 1.1.0

- Aliases.
- Window animations, minimising and maximising, and window flags.

## 1.0.0: Windows

- A window manager, with draggable windows.
- Types for packages are built to a branch of the repo.

## 0.x: The concept

OllieOS started as a rough concept for a terminal portfolio site, built on an object oriented terminal and a registry of programs. Over the 0.x releases, the ideas of an operating system began to develop:

- **0.10:** the `pkg` package manager.
- **0.11:** a fuller filesystem with `mv`, `mkdir` and `touch`, and `.ollierc`.
- **0.12:** Node.js support, and programs moved from `async_main` to `main`.
- **0.13:** better variable substitution.
- **0.14:** site content moved to its own data repo.
