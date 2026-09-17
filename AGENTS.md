# AGENTS.md

bb Plugin Studio is the private workspace for browser-based bb interface experiments and the Studio-owned Studio plugin.

## Boundaries

- `apps/workbench` is a browser-only design studio. It uses deterministic fixtures and must run without a bb server.
- `plugins/studio` is the Studio-owned bb plugin used for live integration and packaging. Independently distributed plugins live in the sibling `../bb-plugins` repository and are inspected here by path.
- `../bb` is the canonical upstream source checkout. Read it for contracts and patterns, but do not edit it unless the task explicitly targets upstream bb.
- Do not import bb application internals into the workbench or plugins. Plugins use the public `@get-bb/plugin-sdk` contracts.
- Plugin frontend bundles run inside bb. Keep reusable visual components host-neutral and put bb-specific hooks behind thin adapters.
- Native bb owns scaffolding, declaration refresh, build, install, dev/reload, and live runtime. bb Plugin Studio may orchestrate those commands and explain their output, but must not reimplement them.
- Use the official `@get-bb/plugin-sdk/testing` and `@get-bb/plugin-sdk/testing/app` harnesses for contract tests. If they are unavailable from the selected plugin's installed dependencies, report Harness mode as unavailable; do not copy the harness or import it from `../bb`.
- Keep preview claims explicit: Fixture is a deterministic approximation, Harness validates public behavior, and Live bb is the visual authority.

## Working style

- Start non-trivial work with a plan under `.agents/plans/` and keep it current.
- Prefer a thin end-to-end slice over speculative infrastructure.
- Preserve deterministic fake states so visual changes are reproducible.
- Add shared packages only after two real consumers need the same code.
- Treat plugins as full-trust local code. Document filesystem, network, secret, and external-service access.
- Use Bun for workspace management, scripts, tests, and installs.

## Commands

```sh
bun install
bun run dev
bun run check
bun run test
bun run build
bun run format:check
```

Run the smallest relevant check while iterating and all checks before pushing.

## Plugin development

Develop distributable plugins in `../bb-plugins/plugins/<name>` and keep their package names in the `bb-plugin-*` namespace. Inspect or run one here by passing its path explicitly:

```sh
bun run bb-plugin-studio inspect ../bb-plugins/plugins/<name>
bun run bb-plugin-studio dev ../bb-plugins/plugins/<name>
```

Each plugin must declare honest `engines.bb` and `engines.bbPluginSdk` ranges. Managed npm or Git installs refuse incompatible ranges.

## Documentation

- Architecture and durable decisions belong in `docs/`.
- Active implementation plans belong in `.agents/plans/`.
- Keep screenshots and generated design artifacts out of source directories; place durable assets in a purpose-named directory and temporary QA artifacts in thread storage.
