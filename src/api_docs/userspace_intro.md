---
title: Introduction
group: Userspace
category: 📖 Manual
---

# Userspace API

All programs have access to the Userspace API, providing limited access to the kernel but allowing interaction with the system.

Userspace programs run isolated, in a thread of their own (or a sandboxed frame, for programs that set `needs_dom`), and talk to the kernel through the Userspace API.

## Calling across the boundary

The `Userspace*` interfaces document each object as the kernel provides it. A program doesn't hold those objects directly: it holds stubs that forward each call to the kernel, and their types are given by {@link Remote}. `main` already receives everything typed this way, so the types tell you what to await.

- **Synchronous:** values the kernel keeps in step with the program (e.g. `term.cols`, `process.cwd`, `window.width`), constants (e.g. `process.pid`), handles to other objects (e.g. `kernel.get_fs()`, `process.terminal`) and local helpers (e.g. `fs.join()`, `term.ansi`).
- **Asynchronous:** every other method that returns a value returns a promise of it, e.g. `await fs.read_file(path)` or `await term.get_custom_flag(flag)`, even where the interface declares it as synchronous.
- **Fire and forget:** methods that return nothing (e.g. `term.write()`, `window.show()`) are sent without waiting, but always arrive in the order they were called.

Anything a call returns that is itself a userspace object (a window, another process, a socket) is a stub too. Plain data is copied, and callbacks you pass in are called back across the boundary.

## Libraries

Some helpers ship with the types as code that is bundled into your program:

- `ollieos/lib/ansi`: terminal colours, styles and text helpers (see {@link ANSI}).
- `ollieos/lib/web_storage`: localStorage, IndexedDB and cookies for programs that need them, saved to the filesystem (see {@link install_web_storage}). Isolated programs don't have these otherwise.
