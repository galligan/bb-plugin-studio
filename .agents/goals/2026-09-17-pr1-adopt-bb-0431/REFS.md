# Goal References: PR 1 adopt bb 0.43.1

## Repo Guidance

- `AGENTS.md` — native bb owns lifecycle; no private bb imports; Harness vs Fixture vs Live
- `.bb/skills/update-plugin-studio-compatibility/SKILL.md` — isolated prefix procedure
- `docs/compatibility-target.md` — min vs verified-through policy
- `docs/product-naming.md` — `bb-plugin-mate` grew into Studio; current package is `bb-plugin-studio`

## Tracker

- https://github.com/galligan/bb-plugin-studio/issues/117 — adopt 0.43.1 + published SDK
- https://github.com/galligan/bb-plugin-studio/issues/41 — official testing harness
- https://github.com/galligan/bb-plugin-studio/issues/43 — re-probe scaffold/types/check
- https://github.com/galligan/bb-plugin-studio/issues/116 — watcher report only
- https://github.com/galligan/bb-plugin-studio/issues/21 — epic; PR grouping comment
- https://github.com/galligan/bb-plugin-studio/pull/115 — merged; enrolled-host discovery off

## Source Files

- `compatibility/bb-target.json` — still verified through 0.37.0 / SDK 0.4.1
- `packages/inspection/src/harness.ts` — still probes `@bb/plugin-sdk/testing`
- `plugins/studio/package.json` — engines and identity
- `plugins/studio/types/` — portable `@bb/plugin-sdk` shims
- `apps/workbench/src/preview-mode.ts` — currently forces harness unavailable

## Docs / ADRs / Notes

- `.agents/plans/2026-09-17-rebase-issues-onto-bb-043.md` — issue rebase + PR grouping
- `docs/architecture/runtime-convergence.md` — native topology already landed

## PRs / Branches

- `origin/main` @ `f566649` — includes #115
- intended branch: `feat/plugin-studio/adopt-bb-0431`
- do not commit from `gitbutler/workspace` dirt (visual snapshots)

## Commands

- Install isolated CLI: `npm pack` / prefix install of exact `bb-app@0.43.1` into `mktemp -d`
- Isolated types: `bb plugin types --check plugins/studio`
- `bun run compatibility:check`
- `bun run compatibility:latest --json`
- `bun run format:check && bun run check && bun run test && bun run build`
- `gh pr view <n> --json statusCheckRollup,headRefOid`

## Environment (this machine, 2026-09-17)

- Daily bb: `/Applications/bb.app` via `~/.local/bin/bb` → 0.43.1
- Data dir: `~/.bb` (normal profile; do not mutate)
- Studio: path source `~/Developer/bb/plugin-studio/plugins/studio`, enabled, running
- `bb-dev`: not present
- npm `bb-app`: 0.43.1
- npm `@get-bb/plugin-sdk` latest: 0.4.99 (do not assume this is the 0.43.1 pin)

## Prompt

- `.agents/goals/2026-09-17-pr1-adopt-bb-0431/PROMPT.md`

## Review Reports

- `.agents/goals/2026-09-17-pr1-adopt-bb-0431/tmp/reviews/` — create during execution
