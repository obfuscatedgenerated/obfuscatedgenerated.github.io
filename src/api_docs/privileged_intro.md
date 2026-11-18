---
title: Introduction
group: Kernel (Privileged)
category: 📖 Manual
---

# Kernel (Privileged) API

Programs that run in kernel space (`space: "kernel"`, after the user allows it) have access to the Kernel API, which provides full access to the system. So do the [kernel functions](../Program_Types/KernelFunc.html) of a userspace program, when it [requests one](../Userspace/UserspaceKernel.html#request_kernel_func) and the user allows it.

This is a responsibility, and programs should only use kernel space when absolutely necessary. Prefer a few small kernel functions over making the whole program run in kernel space.

## Using the Userspace API from kernel space

Kernel space code still uses many of the Userspace API's objects (e.g. the shell, or the userspace proxies it hands to programs). It holds them directly rather than through stubs, so it calls every member exactly as its signature says. The <code class="tsd-tag">Sync</code>, <code class="tsd-tag">Await</code> and <code class="tsd-tag">Fire And Forget</code> tags on userspace members describe userspace programs only, and can be ignored here.
