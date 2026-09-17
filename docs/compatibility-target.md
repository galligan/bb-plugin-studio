# bb Plugin Studio compatibility target

`compatibility/bb-target.json` is the reviewable record of bb Plugin Studio's
host support policy, public bb contracts, and deliberately measured fixture
values. The check is an alarm, not an updater.

The policy separates three values:

- `minimumBbVersion` is the oldest promised host (`0.43.1`). A lower observed
  version fails as unsupported.
- `verifiedThroughBbVersion` is the newest immutable release fully audited
  (`0.43.1`). Versions from the minimum through this boundary pass.
- the observed version comes from the selected native `bb` executable. A newer
  version emits a nonfatal `notice`; its presence alone never makes an ordinary
  repository check fail.

`plugins/studio/package.json` expresses the same open-ended host floor as
`engines.bb: ">=0.43.1"`. The SDK contract remains independent in
`engines.bbPluginSdk`.

```sh
bun run compatibility:check
bun run compatibility:check --json
bun run compatibility:latest --json
```

The check reads local manifests, the surface catalog, and the small named token
set; executes only `bb --version`; and fetches immutable public artifacts from
the verified-through bb release tag. It hashes the complete public theme,
component registry, backend SDK declaration bundle, and app SDK declaration
bundle. Declaration hashes are checked even when the SDK package version is
unchanged. `BB_CLI` wins when set, then `bb` on `PATH`, then
the workspace's pinned `bb-app` binary so clean CI observes the same release
used for plugin builds. It does not load plugin code, contact Connect, or use
the sibling bb checkout. A failed network or native probe is `unverified` and
fails the command rather than silently passing.

The target is validated before any network request. Guard lists must be
non-empty and unique. Git artifact URLs must be exact immutable paths on
`raw.githubusercontent.com/get-bb/bb`. SDK declaration URLs may use that git
form or the version-pinned published package on `unpkg.com/@get-bb/plugin-sdk@<version>`.
Redirects are rejected.

`compatibility:latest` compares the verified-through boundary with npm's stable
`bb-app` release. It exits 0 when current, 10 when a newer release is
available, and 1 for an invalid or unverified state. It never edits the target
or upgrades bb. The scheduled compatibility watch uses that result to maintain
one deduplicated GitHub issue.

The required `BB compatibility` workflow reads both boundary versions from the
manifest, installs each exact CLI in isolation, regenerates declarations, then
typechecks, builds, and tests the Studio plugin. The scheduled watch is separate
from pull-request CI. For a newer npm release it projects only immutable probe
URLs to that release (without accepting new hashes), runs the same declaration,
typecheck, build, and test probes, and exercises managed activation in a
disposable profile. Drift updates an issue; it cannot turn an unrelated pull
request red.

For a one-off candidate audit:

```sh
BB_CLI=/absolute/path/to/candidate-bb \
  bun run compatibility:check --candidate-version 0.38.0 --json
```

Candidate projection preserves the committed hashes, so changed declarations,
registry data, or theme CSS remain actionable failures rather than being
silently accepted.

## Verified 0.43.1 evidence

The `0.43.1` audit recorded:

- plugin SDK package `@get-bb/plugin-sdk@0.4.87` (the version shipped with the
  desktop tag, not npm latest);
- backend source contract
  `ddab6fbf2cdf31e2986ee7f6bf6ef4883af956e6391973f02cf3e6c46be6cb4d`;
- app source contract
  `c9379f666852c95654c63641aebcc46a4b596f13aa1d8090b95414e00ac85aab`;
- theme CSS `5505d0036def8e9c485634f7a5b59b1087d9e71ecdbce48c563dc9dc0756b81b`;
- component registry
  `c1148ddb7da06da32e3e35bf9398dd4989253719b37b44276f6daf48408b6eb6` with new
  items `icon-extended` and `icon-registry`;
- `--bb-sidebar-row-height` still `1.75rem` and coarse `2.5rem`;
  `--bb-sidebar-width` remains a live-only measurement.
- new public frontend registration groups exist on 0.43.1 and are recorded as
  uncataloged in the coverage test; cataloging them is out of scope for this
  compatibility adoption.

bb 0.43.1 no longer commits `packages/plugin-sdk/bundled-types/` on the git tag.
The compatibility target therefore hashes the public source contracts
(`backend-contract.ts`, `app-contract.ts`) that remain on `desktop-v0.43.1`.
Native `bb plugin types` still generates from the published npm bundled-types.

## Verified 0.37.0 evidence

The `0.37.0` audit recorded:

- component registry digest and item inventory unchanged from `0.36.0`;
- the tracked sidebar row-height tokens unchanged;
- the complete theme changed (`8fc5264c…` to `c2ed653f…`);
- backend SDK declarations changed (`5c7c8349…` to `92ed82ff…`) while the
  package version remained `0.4.1`;
- app SDK declarations unchanged (`984e0539…`).

The committed manifest contains the full verified-through hashes. The shortened
values above are for human comparison only.

## Updating the target

1. Read every failed check and its next action. Do not update values merely to
   make CI green.
2. Inspect the public diff between the old and proposed verified-through refs.
   Review registry item and digest changes together. Review backend and app
   declaration hashes independently, even if `@get-bb/plugin-sdk` has the same
   version. Reconcile SDK and registration changes with the public surface
   catalog first.
3. Run the full repository gate against the proposed values.
4. Open live bb at the proposed version and manually compare the representative
   sidebar and composer fixtures at their recorded viewport. Confirm row
   heights, sidebar geometry, typography, theme colors, focus treatment, and
   host-owned versus plugin-owned boundaries. Live bb is the visual authority;
   a green fixture check is not parity proof.
5. Record the live comparison and rationale in the pull request. Update only
   `compatibility/bb-target.json` and code genuinely required by the public
   contract. Raising the verified-through boundary does not automatically raise
   the minimum version.

The workspace `plugins/studio` `bb-app` pin stays on `minimumBbVersion`. It makes
the ordinary build and package lifecycle a continuous floor check. The required
verified-through lane and the scheduled candidate audit install their exact bb
versions in isolation; the candidate package probe supplies that exact version
to the strict metadata inspector through
`BB_PLUGIN_STUDIO_EXPECTED_BB_VERSION`. This override changes the expected build
stamp only. It does not relax the engine range or any package-integrity check.

The local Inter range intentionally differs from the targeted bb app range.
Both values are recorded so either change is visible instead of being silently
normalized.

## Explicit temporary decisions

Default CI has no skip. A time-bounded exception must be a committed Markdown
record under `compatibility/decisions/` containing all four fields:

```md
# Compatibility Decision

Status: accepted
Owner: owner name
Reason: concrete bounded rationale
Expires: YYYY-MM-DD
```

Record that same repository-relative path as `acceptedDecision` in
`compatibility/bb-target.json`, then run
`bun run compatibility:check --decision compatibility/decisions/<record.md>`.
External paths, symlinks, missing fields, invalid dates, dates more than 90 days
away, and command-line-only explanations are rejected. Unverified network or
native probes can never be waived. For an accepted contract mismatch, the
report stays `accepted-drift`, lists every mismatch, and must not be described
as a clean compatibility pass.
