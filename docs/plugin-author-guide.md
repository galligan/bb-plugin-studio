# Plugin-author guide

bb Plugin Studio is an optional downstream authoring companion for native
[bb](https://github.com/get-bb/bb) plugins. Native bb still owns scaffold,
declaration refresh, build, install, dev/reload, and the live runtime.

## Prerequisites

- Bun 1.3.14, the currently verified version; newer engine-compatible versions
  are best-effort until added to CI;
- Git for obtaining the source preview;
- an existing bb plugin when you want inspection or native handoff guidance;
- native bb 0.43.1 or newer, verified through 0.43.1, for supported native
  inspection, build, or Live handoffs. Newer releases remain usable with a
  nonfatal audit notice and are best-effort until the verified-through boundary
  is updated.

Install native bb through its own supported distribution before using native
handoffs. The local bb Plugin Studio artifact does not bundle, install, configure, or
start bb on the author's behalf.

Fixture exploration does not require native bb, Connect, secrets, a sibling
`../bb` checkout, or installing `@get-bb/plugin-sdk`.

## Reach the first Fixture story

From a fresh checkout:

```sh
git clone https://github.com/galligan/bb-plugin-studio.git
cd bb-plugin-studio
bun install --frozen-lockfile
bun --filter @bb-plugin-studio/workbench stories --host 127.0.0.1 --port 61000
```

Open
<http://127.0.0.1:61000/?story=surfaces--sidebar-thread-list--catalog-fixtures>.
The lab has one story group for each cataloged public plugin surface. Its
fixture, theme, and viewport controls are URL-backed, so a selected state can be
reloaded or shared without creating plugin or bb state.

The command runs repository development code and serves HTTP on loopback. Story
discovery never imports a selected plugin, and content-script stories remain
inert. Stop the server with Control-C.

## Inspect an existing plugin

Run bb Plugin Studio from this repository and pass an explicit plugin directory:

```sh
plugin="/absolute/path/to/plugin"
bun run bb-plugin-studio --help
bun run bb-plugin-studio inspect "$plugin"
bun run bb-plugin-studio inspect "$plugin" --json
```

Inspection reads `package.json`, native `dist/*.meta.json`, and passive native
bb/Connect reports. It does not import the plugin entrypoint. An unavailable bb,
Connect, npm SDK publication, or Harness can make inspection exit nonzero; the
report still explains each capability independently and keeps Fixture use
available.

For an interactive source-checkout workbench around that plugin:

```sh
bun run bb-plugin-studio dev "$plugin" --host 127.0.0.1 --port 5173
```

The bare form is equivalent:

```sh
bun run bb-plugin-studio "$plugin"
```

The server performs the same passive inspection before it starts. Keep the host
on loopback unless you intentionally want the Fixture server reachable from
another machine. bb Plugin Studio reports existing Connect shares but never exposes,
unexposes, or pairs Connect.

## Native build and Live handoffs

These commands cross the passive boundary:

```sh
bun run bb-plugin-studio check "$plugin"
bun run bb-plugin-studio live "$plugin"
```

`check` delegates exactly `bb plugin build .` in the selected plugin and then
refreshes the compatibility report. It can execute the plugin's build toolchain
and writes native build artifacts.

`live` delegates exactly `bb plugin dev .` only after native bb proves that the
same real plugin path is installed. If it is not installed, bb Plugin Studio prints the
exact `bb plugin install <path> --yes` handoff and exits; it does not run the
installation. Native dev executes full-trust plugin code and may reload the
installed plugin. Review the [trust and operation model](trust-model.md) before
using either command on code you do not trust.

Set `BB_CLI` to an exact executable when you need to override the `bb` found on
`PATH`:

```sh
BB_CLI=/absolute/path/to/bb bun run bb-plugin-studio inspect "$plugin"
```

## Use the source preview

Plugin Studio is not currently distributed as a public installable package.
Use a source checkout for Fixture exploration:

```sh
plugin="/absolute/path/to/plugin"
git clone https://github.com/galligan/bb-plugin-studio.git
cd bb-plugin-studio
bun install --frozen-lockfile
bun run bb-plugin-studio --help
bun run bb-plugin-studio dev "$plugin"
```

Open the printed loopback URL, then stop the foreground server with Control-C.
The preview has no stable API or support SLA. Its reproducible local artifact
and clean-room lifecycle remain release-engineering evidence rather than an
installation promise; they are specified in [local-package.md](local-package.md).
Release-candidate maintainers can reproduce the source, packaged, and isolated
native lanes with the [clean-room alpha trial runbook](alpha-trial-runbook.md).

## Plugin package boundary

A plugin is an independently versioned package, not a bb Plugin Studio workspace
manifest. The expected boundary is:

```text
my-plugin/
  package.json       name, version, engines, and public bb manifest
  server.ts          optional server entrypoint declared by bb.server
  app.tsx            optional frontend entrypoint declared by bb.app
  tests/              package-owned tests
  assets/             package-owned assets
  dist/               native bb build metadata and bundles
```

Declare honest `engines.bb` and `engines.bbPluginSdk` ranges. Frontend adapters
that import `@get-bb/plugin-sdk/app` belong inside the plugin entrypoint or a thin
plugin-owned adapter because that runtime exists only inside bb. Reusable visual
components should stay host-neutral; add a shared bb Plugin Studio package only after two
real consumers need the same boundary.

Do not import application internals, copy the plugin SDK or testing harness, or
depend on `../bb`. Use native bb scaffolding and declaration refresh. If an
official testing package cannot resolve from the selected plugin's installed
dependencies, Harness is unavailable.

## Confidence levels

| Level   | What it proves                                      | What it does not prove                         |
| ------- | --------------------------------------------------- | ---------------------------------------------- |
| Fixture | Deterministic component state and bounded visuals   | Public SDK behavior, host CSS, or integration  |
| Harness | Public behavior through official testing contracts  | Exact host chrome, layout, routing, or runtime |
| Live bb | Real plugin integration inside the supported bb app | Compatibility with untested future bb releases |

Fixture is intentionally an approximation. Harness is available when the
selected plugin resolves `@get-bb/plugin-sdk/testing` and
`@get-bb/plugin-sdk/testing/app`. It validates public behavior, not host chrome.
Live bb is the visual authority because bb owns the
actual host layout, styling, routing, state, action lifecycle, and runtime.

## Before you contribute or ask for support

- Run the compatibility checker and read its target assumptions:

  ```sh
  bun run compatibility:check
  ```

- Follow [CONTRIBUTING.md](../CONTRIBUTING.md) for change and verification
  requirements.
- Use [SUPPORT.md](../SUPPORT.md) to determine whether a bb/SDK combination is
  in scope and whether the report belongs here or in upstream bb.
- Read [SECURITY.md](../SECURITY.md) before reporting a vulnerability or
  handling plugin secrets.

The copyable non-mutating paths above are covered by clean-runner CI, the
13-story browser matrix, and the isolated package lifecycle. Native mutation
handoffs are unit-tested for exact argv and remain user-invoked; this guide does
not silently exercise them.
