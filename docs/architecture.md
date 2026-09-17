# Architecture

The runtime direction is governed by
[`docs/architecture/runtime-convergence.md`](architecture/runtime-convergence.md):
Plugin Studio converges onto bb-owned plugin lifecycle and storage, retains the
native in-process path for primary-host discovery, and ships enrolled remote-host
discovery behind the default-off `enrolledHostDiscovery` Studio feature flag.
Remote-only projects are outside the active Studio inventory while it is off.

## Repository boundary

bb Plugin Studio is downstream of [bb](https://github.com/get-bb/bb). Public plugin SDK
contracts and live bb behavior are authoritative. A contributor may use a local
upstream checkout for read-only comparison, but it is not part of this Bun
workspace and is never required to build or test bb Plugin Studio.

## Workbench

`apps/workbench` renders deterministic approximations of bb states in an ordinary browser. Its job is fast visual iteration, comparison, and discussion without booting the desktop app or manufacturing real repository state.

Fixtures should describe product state rather than mirror private bb database or React types. Adapters can translate those fixtures into components. This keeps prototypes stable when upstream internals change.

The workbench puts the bb surface directly in the viewport. Workbench controls
belong in the collapsible Studio overlay, not in a permanent wrapper around the
prototype. The overlay uses vendored shadcn/Base UI source and has its own dark
theme; bb-facing views use bb's typography, icon family, and measured semantic
tokens. The URL is the complete launcher-state contract for target, surface,
scenario, mode, theme, and viewport. The overlay emits copyable CLI handoffs;
it never owns a browser-triggered native command runner.

`SidebarListView` is the current host-neutral seam. The workbench supplies its
model from deterministic scenarios. A future plugin adapter can supply the same
model from `experimental_useSidebarThreads` and related public action hooks,
while bb continues to render the actual New Thread, search, navigation, and
footer chrome around the slot.

The Ladle surface lab is a second browser entrypoint over the same catalog and
fixtures. Each catalog surface has one static story group with bounded fixture,
theme, and viewport controls. Plugin components render through local fixture
adapters; host-rendered actions are input/outcome contracts, and content-script
lifecycle stories are inert. Ladle uses its own Vite configuration so ordinary
story discovery cannot activate the workbench inspection middleware.

## Upstream alignment

Exactness has two levels:

1. In standalone fixture mode, the live bb Connect client is the visual oracle.
   Measured tokens and screenshot comparisons keep the replica honest, but it is
   still a replica.
2. In live plugin mode, bb itself renders the host chrome and provides state
   through `@bb/plugin-sdk/app`. This is the production-exact surface and should
   be the final validation environment for plugin UI.

Stay attached to upstream through supported versioned boundaries:

- Every plugin declares honest `engines.bb` and `engines.bbPluginSdk` ranges.
- Plugin UI primitives are vendored through the bb component registry version
  that matches the target bb release. Use the shadcn CLI's `--dry-run` and
  `--diff` flow when updating; do not copy raw application files.
- Hugeicons and bb-facing type/token choices track the versions used by the
  target bb release.
- An optional local upstream checkout and installed bb client are read-only
  contract/visual references. Hashed desktop assets are never imported.

The compatibility target records the expected bb and plugin SDK releases and
checks public upstream metadata plus the measured token/registration surface for
drift.

## Runtime sources

The source control in the Studio overlay represents adapters, not a browser data
fetch:

- **Fixtures** are always available in `apps/workbench`.
- **Harness** remains unavailable in the launcher until an upstream-backed
  public testing adapter exists, even when inspection can resolve the official
  contract.
- **Live bb** becomes selectable only when native inspection proves the selected
  frontend plugin is installed and runnable. The browser then renders a
  handoff-only canvas; native bb remains the visual authority.

Do not proxy, scrape, or iframe an authenticated bb Connect session to simulate
live state. Even when a client can be displayed, cross-origin content is not a
state/action contract and cannot safely drive plugin behavior.

### Plugin inspection

The source workbench admits explicit, current-project, startup, or pinned roots
at server startup and passively discovers plugin manifests beneath those roots.
It persists a private source catalog and exposes only opaque 32-character target
IDs plus allowlisted display metadata to the browser. The URL accepts only
`?target=<opaque-id>`; duplicate, legacy, and unknown query keys fail closed.
Browser input is never interpreted as a filesystem path, and installed plugin
inventory never seeds source candidates.

The schema-v2 session endpoint is a read-only Fixture adapter. A request reads
only the already-prepared public catalog projection: it does not run `bb`, query
Connect or npm, inspect build metadata, execute a target, or refresh native
state. Persisted native status may be summarized as informational evidence, but
Harness, Live, and terminal handoffs remain unavailable. The dev-only endpoint
is constrained to the actual loopback listener with exact Host and present
Origin checks; the authenticated runtime/browser bootstrap belongs to #70.

The official SDK frontend collector currently exposes these registration
groups, which define the eventual surface inventory:

- homepage and settings sections
- navigation panels and thread-panel actions
- composer customizations and pending interactions
- sidebar footer actions and thread-list replacements
- thread-header actions and file openers
- message directives and message actions
- trusted content scripts

Component registrations can receive deterministic behavior through
`loadPluginApp` and `renderSlot`. Content scripts require the explicit
`mountPluginContentScripts` lifecycle and must never be mounted during ordinary
discovery. Host-rendered actions still require live bb for their real chrome.

Until an official testing package and upstream-backed adapter are both usable,
the launcher exposes Harness as unavailable. Inspection may independently say
that the official contract resolves; that is contract readiness, not a rendered
Harness preview. The sibling checkout is not a fallback dependency.
[get-bb/bb#1134](https://github.com/get-bb/bb/issues/1134) is the upstream
publication tracker.

Scaffold dependency installation remains native bb behavior. bb Plugin Studio does not
repair generated packages after the fact;
[get-bb/bb#1133](https://github.com/get-bb/bb/issues/1133) and draft
[PR #1135](https://github.com/get-bb/bb/pull/1135) own that fix.

## Plugins

`plugins/studio` is the Studio-owned integration package. It proves the live bb,
packaging, and visual boundaries used by this repository without making Plugin
Studio the home of independently distributed plugins.

Plugin UI can share host-neutral components with the workbench once a second consumer proves the boundary. Code that imports `@bb/plugin-sdk/app` stays inside the plugin adapter or entrypoint because that runtime only exists inside bb.

## Distribution

[bb-plugins](https://github.com/galligan/bb-plugins) owns independently
versioned, distributable plugins and their release lifecycle. Plugin Studio can
inspect those packages from an explicit local path, but it does not depend on
that sibling checkout. The Studio plugin is packaged only as part of Plugin
Studio's own integration workflow.
