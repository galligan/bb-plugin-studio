# Execution Retro: PR 1 adopt bb 0.43.1

Date started: 2026-09-17
Date finalized: pending
Status: Local gates green; local-review next then PR
Spec: `.agents/goals/2026-09-17-pr1-adopt-bb-0431/SPEC.md`
Goal: `.agents/goals/2026-09-17-pr1-adopt-bb-0431/GOAL.md`
Prompt: `.agents/goals/2026-09-17-pr1-adopt-bb-0431/PROMPT.md`
Refs: `.agents/goals/2026-09-17-pr1-adopt-bb-0431/REFS.md`

## Summary

- Objective: Land PR 1 (bb 0.43.1 + `@get-bb/plugin-sdk@0.4.87` + official harness resolution), local-review before PR, squash-merge after CI and resolved threads.
- Completion horizon: `merged`
- Authority used: commit/push/PR/merge authorized; no publish/tag/`~/.bb`/daily bb UI/`../bb`
- Outcome: pending merge
- Tracker/PR/source-control state: worktree `feat/plugin-studio/adopt-bb-0431` off `f566649` (`origin/main` + #115)
- Remaining risks: hosted CI; GitHub review threads; #41 adapter execution beyond resolution is out of this slice

## Goal Amendments

| Time       | Change                                                                                    | Reason                          | Approved By |
| ---------- | ----------------------------------------------------------------------------------------- | ------------------------------- | ----------- |
| 2026-09-17 | Horizon `ready-pr` → `merged`; local-review before PR; wait/fix threads then squash-merge | User authorized kickoff + merge | user        |
| 2026-09-17 | Raise minimum and workspace `bb-app` pin 0.36.0 → 0.43.1                                  | 0.36 managed install 422        | probe       |

## Isolation recipe (stop-rule proof)

Prefix `/tmp/bb-isolated-0431-gDk3Jp`. Direct `bb` / `bb-app` calls use:

- `HOME=$PREFIX/profile/home`
- `BB_DATA_DIR=$PREFIX/profile/bb-data`
- loopback 49286/49287
- unset `BB_CLI` and `BB_CLI_REEXEC`

Daily identity files unchanged through probes:

- `/Users/mg/.bb/auth.json` mtime=1786023055.678 size=148
- `/Users/mg/.bb/host-id` mtime=1786023055.677 size=16
- `/Users/mg/.bb/env.json` mtime=1789394164.882 size=60

Daily `bb.db` WAL churn is the live 38886 server, not this prefix.

## Execution Log

```text
2026-09-17 - Isolated 0.43.1 + adoption
- Changed: @get-bb/plugin-sdk 0.4.87; deleted vendored types/; compatibility target 0.43.1; harness resolution; docs
- Probe: 0.43.1 types --check, plugin tests, plugin build, managed package:test all pass
- Probe: 0.36 managed install refused engines.bbPluginSdk ^0.4.87 (running 0.4.1) → raised floor
- Verified: compatibility:check pass; compatibility:latest current; format/check/test/build pass
- Next: local-review JSON, draft PR, CI, threads, squash-merge
```

## Review Log

| Round | Scope                          | Report                      | Score   | State   | Open P0-P2 | Notes           |
| ----- | ------------------------------ | --------------------------- | ------- | ------- | ---------- | --------------- |
| 1     | standing                       | tmp/reviews/standing/1.json | pending | pending | pending    | write before PR |
| 1     | targeted SDK/inspection/compat | tmp/reviews/targeted/1.json | pending | pending | pending    | write before PR |

## Verification Log

| Check                                    | Scope                          | Result    | Notes                           |
| ---------------------------------------- | ------------------------------ | --------- | ------------------------------- |
| isolated `bb --version`                  | `/tmp/bb-isolated-0431-gDk3Jp` | 0.43.1    | HOME+BB_DATA_DIR isolated       |
| `bb plugin types --check plugins/studio` | isolated 0.43.1                | pass      | pin 0.4.87, host 0.4.87         |
| `bun test src` in plugins/studio         | Studio                         | 75 pass   |                                 |
| `bb plugin build plugins/studio`         | isolated 0.43.1                | pass      | builtWith 0.43.1 / 0.4.87       |
| `bun run plugin-studio:package:test`     | 0.43.1 workspace pin           | pass      | managed npm + disable footprint |
| 0.36 managed install                     | isolated 0.36                  | fail 422  | raised minimum                  |
| `bun run compatibility:check`            | repo                           | pass      | desktop-v0.43.1                 |
| `bun run compatibility:latest --json`    | repo                           | current   | latest 0.43.1                   |
| `format:check && check && test && build` | repo                           | pass      |                                 |
| daily `~/.bb` identity files             | forbidden                      | unchanged |                                 |

## Tracker / PR Log

| Item | State      | Notes                                                           |
| ---- | ---------- | --------------------------------------------------------------- |
| #115 | merged     | `f566649` on origin/main                                        |
| #117 | open       | this PR                                                         |
| #41  | open       | harness resolution in this PR                                   |
| #43  | open       | re-probe: native types/build already work; CLI wrap not this PR |
| #116 | open       | watcher; do not rewrite body                                    |
| PR 1 | not opened |                                                                 |

## Follow-Ups

- Catalog 12 new 0.43.1 frontend registration groups (PR 2 / review loop).
- #43 remaining: wrap/document native scaffold/check in Studio CLI if still wanted after re-probe.
- After merge: user may reload path-installed Studio in daily bb.

## Forbidden-action audit

- No `~/.bb` mutation (identity files unchanged).
- No `/Applications/bb.app` upgrade or computer use.
- No `../bb` edits; no copied harness; no secondary runtime.
- No #116 body rewrite; no publish/tag.
