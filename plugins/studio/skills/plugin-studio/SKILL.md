---
name: plugin-studio
description: Use Plugin Studio's in-process discovery and bb-owned catalog to inspect source plugins across eligible local bb projects.
---

# Plugin Studio

Open **Plugin Studio** from bb's plugin navigation to inspect its finite
schema-v4 catalog.

- Opening the panel first requests read-only status. Discovery runs in-process
  without starting a child process or opening a private listener.
- On mount, Plugin Studio automatically performs one bounded refresh across all
  eligible bb-registered local projects. The refresh icon repeats that same
  all-project operation. There is no per-project selector or admit action.
- Discovery checks each project root and packages inside its declared npm or Bun
  workspace configuration, including supported bounded `pnpm-workspace.yaml`
  patterns. All project groups and plugin rows remain expanded; choose a plugin
  row to open its detail view.
- The refresh does not execute target code, package scripts, installed-plugin
  inventory, or native plugin lifecycle actions. Source paths stay private to
  the backend. Target identity and history persist through Plugin Studio's
  catalog on bb-owned storage; the panel receives only bounded opaque
  projections.
- The Plugin Studio package contains no secondary runtime artifact or private
  server. Discovery and catalog access remain inside the bb plugin process.
- Preview remains unavailable under #70. Do not invent a private URL, expose a
  loopback listener, or substitute installed inventory for source discovery.
- Use native `bb plugin build`, `bb plugin dev`, and `bb plugin reload` for
  lifecycle work. Plugin Studio does not replace those commands.
- Treat Fixture, Harness, and Live claims separately. Harness is available when
  the selected plugin resolves `@get-bb/plugin-sdk/testing` and `testing/app`.
  It validates public behavior, not host chrome. Live bb remains the visual
  authority.
