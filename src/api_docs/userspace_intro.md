---
title: Introduction
group: Userspace
category: 📖 Manual
---

# Userspace API

All programs have access to the Userspace API, providing limited access to the kernel but allowing interaction with the system.

Userspace programs run isolated, in a thread of their own (or a sandboxed frame, for programs that set `needs_dom`), and talk to the kernel through the Userspace API. Calls to it are asynchronous, so they should be awaited.
