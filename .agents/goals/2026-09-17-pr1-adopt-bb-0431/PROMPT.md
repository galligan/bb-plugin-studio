/goal From `/Users/mg/Developer/bb/plugin-studio`, execute `.agents/goals/2026-09-17-pr1-adopt-bb-0431/` to `merged`.

## Read First

- `AGENTS.md`; `.bb/skills/update-plugin-studio-compatibility/SKILL.md`; packet `SPEC.md`, `GOAL.md`, `REFS.md`
- `/Users/mg/.claude/skills/local-review/SKILL.md` before opening a PR
- GitHub #117, #41; `origin/main` includes merged #115

## Objective

Adopt bb 0.43.1 and `@get-bb/plugin-sdk` (`testing` / `testing/app`) as PR 1. Close #117 and #41. Re-probe #43. Local-review before the PR; mark ready; fix all review feedback; resolve every thread; squash-merge.

## Authority

Branch `feat/plugin-studio/adopt-bb-0431` from `origin/main`. Open PR only after local-review JSON is `clean`. Draft then ready. Squash-merge after green exact-head CI and zero unresolved threads. User authorized every review thread. Must not publish, tag, mutate `~/.bb`, computer-use `/Applications/bb.app`, or edit `../bb`.

## Boundary

In: isolated 0.43.1 probes, SDK rename, harness resolution, compatibility target, #43 re-probe, unpublished-testing docs. Out: review loop, reference plugin, trial/RC, #102, live annotation, `../bb`, #116 body, GitButler snapshot dirt, daily bb profile.

## Sequence

1. Clean worktree off `origin/main`; leave `gitbutler/workspace` dirt alone.
2. Exact `bb-app@0.43.1` in `mktemp` plus disposable `BB_DATA_DIR`; record probe failures before editing hashes.
3. Pin the SDK that ships with 0.43.1 (not npm latest); refresh declarations via that bb; harness resolves from a clean install.
4. Standing + targeted `/local-review` JSON under `.agents/goals/2026-09-17-pr1-adopt-bb-0431/tmp/reviews/`. Fix P0-P2 before `gh pr create`.
5. Draft PR for #117/#41; mark ready; wait for CI and comments; fix; resolve threads; squash-merge; confirm `MERGED`.

## Loop

Execute on the isolated prefix; record in `RETRO.md`; advance only when the gate is green. After ready: poll CI then review threads; merge only when threads are resolved.

## Hard Rules

Daily bb is not probe evidence. Do not computer-use it or reload path-installed Studio into `~/.bb`. Do not drop `minimumBbVersion` 0.36.0 unless isolated 0.36 fails. Do not import `../bb`, copy the harness, or revive a secondary runtime. Harness is behavioral, not visual authority; do not hard-force `harness.available: false` after the package resolves.

## Stop Rules

Isolated `bb-app@0.43.1` cannot be installed; would mutate `~/.bb`, rewrite #116, or publish; three failed approaches; merge blocked by a required human review the agent cannot satisfy.

## Definition Of Done

Isolated 0.43.1 types/build/test/managed activation pass; target verified through 0.43.1; `compatibility:latest --json` no longer flags 0.43.1 as unverified drift; testing subpaths resolve from a clean install; local-review clean before PR create; PR squash-merged onto `origin/main`; unresolved threads = 0.

## Verification

Isolated `bb plugin types --check plugins/studio`, Studio build, tests, disposable managed activation. `bun run compatibility:check`; `bun run compatibility:latest --json`; `bun run format:check && bun run check && bun run test && bun run build`. Local-review JSON `state: clean`, open P0-P2 = 0. `gh pr view` exact-head checks SUCCESS, `state: MERGED`.

## Evidence Contract

Isolated bb version, SDK pin, hashes, activation, local-review paths, PR URL, merge SHA, hosted checks, #43 re-probe, forbidden-action audit in `RETRO.md`.

## Next Move

Smallest public-contract fix on the isolated prefix. Three stalls → stop. Do not start PR 2.

## Not Done

Local-only diffs, unmerged PR, open local-review P0-P2, unresolved GitHub threads, Harness still forced unavailable, #116 rewritten, daily profile mutated.

## Persistence

Resume from this packet and `RETRO.md`. Poll CI every 60s; after ready poll review threads every 2–5 minutes until merge.

Keep going until the definition of done is satisfied unless a stop rule fires.
