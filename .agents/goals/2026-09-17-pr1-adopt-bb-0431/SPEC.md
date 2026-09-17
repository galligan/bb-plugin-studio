# Goal Spec: PR 1 adopt bb 0.43.1

Date: 2026-09-17
Status: Implementation complete; landing PR

## Objective

Land Plugin Studio PR 1: adopt released **bb 0.43.1** and the published
**`@get-bb/plugin-sdk`**, including official `testing` / `testing/app` harness
resolution, as one ready GitHub pull request.

## Context

Tracker grouping (epic #21): merge #115 (done), then three implementation PRs.
This goal is only PR 1.

- Issues: #117 (compatibility) and #41 (official harness). Re-probe #43 in the
  same change; close it if native `bb plugin types/build/check` already works.
- Watcher #116 body is owned by the scheduled workflow; do not rewrite it.
- Daily desktop bb on this machine is already **0.43.1**
  (`/Applications/bb.app`, `~/.local/bin/bb`). Plugin Studio is path-installed
  from `plugins/studio` into the normal `~/.bb` profile.
- There is **no** separate `bb-dev` binary on this machine.
- Compatibility adoption must **not** use computer use against the daily app
  and must **not** upgrade or mutate `~/.bb`. Probe with an isolated
  `bb-app@0.43.1` prefix and a disposable `BB_DATA_DIR`.

## Scope

### In

- Isolated 0.43.1 prefix: declaration refresh, typecheck, build, plugin tests,
  disposable managed activation.
- Rename imports/resolution from `@bb/plugin-sdk` to `@get-bb/plugin-sdk`.
- Pin the SDK that ships with bb 0.43.1 (not npm `latest` if newer).
- Official harness resolution from a clean plugin install; keep Harness
  labeled behavioral, not visual authority.
- Update `compatibility/bb-target.json` after a successful isolated probe.
  Keep the min / verified-through split. Raise `minimumBbVersion` only if 0.36
  actually broke.
- Keep the workspace `bb-app` pin on the support floor; exercise 0.43.1 in the
  isolated verified-through lane.
- Docs/AGENTS that still say the testing package is unpublished.
- Re-probe native scaffold / types / check (#43).
- One branch off current `origin/main` (includes #115), one PR.
- `/local-review` JSON reports (standing + targeted) with no open P0–P2
  **before** opening the PR.
- Mark the PR ready, wait for CI and review feedback, fix findings, resolve
  every unresolved review thread, then **squash-merge**.

### Out

- Review loop (#70, #61, #60, #58).
- Reference plugin (#42, #46).
- Clean-room trial / RC (#65, #63, #64).
- Captures, guidance, collection manifest, registry/visual-style, #102.
- Computer use of `/Applications/bb.app`, Connect, publish, tag, merge.
- Editing `../bb`. Copying the harness. Secondary runtime.

## Source Of Truth

- `.bb/skills/update-plugin-studio-compatibility/SKILL.md` — probe and adopt
  procedure.
- GitHub #117, #41, #21 (PR grouping comment).
- `docs/compatibility-target.md` and `compatibility/bb-target.json`.
- `AGENTS.md` — native bb owns lifecycle; no private bb imports.

## Acceptance Criteria

- Isolated 0.43.1: `bb plugin types --check plugins/studio`, Studio build,
  Studio tests, and disposable managed activation succeed.
- `bun run compatibility:check` is green against the updated target.
- `bun run compatibility:latest --json` no longer reports 0.43.1 as unverified
  drift.
- Inspection reports `@get-bb/plugin-sdk` and resolves `testing` /
  `testing/app` from a clean plugin install when those deps exist.
- Harness is available only when those exports resolve; otherwise honest
  unavailable. Workbench must not hard-force `harness.available: false` once
  the package resolves.
- Local-review reports are `clean` (no open P0–P2) before `gh pr create`.
- PR is marked ready; exact-head CI green; all review threads resolved;
  squash-merged to `main`.
- No rewrite of #116 body. No publish, tag, or normal-profile mutation.

## Decisions

- Completion horizon is `merged`. User authorized merge on 2026-09-17.
- Pin SDK from the 0.43.1 release, not npm latest (`@get-bb/plugin-sdk` 0.4.99
  as of 2026-09-17 is not automatically the pin).
- Daily bb 0.43.1 is convenience context, not probe evidence. Isolated prefix
  is the authority.
- Work from a clean git worktree/branch off `origin/main`. Do not mix
  GitButler `gitbutler/workspace` dirt (visual snapshots, naming docs) into
  this PR unless they are required for the SDK rename.

## Risks

- Isolated probes already failed build, plugin tests, and managed activation
  (#116). This is investigation, not a hash bump.
- Path-installed Studio in `~/.bb` will pick up working-tree edits if the
  daily app reloads. Prefer an isolated worktree and do not reload the user's
  path plugin as part of this goal.
- Local `../bb` is stale and is not 0.43.1 evidence.
