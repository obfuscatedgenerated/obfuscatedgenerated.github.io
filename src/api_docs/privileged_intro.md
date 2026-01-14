---
title: Introduction
group: Kernel (Privileged)
category: 📖 Manual
---

# Kernel (Privileged) API

Programs that start privileged, or successfully [request elevation](./interfaces/UserspaceKernel.html#request_privilege), have access to the Kernel API, which provides full access to the system.

This is a responsibility, and programs should only request elevation when absolutely necessary.
