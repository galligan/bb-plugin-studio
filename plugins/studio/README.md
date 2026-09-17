# Plugin Studio

`bb-plugin-studio` is the released-contract bb plugin for in-process source
discovery. Opening Plugin Studio requests read-only status through a schema-v4 snapshot
without creating a secondary runtime, process, or listener.

After that initial status, the panel automatically performs one bounded refresh
across all eligible bb-registered local projects. The refresh icon repeats the
same all-project operation; there is no per-project selector or admit action.
Passive discovery checks each project root and packages inside its declared npm
or Bun workspace configuration, including supported bounded
`pnpm-workspace.yaml` patterns. All projects and their plugin inventories stay
expanded, and each plugin row opens that target's detail view.

Each refresh returns a finite, redacted point-in-time snapshot rather than a
realtime monitor. The Studio catalog owns target identity and returns only bounded
opaque projections. Plugin Studio does not execute target code, package
scripts, native plugin lifecycle commands, or installed-plugin inventory.
Source paths remain server-private, and the plugin never prints or exposes a
credential, process ID, installed path, source paths, or host
topology. Preview remains unavailable under #70.

## Development

Use the repository scripts to build and inspect the exact package. Native bb
remains the lifecycle authority for plugin build, path install, development,
reload, disable, and removal.

```sh
bun --filter bb-plugin-studio check
bun --filter bb-plugin-studio test
bun run plugin-studio:package:test
```

The macOS arm64 package gate runs released bb 0.43.1's plugin build, inspects the
resulting npm tarball, and proves managed schema-v4 discovery without a child
process or private listener. The publishable package manifest
uses the canonical `bb-plugin-studio` package and command
identity, but the tarball remains a local verification artifact until a
separate release approval. Do not upload, publish, or redistribute it from this
development workflow.
The verification flow does not install into a normal bb profile or enable
remote access.
