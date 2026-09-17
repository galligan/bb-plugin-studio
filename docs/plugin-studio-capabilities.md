# Plugin Studio released-capability matrix

Date verified: 2026-08-10  
Released target: `bb-app@0.36.0`, plugin SDK declarations `0.4.1`

Plugin Studio is allowed to depend only on public behavior shipped in a
released bb artifact. This matrix records the clean-room Gate 0 probe that
decides which host integrations can be built in bb Plugin Studio without importing the
upstream checkout or inventing an SDK substitute.

## Result

| Capability          | Result | Released proof                                                                                                                  | Delivery consequence                                                               |
| ------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Frontend shell      | Pass   | `bb plugin new --app`, refreshed generated declarations, `navPanel`, native frontend build                                      | Build a real `bb-plugin-studio` navigation panel                                   |
| Backend supervision | Pass   | `bb.background.service` and `bb.onDispose` type-check and build                                                                 | Supervise the packaged `bb-plugin-studio` runtime from the plugin                  |
| Native tools        | Pass   | A strict bounded Zod tool type-checks, builds, and packs                                                                        | Expose Workbench domain operations as native bb tools                              |
| Skills              | Pass   | Manifest skill roots and conditional `bb.agents.configure` type-check, build, and pack                                          | Ship one project-aware `plugin-studio` skill                                       |
| Thread and composer | Pass   | Mention provider, thread-panel action, message action, composer mention, and quote APIs type-check and build                    | Reference Workbench objects through released mentions, quotes, panels, and actions |
| Isolated lifecycle  | Pass   | Path install, source inspection, reload, disable, enable, second reload, and remove all succeed in a disposable bb 0.36 profile | Include installed-live lifecycle proof in the integrated trial                     |

These passes establish contract availability, not finished product behavior.
The integrated plugin still needs runtime protocol, visual mounting, lifecycle,
security, accessibility, and clean-room tests before it is considered ready.

## Clean-room method

The probes used the published `bb-app@0.36.0` package and generated declarations
only. They did not resolve `@bb/plugin-sdk` from npm, use a workspace link,
import `../bb`, or copy SDK/runtime/testing code.

Build probes used fresh scaffold directories and isolated npm/Bun caches. Rows
A–D used a plain install, while E explicitly included development dependencies
after its scaffold step left no local TypeScript binary:

```sh
bb plugin new <name> --app
npm install --no-fund --no-audit                 # A-D
npm install --include=dev --no-fund --no-audit   # E
bb plugin types <path> --check
tsc --project <path>/tsconfig.json --noEmit
bb plugin build <path>
npm pack --json --ignore-scripts
```

The lifecycle probe started the published server with Node under `env -i` and
explicit disposable `HOME`, XDG roots, caches, data directory, loopback host,
server port, and host-daemon port. Before any plugin mutation, launcher output
and `bb status --json` agreed on the temporary data directory. Every client
command used the matching `BB_SERVER_URL` and host-daemon port.

The temporary plugin was installed by path, reloaded, disabled, enabled,
reloaded, and removed. Shutdown left no temporary listener or process. The
normal desktop stayed on its original ports and its plugin inventory contained
no temporary source or identifier.

## Exact evidence ledger

The disposable probe roots are evidence identifiers, not runtime dependencies.
No repository command or deliverable refers to them.

### Rows A and B

- Root: `/tmp/bb-plugin-studio-gate0-ab.ldrGZM`
- Published package integrity:
  `sha512-E2XIZGCYiBw3SNAI9zlFESNNSaAhASd360DP94Oqtgn/37hlthWYjJg915EG/ddBix1f1UUfMnjtq3ac8p4prg==`
- CLI: `probe/node_modules/bb-app/dist/bb.js`; `bb --version` returned `0.36.0`.
- Isolated command selectors: `BB_DATA_DIR=<root>/bb-data`,
  `BB_SERVER_URL=http://127.0.0.1:48986`, and
  `BB_HOST_DAEMON_PORT=48987`.
- Generated engines: bb `>=0.36`; plugin SDK `^0.4.1`.
- Canonical declaration SHA-256: app
  `984e0539c6926d42ddaf666c6b6890a567d08f711d9ae73a9b986620230eed9a`;
  backend
  `5c7c834978e9710999ef7b5fd777e623a139fcd7a29ac11dea0b69f0d6e918cb`.
- Native artifact SHA-256: `app.js`
  `9d858c3d6cd2c6e89c7957d483d0b4749f8ca01d549daa91ec8d2a6a4c5f24dc`;
  `server.js`
  `bf0f4d5d906add5eacb254efa1dfecad67da4b369ab53939cca5f901d59bedc6`;
  app/server metadata
  `9c9f52e37551b0a581cddbbd61247ea4caa54b506e297f35315662bc45eb4db5`.
- Metadata: SDK `0.4.1`, artifact format `1`, plugin
  `workbench-probe@0.1.0`, built with bb `0.36.0`.
- Raw `npm pack --dry-run --json` produced 25 entries and omitted every
  `dist/` artifact, establishing the package-rule caveat.

### Rows C, D, and E

- Root: `/tmp/bb-plugin-studio-gate0-cde.5sNLy6`
- CLI:
  `toolchain/node_modules/bb-app/dist/bb.js`; `bb --version` returned `0.36.0`.
- Probes: `scaffold/bb-plugin-gate-c`, `bb-plugin-gate-d`, and
  `bb-plugin-gate-cde`.
- Each probe ran generated declaration check, local TypeScript `--noEmit`,
  native `bb plugin build`, then `npm pack --json --ignore-scripts` after adding
  the explicit temporary `files: ["dist", "skills"]` allowlist.
- Row C `server.js` SHA-256:
  `3cf3c75a4f53bd02da3a6199a83231eb64c044f2556ac2d8da33572f02c5c16b`;
  package SHA-256:
  `e1adbeb6c2427adff2b7ca21dcd56c302e8bac961ab415d4b31c59bc9fdde6fb`.
- Row D `server.js` SHA-256:
  `c8e236c103095d08d81363d7ce756683455844f06906d53243a342f8795d4867`;
  package SHA-256:
  `9f2587ecd02c694f4159495f8b1351312489ebfdb6a804773ec777f91db89114`.
- Row E `server.js` SHA-256:
  `6757a4598d19492b605ca12e8fccf8e794e7e8508af11b203f1bd42289d62af9`;
  `app.js` SHA-256:
  `fa88df48ef2de3c74a7a6dd96ca4e8ac59cb80bd59dbb020854502b38f9c76d8`;
  package SHA-256:
  `49590f0b8897eb7b7c8e2743bb4c47e613133376214047a175f6a0f58e44447a`.
- Every native metadata file records SDK `0.4.1`, artifact format `1`, and bb
  `0.36.0`. Package manifests/locks contain no `@bb/plugin-sdk` package,
  workspace link, sibling path, or private SDK reference.

The exact C–E command transcript used root
`/tmp/bb-plugin-studio-gate0-cde.5sNLy6` and released binary
`toolchain/node_modules/.bin/bb`. `<C>`, `<D>`, and `<E>` below are exactly
`<root>/scaffold/bb-plugin-gate-c`, `<root>/scaffold/bb-plugin-gate-d`, and
`<root>/scaffold/bb-plugin-gate-cde`:

- Toolchain, from the repository cwd:
  `npm install --prefix <root>/toolchain --ignore-scripts --no-audit --no-fund bb-app@0.36.0`.
- C, from the repository cwd:
  `npm install --prefix <root>/scaffold/bb-plugin-gate-c --no-audit --no-fund`.
  From the root cwd: `bb plugin types <C> --check`,
  `<C>/node_modules/.bin/tsc --project <C>/tsconfig.json --noEmit`, and
  `bb plugin build <C>`.
- D, from the repository cwd:
  `npm install --prefix <root>/scaffold/bb-plugin-gate-d --no-audit --no-fund`.
  From the root cwd: `bb plugin types <D> --check`,
  `<D>/node_modules/.bin/tsc --project <D>/tsconfig.json --noEmit`, and
  `bb plugin build <D>`.
- E's first local-tsc invocation, from the root cwd, failed with `no such file
or directory`. The passing setup used
  `npm install --prefix <root>/scaffold/bb-plugin-gate-cde --include=dev --no-audit --no-fund`,
  with canonical cwd `/private/tmp/bb-plugin-studio-gate0-cde.5sNLy6`. From the logical
  root cwd, the probe then ran `bb plugin types <E> --check`,
  `<E>/node_modules/.bin/tsc --project <E>/tsconfig.json --noEmit`, and
  `bb plugin build <E>` successfully.
- From each plugin cwd, the initial packaging argv was
  `npm pack --dry-run --json --ignore-scripts`. After the temporary manifest
  gained exactly `files: ["dist", "skills"]`, the final argv was
  `npm pack --json --ignore-scripts --pack-destination <root>/packs`.

The preserved npm debug logs record C/D's plain `--prefix` installs and E's
`--include dev` install plus their working directories. All installs selected
`HOME=<root>/home`, `XDG_CONFIG_HOME=<root>/xdg-config`,
`XDG_DATA_HOME=<root>/xdg-data`, `XDG_CACHE_HOME=<root>/xdg-cache`, and
`npm_config_cache=<root>/npm-cache`. The types/build commands used the root cwd,
the same HOME/XDG selectors, and `BB_DATA_DIR=<root>/bb-data`. Pack commands
used the plugin cwd and no explicit isolation selectors; they only inspected or
created local archives and did not contact or mutate a bb server/profile.

### Row F

- Fresh rerun root: `/tmp/bb-plugin-studio-gate0-row-f-rerun.nM6L2m`; unique plugin ID:
  `pw-gate0-row-f-20260810`.
- Evidence-ledger SHA-256:
  `16c83fa30ac3fe5d3f1c28478e507fd1690ff012812040d28c19a756a2d77e9d`.
- Released entrypoints: workspace-pinned published `bb-app@0.36.0`
  `dist/bb.js` and `dist/bb-app.js`, launched with `/opt/homebrew/bin/node`.
- Before mutation, the normal server reported `/Users/mg/.bb`, listened only on
  `127.0.0.1:38886/38887`, contained ten projected plugin rows, and contained
  neither the unique plugin ID nor temporary root in its list or on-disk state.
- The isolated server used `env -i`, temporary HOME/XDG/npm/Bun/TMP/data roots,
  and `127.0.0.1:52879/52880`. Launcher output, status, process command, and
  listeners all agreed on that topology before plugin mutation.
- The isolated profile began with nine builtins. Connect remained
  `disconnected`, `paired: false`, and `shares: []` before and after lifecycle.
- Exact lifecycle commands were `plugin new`, isolated
  `bun install --ignore-scripts`, `plugin install . --yes --json`, list, source,
  reload, disable, list, enable, reload, remove, final list, and source-file
  preservation check.
- Observed sequence: running, running after reload, disabled, running after
  enable, running after the second reload, absent after remove. Final isolated
  list contained only nine builtins.
- Ctrl-C shut the launcher down with exit 0. No isolated listener or process
  remained. The normal server still reported `/Users/mg/.bb`; its projected ten
  plugin rows were byte-equivalent before/after, and the unique ID/root remained
  absent from both list and disk.
- Server log SHA-256:
  `2b3fd0a75f2020daf269360dff3bf69651e97213e88f0dbd4221a09548e817dd`;
  host-daemon log SHA-256:
  `50c76d86aa8d6253d6290f9b3c6e126131325aa23b47382b79256e97254363ba`.

## Released-artifact caveats

### Scaffold dependency install

The 0.36 app scaffold's initial install does not install all generated
development dependencies. An explicit `npm install --include=dev` makes
declaration checks, TypeScript, and native builds pass. This is degraded
scaffold ergonomics tracked upstream in
[get-bb/bb#1133](https://github.com/get-bb/bb/issues/1133) and
[get-bb/bb#1135](https://github.com/get-bb/bb/pull/1135), not an SDK blocker.

### Package allowlist

The generated `.gitignore` excludes `dist/`, and the scaffold has no npm
`files` allowlist or `.npmignore`. Raw `npm pack` therefore omits the built
artifacts. `bb-plugin-studio` must declare an explicit allowlist containing its
prebuilt `dist` output, skills, and packaged runtime, and its package inspection
gate must verify every required file plus executable mode and checksum.

### Server runtime

The published `dist/bb-app.js` server entrypoint runs with Node. Launching that
entrypoint with Bun fails on the Node `registerHooks` API. This affects the
isolated test recipe; it does not change the compiled `bb-plugin-studio` runtime target.

### Harness mode

`@get-bb/plugin-sdk` is published. As of bb 0.43.1, pin `0.4.87` (the version
shipped with that release, not npm latest). Official `testing` and
`testing/app` subpaths resolve from a clean plugin install. bb Plugin Studio must
label Harness available only when those exports resolve, and must keep Harness
behavioral rather than visual authority. Do not copy the harness from the
sibling checkout. Fixture and isolated Live bb proofs remain separate.

### Host limits

Released contracts still do not provide automatic in-app browser control,
capture of arbitrary bb browser tabs, generic first-class thread attachments,
or remote-host loopback tunneling. V1 therefore uses a visible Copy/Open browser
handoff, Workbench-owned Fixture capture, and mentions/quotes/panels/tool images.

## Admission decision

All six conditional host rows are admitted to the downstream Plugin Studio
program. A later regression in one row narrows only that dependent slice; it
does not authorize a private fallback or block the runtime, browser, domain, or
MCP work that remains independent.
