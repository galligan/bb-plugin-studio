# bb Plugin Studio

[![CI](https://github.com/galligan/bb-plugin-studio/actions/workflows/ci.yml/badge.svg)](https://github.com/galligan/bb-plugin-studio/actions/workflows/ci.yml)
[![license](https://img.shields.io/github/license/galligan/bb-plugin-studio)](LICENSE)

bb Plugin Studio is an experimental, fixture-driven authoring companion for plugins
built for [bb](https://github.com/get-bb/bb), the agent IDE that builds itself.

It gives plugin authors a fast browser workbench, passive compatibility
diagnostics, and a small CLI for moving between deterministic fixture states and
the real native bb development loop. bb Plugin Studio is a community project, not part of
the upstream bb distribution.

> [!IMPORTANT]
> bb Plugin Studio does not replace bb, the bb CLI, or `@bb/plugin-sdk`. Native bb remains
> the source of truth for plugin contracts, scaffolding, builds, installation,
> reload, runtime behavior, and the final in-app result.

## Why bb Plugin Studio exists

A native bb plugin can contribute backend services, tools, commands, skills,
settings, and frontend UI. The official bb toolchain owns how those plugins are
created and run. bb Plugin Studio focuses on a narrower authoring problem: making plugin
structure and UI states easier to inspect, discuss, and test before handing the
plugin back to live bb.

Today bb Plugin Studio can:

- passively discover ordinary bb plugin source trees without adding a bb Plugin Studio
  manifest;
- inspect `package.json`, native `dist/*.meta.json`, engine ranges, and passive
  bb status without importing or executing the plugin;
- render deterministic stories for the public plugin UI surface catalog;
- run accessibility and visual-regression checks against those fixture states;
- delegate compatible build and development commands to the native `bb` CLI;
- explain what is available in Fixture, official SDK Harness, and Live bb modes.

> [!NOTE]
> Remote projects on enrolled bb machines are not currently supported. Plugin
> Studio discovers projects only on bb's primary machine.

## bb, the plugin SDK, and bb Plugin Studio

| Layer                              | What it owns                                                                                                                                            |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [bb](https://github.com/get-bb/bb) | Plugin scaffolding, declaration refresh, build, install, update, dev/reload, host UI, routing, state, and live runtime                                  |
| `@bb/plugin-sdk`                   | The typed backend and frontend contracts plugins compile against, plus the official testing contracts when they are available to the plugin             |
| bb Plugin Studio                   | Passive discovery and compatibility reports, deterministic fixture stories, visual/a11y tooling, thin native-command orchestration, and Live bb handoff |

The native loop still looks like this:

```sh
bb plugin new my-plugin --app
cd bb-plugin-my-plugin
bb plugin install . --yes
bb plugin dev .
```

bb Plugin Studio can sit beside that loop, but it never becomes the runtime:

```sh
bun run bb-plugin-studio inspect .
bun run bb-plugin-studio dev .
bun run bb-plugin-studio check .
bun run bb-plugin-studio live .
```

`bb-plugin-studio` is the canonical package and command identity introduced by
the Studio rename.

- `inspect` is passive and does not execute plugin code.
- `dev` opens the Fixture lab.
- `check` reports compatibility, delegates `bb plugin build .`, and reports
  again.
- `live` delegates `bb plugin dev .` only when native bb confirms the same
  plugin path is installed. Otherwise it prints the native install command.

The official SDK testing subpaths are the behavioral authority. bb Plugin Studio does not
copy them or import private bb source as a fallback. Until the selected plugin
can resolve the official testing package and bb Plugin Studio has an upstream-backed
adapter, Harness mode remains unavailable. Publication of those testing
subpaths is tracked upstream in
[get-bb/bb#1134](https://github.com/get-bb/bb/issues/1134).

## Try the source preview

Prerequisites:

- [bb](https://github.com/get-bb/bb#use-bb) for native build, install, and Live
  handoffs;
- Bun 1.3.14 or a newer engine-compatible version;
- an existing bb plugin when you want to inspect or hand off a real workspace.

Clone and start the deterministic workbench:

```sh
git clone https://github.com/galligan/bb-plugin-studio.git
cd bb-plugin-studio
bun install --frozen-lockfile
bun run bb-plugin-studio --help
bun run dev
```

The browser workbench runs with fixtures and does not require a bb server. To
inspect an existing plugin source tree explicitly:

```sh
bun run bb-plugin-studio inspect /absolute/path/to/plugin
bun run bb-plugin-studio dev /absolute/path/to/plugin
```

bb Plugin Studio is not currently distributed as a public installable package.
The supported first-contact path is this experimental source preview; commands,
fixtures, and package contents may change. See the [Source preview
guide](docs/source-preview.md) for exact boundaries, useful checks, and native
handoff behavior.

## Develop and verify from source

After following the source-preview setup above, useful checks are:

```sh
bun run format:check
bun run check
bun run test
bun run build
bun run visual:test
```

The source workbench passively discovers plugin packages beneath its admitted
project roots and assigns each one an opaque, stable catalog ID. Its browser
session is read-only and Fixture-only: selecting a target does not run `bb`,
query Connect or npm, import the plugin, or expose its canonical path. Pass an
explicit external plugin path to the CLI when needed:

```sh
bun run bb-plugin-studio inspect /absolute/path/to/plugin
bun run bb-plugin-studio dev /absolute/path/to/plugin
```

No sibling bb checkout is required. Contributors may keep one nearby for
read-only upstream comparison, but bb Plugin Studio must build and test without it.

## Preview confidence

bb Plugin Studio keeps three claims separate:

- **Fixture** — deterministic browser state for quick visual iteration. It is an
  approximation and runs without bb.
- **Harness** — public behavior validated by the official
  `@bb/plugin-sdk/testing` contracts. It does not reproduce bb layout or CSS.
- **Live bb** — the plugin running inside bb. This is the visual and integration
  authority.

A Fixture screenshot is useful regression evidence; it is never proof that a
plugin looks or behaves exactly the same inside bb.

## Repository map

```text
apps/cli/        The source CLI (current command: bb-plugin-studio)
apps/workbench/  Browser-only fixture workbench
packages/        Shared inspection and authoring contracts
plugins/studio/    Studio-owned live integration plugin
docs/            Architecture, authoring, trust, and compatibility guides
```

Start with:

- [Source preview guide](docs/source-preview.md)
- [Plugin-author guide](docs/plugin-author-guide.md)
- [Architecture and upstream boundary](docs/architecture.md)
- [Product naming and compatibility](docs/product-naming.md)
- [Trust and operation model](docs/trust-model.md)
- [Compatibility target](docs/compatibility-target.md)
- [Plugin Studio released capabilities](docs/plugin-studio-capabilities.md)
- [Contributing](CONTRIBUTING.md)
- [Support](SUPPORT.md)
- [Security policy](SECURITY.md)

## Project status

bb Plugin Studio is an independent experimental project. The current compatibility target
is recorded in `compatibility/bb-target.json` and checked with:

```sh
bun run compatibility:check
bun run compatibility:latest
```

The latest-release check is non-mutating. A scheduled repository workflow uses
it to report stable bb drift; compatibility updates remain reviewed pull
requests rather than automatic rewrites.

When a native bb capability replaces a bb Plugin Studio seam, this project should adopt
the upstream path and delete the duplicate. The goal is a useful companion that
remains removable—not a second plugin platform.

## Contributing and support

Bug reports and focused feature proposals are welcome in
[GitHub Issues](https://github.com/galligan/bb-plugin-studio/issues). Please read
[CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.

Problems with native bb scaffolding, installation, runtime, host UI, or the SDK
contract itself generally belong in the
[upstream bb issue tracker](https://github.com/get-bb/bb/issues). bb Plugin Studio issues
should concern its inspection, fixtures, diagnostics, orchestration, or
documentation.

Security reports follow [SECURITY.md](SECURITY.md). Please do not put
vulnerability details or secrets in a public issue.

## License

bb Plugin Studio is available under the [MIT License](LICENSE). bb and its plugin SDK are
separate upstream software governed by their own repository and license.
