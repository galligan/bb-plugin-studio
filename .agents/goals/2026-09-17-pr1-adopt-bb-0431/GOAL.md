# Goal Execution Contract: PR 1 adopt bb 0.43.1

Date: 2026-09-17
Status: Implementation complete; landing PR
Spec: `.agents/goals/2026-09-17-pr1-adopt-bb-0431/SPEC.md`
Prompt: `.agents/goals/2026-09-17-pr1-adopt-bb-0431/PROMPT.md`
Retro: `.agents/goals/2026-09-17-pr1-adopt-bb-0431/RETRO.md`
Refs: `.agents/goals/2026-09-17-pr1-adopt-bb-0431/REFS.md`

## Completion Horizon

`merged`

Complete when:

- One PR from `origin/main` (post-#115) adopts bb 0.43.1 and
  `@get-bb/plugin-sdk`, including official harness resolution.
- Standing and targeted `/local-review` JSON reports are `clean` (no open
  P0–P2) **before** the PR is opened.
- Isolated 0.43.1 probes, repo checks, and exact-head hosted CI are green.
- The PR is marked ready, all unresolved GitHub review threads are addressed
  and resolved, and the PR is **squash-merged** into `main`.
- `origin/main` contains the merge commit.

Not complete when:

- Work is only local, the PR is draft, CI is on a stale SHA, Harness is still
  hard-forced unavailable after the package resolves, #116 body was rewritten,
  daily `~/.bb` was mutated, local-review still has open P0–P2, review threads
  remain unresolved, or merge was skipped.

## Authority

- May commit: yes, on one focused branch off `origin/main`.
- May push: yes, `-u` to origin.
- May open PR: yes, only after local-review is clean; start draft, then ready.
- May mark ready: yes, after exact-head CI green and P0–P2 review findings
  fixed.
- May merge: yes, squash-merge after CI green and every unresolved review
  thread is addressed. Match repo default (squash; no merge commits).
- May publish/release: no.
- May comment on #117/#41/#21/#43; may close #43 only if the re-probe proves
  native types/build/check already work. Close #117/#41 when the PR merges if
  the issues are fully satisfied.
- Needs user approval for: publish, tag, upgrading `/Applications/bb.app` or
  mutating `~/.bb`, computer use of the daily bb UI, editing `../bb`.

## Boundary

- In scope: SDK rename, compatibility target, inspection harness resolution,
  isolated 0.43.1 probes, Studio plugin types/build/test, docs that claim the
  testing package is unpublished, #43 re-probe, one PR.
- Out of scope: review loop, reference plugin, trial/RC, #102, live annotation.
- Do not touch: `../bb`; GitButler snapshot dirt unless required; #116 issue
  body; normal bb profile; Connect; npm publish.

## Topology

Single-agent direct execution, with optional delegated research/review. Prefer
a dedicated git worktree so the user's path-installed Studio in `~/.bb` does
not hot-reload half-broken SDK imports.

Branch: `feat/plugin-studio/adopt-bb-0431` from current `origin/main`.

## Steps

1. Orient on `origin/main` after #115
   - Outcome: clean worktree; dirty `gitbutler/workspace` files left alone.
   - Scope: fetch, branch, confirm base SHA.
   - Gate: `git status` on the worktree has no unrelated snapshots.

2. Isolated 0.43.1 probe
   - Outcome: exact `bb-app@0.43.1` in `mktemp`; disposable `BB_DATA_DIR`;
     record failing probes before changing hashes.
   - Scope: follow `.bb/skills/update-plugin-studio-compatibility/SKILL.md`.
   - Gate: prefix `bb --version` is 0.43.1; inventory is builtins-only;
     Connect unpaired.

3. Minimum adoption
   - Outcome: `@get-bb/plugin-sdk` imports/engines/inspection; declarations
     via released bb; SDK pin from the 0.43.1 release; harness resolves
     `testing` and `testing/app` from a clean install.
   - Scope: #117 + #41; #43 re-probe.
   - Gate: isolated types/build/test/managed activation; `compatibility:check`;
     `compatibility:latest --json` no longer treats 0.43.1 as unverified drift.

4. Local review, then PR, then merge
   - Outcome: `/local-review` JSON under
     `.agents/goals/2026-09-17-pr1-adopt-bb-0431/tmp/reviews/` is clean;
     draft PR; mark ready; wait for CI and review comments; fix and resolve
     threads; squash-merge.
   - Scope: link #117 and #41; do not open the PR until local-review has no
     open P0–P2.
   - Gate: exact-head CI green; unresolved thread count 0; PR `MERGED`;
     `origin/main` updated.

## Reviews

Standing local-review plus one targeted pass on SDK/inspection/compatibility
files. Fix P0–P2 before marking ready. Record JSON under
`.agents/goals/2026-09-17-pr1-adopt-bb-0431/tmp/reviews/` when the
`local-review` skill is available; otherwise record a written review summary
in `RETRO.md`.

## Evidence Contract

- Isolated prefix path, bb version, SDK version shipped with 0.43.1, registry
  digest, declaration hashes, managed-activation result.
- Commands and pass/fail for compatibility check/latest, types, build, test.
- PR URL, head SHA, hosted check rollup.
- #43 re-probe result.
- Forbidden-action audit: no `~/.bb` mutation, no #116 rewrite, no merge.

## Verification

- Isolated `BB_CLI`: `bb plugin types --check plugins/studio`
- Isolated Studio build and plugin tests
- Disposable managed activation
- `bun run compatibility:check`
- `bun run compatibility:latest --json`
- `bun run format:check && bun run check && bun run test && bun run build`
- Visual tests if SDK/UI types change rendered fixtures
- Hosted CI on exact PR head

Prompt/goal alignment: `PROMPT.md` must name the sequence, isolated-probe
rule, commands, hard rules, stop rules, done/not-done, and resume surface.

## Next Move

- If a check fails: keep the isolated prefix; fix the smallest public-contract
  change; do not drop 0.36 speculatively.
- If progress stalls: three failed approaches → record in `RETRO.md` and stop
  for coordinator/user.
- If scope is unclear: stay inside #117/#41; do not start the review loop.

## Waiting State

- Waiting on: hosted GitHub CI, then review comments/threads after ready.
- How to check: `gh pr view <n> --json statusCheckRollup,headRefOid,reviewDecision,state`;
  `gh api repos/galligan/bb-plugin-studio/pulls/<n>/comments`; GraphQL review
  threads `isResolved`.
- Heartbeat cadence: 60s while checks run; after ready, poll review threads
  every 2–5 minutes until resolved or 30 minutes idle with green CI and no
  new comments, then merge.
- Continue when: required checks SUCCESS on current head; no unresolved
  threads; then squash-merge.
- Stop when: required check fails twice on the same head with no new
  hypothesis, or merge is blocked by required reviews the agent cannot satisfy.
- Last checked: 2026-09-17 local gates green; PR not opened yet

## Persistence

Resume from this packet, `RETRO.md`, the PR, and #117. Do not reconstruct
from chat. Heartbeat only for CI and blockers.

## Amendments

`GOAL.md` may be amended when probe reality changes (for example 0.36 no
longer builds). Record in `RETRO.md`. Horizon is `merged` (user, 2026-09-17);
do not widen to publish/release without approval.

| Time       | Change | Reason | Approved By |
| ---------- | ------ | ------ | ----------- |
| 2026-09-17 | Raise `minimumBbVersion` and workspace `bb-app` pin from 0.36.0 to 0.43.1 | Isolated 0.36 managed install returned HTTP 422: Studio requires SDK `^0.4.87`, running SDK is 0.4.1. SDK 0.4.87 first ships in bb 0.43.1. | probe evidence (GOAL allows this amendment) |

## Stop Rules

- Stop rather than mutate `~/.bb`, upgrade `/Applications/bb.app`, or
  computer-use the daily bb UI.
- Stop rather than edit `../bb`, copy the harness, or revive a secondary
  runtime.
- Stop rather than rewrite #116's body.
- Stop rather than publish or tag. Merge is authorized (squash only).
- Stop if the isolated 0.43.1 prefix cannot be installed or authenticated npm
  access is required and missing.
