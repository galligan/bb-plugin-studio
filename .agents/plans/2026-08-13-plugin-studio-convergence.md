# Plugin Studio identity, runtime, and compatibility convergence

Date: 2026-08-13
Status: Native convergence landed on `main`; enrolled-host discovery deferred
Parent: [#21](https://github.com/galligan/bb-plugin-studio/issues/21)

## Outcome

Finish the transition from the original Mate implementation to a native bb
Plugin Studio:

- maintained technical identities converge on `bb-plugin-studio` terminology;
- the owner-approved removal of the unhealthy legacy `mate` installation is
  followed by one clean canonical `studio` installation;
- primary-host discovery no longer requires a packaged child runtime or private
  loopback API;
- enrolled-host discovery is explicitly feature-gated off and outside the
  current product scope; and
- compatibility promises a minimum bb version while newer releases remain
  usable and auditable.

## Final verified state

- The GitHub repository is `galligan/bb-plugin-studio`; the old repository URL
  redirects correctly.
- Maintained package, CLI, workspace, source, plugin, skill, workflow, and
  current documentation identities use Plugin Studio terminology. Old names
  remain only in explicit negative sentinels and truthful historical evidence.
- The owner authorized removal of the unhealthy legacy `mate` registration.
  Its residual data was moved recoverably to Trash without inspecting values,
  secrets, or payloads. The canonical `studio` path plugin is installed,
  enabled, running, and source-correct on bb 0.37.
- Primary-host discovery runs in the Studio plugin process through strict
  schema v4, and its catalog persists through bb-owned SQLite storage.
- The final package contains no secondary executable, private HTTP/listener,
  child supervision, runtime stamp, or standalone-runtime machinery.
- bb's current routed file listing is not a safe substitute for the hardened
  scanner on enrolled hosts because traversal work is not bounded before
  result truncation.
- Compatibility separately enforces minimum bb 0.36.0 and verified-through bb
  0.37.0, while newer compatible releases produce a nonfatal audit notice.
- PRs #108, #109, #110, #113, and #114 landed bottom-to-top on `main`; exact
  post-merge CI and compatibility checks are green. Nothing has been published.

## Work graph

### Technical identity migration

- [x] [#86](https://github.com/galligan/bb-plugin-studio/issues/86) — completed
- [x] [#94](https://github.com/galligan/bb-plugin-studio/issues/94) — superseded
      by the owner-approved legacy removal and clean canonical install
- [x] [#95](https://github.com/galligan/bb-plugin-studio/issues/95) — landed in
      PR #108

Historical release evidence and Git history retain truthful old names. Current
old-name exceptions must be isolated to a compatibility manifest/module and
retired under a versioned policy.

### Native-runtime convergence

- [x] [#96](https://github.com/galligan/bb-plugin-studio/issues/96) — completed
- [x] [#98](https://github.com/galligan/bb-plugin-studio/issues/98) — runtime
      boundary ADR and live schema inventory
- [x] [#99](https://github.com/galligan/bb-plugin-studio/issues/99) — landed in
      PR #113 with one shared controller and no production child path
- [x] [#100](https://github.com/galligan/bb-plugin-studio/issues/100) — landed
      in PR #110 with bb-owned catalog storage
- [x] [#101](https://github.com/galligan/bb-plugin-studio/issues/101) — landed
      in PR #114; removed supervision, private HTTP/auth, and packaged runtime
- [ ] [#102](https://github.com/galligan/bb-plugin-studio/issues/102) — deferred
      future proposal; `enrolledHostDiscovery` ships off

The native critical path #98 → (#99 and #100) → #101 is complete. #102 is not
scheduled for the current Plugin Studio scope and does not block primary-host
use or sharing.

### Compatibility and scanner hardening

- [x] [#93](https://github.com/galligan/bb-plugin-studio/issues/93) — minimum
      `0.36.0`, separately tracked verified-through `0.37.0`, and a nonfatal
      newer-than-verified result
- [x] [#97](https://github.com/galligan/bb-plugin-studio/issues/97) — landed in
      PR #109 with bounded enumeration and measured pathological-tree proof

Required PR CI uses immutable exact minimum and exact verified-through lanes.
Mutable npm latest runs on a scheduled, non-required audit lane that opens or
updates one deduplicated drift issue.

## Migration rules

- The explicit owner decision to remove the broken legacy `mate` installation
  supersedes the earlier preserve-state requirement for that one installation.
- Do not read, copy, log, or directly edit host-owned secrets or databases.
- Preserve target IDs, revisions, scopes, retirements, relevant history, routes,
  skills, deep links, and rollback through the identity/storage migration.
- Do not replace the hardened scanner with `bb.sdk.files.listPaths`.
- Never use hidden terminals or arbitrary command execution as a filesystem
  compatibility layer.
- No private bb imports.
- No npm publication, release, upstream PR, primary-profile destructive
  migration, or compatibility-alias retirement without separate authority.

## Verification

Each implementation issue owns focused tests and must also preserve the
appropriate exact-minimum/current-bb typecheck, build, visual/axe, migration,
clean-room, package inspection, live Plugin Studio, path-non-disclosure, and
rollback gates. Hosted CI must be green before a PR leaves draft.
