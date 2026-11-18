---
title: Introduction
group: Userspace
category: 📖 Manual
---

# Userspace API

All programs have access to the Userspace API, providing limited access to the kernel but allowing interaction with the system.

Userspace programs run isolated, in a thread of their own (or a sandboxed frame, for programs that set `needs_dom`), and talk to the kernel through the Userspace API.

## Calling across the boundary

The `Userspace*` interfaces document each object as the kernel provides it, so their signatures are exactly how kernel space code (`space: "kernel"` programs and kernel functions) calls them.

A userspace program doesn't hold those objects directly: it holds stubs that forward each call to the kernel, and their types are given by {@link Remote}. `main` already receives everything typed this way, so your editor shows what to await. In these docs, each member is tagged with how a userspace program calls it:

- <code class="tsd-tag">Sync</code> reads straight away, as declared: values the kernel keeps in step with the program (e.g. `term.cols`, `process.cwd`, `window.width`), constants (e.g. `process.pid`), handles to other objects (e.g. `kernel.get_fs()`, `process.terminal`) and local helpers (e.g. `fs.join()`, `term.ansi`).
- <code class="tsd-tag">Await</code> returns a promise, e.g. `await fs.read_file(path)` or `await term.get_custom_flag(flag)`, even where the signature shown is synchronous.
- <code class="tsd-tag">Fire And Forget</code> returns nothing and is sent without waiting (e.g. `term.write()`, `window.show()`), but always arrives in the order it was called.

Kernel space code can ignore the tags: it calls every member exactly as its signature says.

Anything a call returns that is itself a userspace object (a window, another process, a socket) is a stub too. Plain data is copied, and callbacks you pass in are called back across the boundary.

## Libraries

Some helpers ship with the types as code that is bundled into your program:

- `ollieos/lib/ansi`: terminal colours, styles and text helpers (see {@link ANSI}).
- `ollieos/lib/web_storage`: localStorage, IndexedDB and cookies for programs that need them, saved to the filesystem (see {@link install_web_storage}). Isolated programs don't have these otherwise.
