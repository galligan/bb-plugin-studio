# Source preview

bb Plugin Studio is not currently distributed as a public installable package.
For now, the supported first-contact experience is an experimental source
preview from this repository. It is suitable for exploring the deterministic
workbench, inspecting a plugin source tree, and evaluating native bb handoffs.
It is not a release installation or a production support commitment.

This rename introduces `bb-plugin-studio` as the canonical package and command
identity. The source preview creates a clean `studio` installation; the former
legacy plugin has been removed rather than migrated in place.

## Prerequisites

- macOS for native bb handoffs;
- [bb](https://github.com/get-bb/bb#use-bb) on `PATH` when using `check` or
  `live`;
- Bun 1.3.14 or a newer engine-compatible version;
- Git;
- an existing bb plugin source tree for plugin-specific inspection.

The fixture workbench itself runs without a bb server, a sibling bb source
checkout, credentials, or a plugin installation.

## Start the fixture workbench

```sh
git clone https://github.com/galligan/bb-plugin-studio.git
cd bb-plugin-studio
bun install --frozen-lockfile
bun run bb-plugin-studio --help
bun run dev
```

Open the local URL printed by the development server. The workbench uses
deterministic fixtures so its states remain reproducible and safe to discuss.
It does not read authenticated host state or run plugin code.

## Inspect a plugin source tree

Pass a plugin path explicitly so it is clear which workspace is in scope:

```sh
bun run bb-plugin-studio inspect /absolute/path/to/plugin
bun run bb-plugin-studio dev /absolute/path/to/plugin
```

`inspect` reads the selected plugin's manifest, generated native metadata, and
passive bb status. It does not import or execute the plugin. `dev` opens the
Fixture lab and does not install, build, reload, or run the selected plugin.

The native handoff commands have a wider boundary:

```sh
bun run bb-plugin-studio check /absolute/path/to/plugin
bun run bb-plugin-studio live /absolute/path/to/plugin
```

- `check` reports compatibility, delegates `bb plugin build` to the bb CLI,
  and inspects the result again. The build may write generated output inside
  the selected plugin.
- `live` delegates `bb plugin dev` only after bb confirms that the same plugin
  path is already installed. Otherwise it prints the native install command
  and stops; it does not install the plugin for you.

Use disposable or intentionally selected plugin workspaces for native handoffs.
Do not point this preview at a primary managed plugin merely to change its
source path: removing and reinstalling a managed plugin can discard settings or
other persisted state.

## What the preview proves

bb Plugin Studio distinguishes three confidence levels:

- **Fixture** is a deterministic approximation for visual iteration.
- **Harness** validates public behavior only when the selected plugin can
  resolve the official `@get-bb/plugin-sdk/testing` contracts. Harness results
  are behavioral, not visual authority.
- **Live bb** is the plugin running in the native host. Live bb is the visual
  and integration authority.

A successful Fixture preview does not prove that the plugin will look or behave
identically in bb. The source preview also does not provide a signed packaged
application, a stable installer, or a published Plugin Studio package. It
installs the new `studio` identity cleanly and does not import state from a
former legacy installation.

## Verify the checkout

Use the smallest relevant command while iterating. Before reporting a checkout
as healthy, run:

```sh
bun run format:check
bun run check
bun run test
bun run build
bun run visual:test
```

Some checks exercise browser tooling or native macOS behavior and may require
their documented local prerequisites. A failure should be reported rather than
treated as proof that the remaining lanes passed.

## Feedback

Please report source-preview problems and focused feature proposals in
[GitHub Issues](https://github.com/galligan/bb-plugin-studio/issues). Problems
with bb scaffolding, installation, runtime, host UI, or SDK contracts generally
belong in the [upstream bb issue tracker](https://github.com/get-bb/bb/issues).
