# Changelog

bb Plugin Studio is an alpha. This changelog records reviewable candidates and public
prereleases; it does not imply a stable API or support promise.

## Unreleased

### Changed

- Adopt bb 0.43.1 as the minimum and verified-through host, pin
  `@get-bb/plugin-sdk@0.4.87` (the version shipped with that release, not npm
  latest), and resolve official `testing` / `testing/app` harness subpaths from
  a clean plugin install. Isolated bb 0.36.0 still typechecks and builds the
  Studio source, but it refuses a managed install that declares
  `engines.bbPluginSdk ^0.4.87`.
- Rename the product to **bb Plugin Studio** and its native bb surface to
  **Plugin Studio**.
- Rename the source repository to `galligan/bb-plugin-studio`; GitHub preserves
  redirects from the former repository URL.
- Keep `bb-mate`, `@bb-mate/*`, `bb-plugin-mate`, `mate`, the `workbench` route,
  the `plugin-workbench` skill ID, runtime artifact names, and plugin data paths
  stable so existing installs retain their state.

Historical release notes below retain the product names that were current when
those releases were recorded.

## 0.1.0-alpha.2 — public README refresh

### Changed

- Open the source repository under MIT with public contribution, support, issue,
  and private vulnerability-reporting paths.
- Rewrite the public documentation around plugin authors and clarify the
  boundary between native bb, `@bb/plugin-sdk`, and BB Mate.
- Add repository, homepage, and issue-tracker metadata to the next packaged CLI
  artifact.
- Publish a new package version so npm renders the public README. Runtime code,
  dependencies, and Fixture stories are unchanged from alpha.1.

## 0.1.0-alpha.1 — public npm alpha

### Changed

- Publish the CLI and deterministic 13-story Fixture lab as the unscoped
  `bb-mate` package under npm's `alpha` dist-tag.
- License BB Mate under MIT while keeping bundled third-party notices and
  licenses explicit.
- Publish from a private source repository; the repository was opened in a
  later documentation-only change.

### Known limitations

- Fixture is a deterministic approximation; Live bb remains the visual and
  integration authority.
- Harness remains unavailable until its upstream testing distribution and the
  BB Mate adapter are both usable.
- This prerelease supports Bun as its CLI runtime and carries no stable API or
  response-time SLA.
- npm's first-package bootstrap also points its mandatory `latest` tag at this
  only published version; install `bb-mate@alpha` to select the intended channel
  explicitly.

## 0.1.0-alpha.0 — private local candidate

### Added

- Actionable plugin discovery and compatibility inspection with bounded native
  bb evidence and explicit remediation.
- A thin `bb-mate` CLI for Fixture launch, inspection, native checking, and Live
  handoff without replacing bb build/install/dev ownership.
- A 13-surface public plugin UI catalog, deterministic fixtures, Ladle stories,
  the Mate launcher, visual regression, and accessibility coverage.
- A reproducible 40-file local archive, external-author guide, trust/support
  policies, compatibility drift checks, and a clean-room alpha trial.

### Changed

- Native bb 0.35.1 and plugin SDK metadata 0.4.1 are the recorded compatibility
  target.
- Source and packaged Fixture servers remain distinct: source provides bounded
  passive inspection; the package serves loopback-only static assets.

### Fixed

- Clean runners resolve native `bb plugin build` from the pinned `bb-app`
  dependency.
- Native handoffs consume bb re-exec selectors without losing the canonical bb
  selected for browser inspection.
- Clean-room process shutdown terminates wrapper and child servers and verifies
  their ports close.

### Known limitations

- Fixture is a deterministic approximation, not exact bb host rendering.
- Harness remains unavailable until the official SDK testing package is
  publicly consumable and BB Mate adds the upstream-backed adapter.
- A real frontend reference plugin, native scaffold/check adoption,
  multi-plugin collection manifest, sanctioned registry/style updates, and
  complete Live parity remain upstream-dependent work.
- The package is `private: true`, `UNLICENSED`, unpublished, and supported only
  as the exact private local artifact identified in the release handoff.
