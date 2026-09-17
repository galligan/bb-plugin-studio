# ADR: Converge Plugin Studio onto the bb plugin runtime

- Status: Accepted for incremental implementation
- Date: 2026-08-13
- Decision owner: [#98](https://github.com/galligan/bb-plugin-studio/issues/98)
- Parent program: [#96](https://github.com/galligan/bb-plugin-studio/issues/96)

## Decision

Plugin Studio will run as a normal bb plugin and will not ship or start a
secondary runtime process by default.

Primary-host development-source discovery, target reconciliation, persistence,
frontend RPC, lifecycle, CLI, agent tools, and browser-facing plugin surfaces
will move into `plugins/studio` and use only public bb plugin contracts. The
existing inspection kernel remains the source of discovery policy; it moves
in-process rather than being rewritten.

The in-process path is authoritative for primary-host discovery after
[#99](https://github.com/galligan/bb-plugin-studio/issues/99) and
[#100](https://github.com/galligan/bb-plugin-studio/issues/100). The child
runtime source and package were removed under
[#101](https://github.com/galligan/bb-plugin-studio/issues/101). Enrolled
remote-host discovery is deferred future scope behind the default-off
`STUDIO_FEATURE_FLAGS.enrolledHostDiscovery` flag. While disabled, remote-only
projects are omitted from Studio's active inventory and never make healthy
primary-host inventory partial. Mixed or ambiguous declarations still fail
closed. [#102](https://github.com/galligan/bb-plugin-studio/issues/102)
preserves the bounded public-contract proposal but is not part of the current
Plugin Studio scope.

While this ADR is active, do not add another private runtime route, capability,
principal, object kind, packaging obligation, or protocol version. A new
secondary-runtime responsibility requires a documented public bb capability
gap and an exit condition.

## Why

The current process boundary duplicates facilities bb already provides and
does not create a sandbox. bb plugins and their build/runtime code are full-trust
local programs. Keeping a second executable therefore adds artifact integrity,
handshake, bearer-token, listener, database, shutdown, and compatibility work
without reducing the trust granted to the plugin.

bb 0.36 already publishes the contracts needed for the primary-host path, and
an exact published 0.37 probe confirms those contracts remain public. The
pinned 0.36 declarations are in `plugins/studio/types/bb-plugin-sdk.d.ts`; current
upstream public sources live in `packages/plugin-sdk`, `packages/sdk`, and
`apps/host-daemon` in the bb repository, but the moving checkout is reference
material rather than 0.37 release evidence. The clean-room runtime evidence for
0.36 is recorded in
[`docs/plugin-studio-capabilities.md`](../plugin-studio-capabilities.md).
No implementation may import private bb application modules.

The 2026-08-13 0.37 probe installed the immutable published `bb-app@0.37.0`
artifact (npm integrity
`sha512-7RD6YepT0FvnhY05KOgN85qfjXHPuPxWp5vsGTX1oUX1KpkTAI7oZ/RMAyWHc7BO/VklJgcflAVaqUl1ogH0pQ==`)
into a temporary prefix and ran its `bb plugin types` against a disposable copy
of the Studio manifest and entrypoints. The generated backend declaration SHA-256
was `92ed82ff874280ab0c239e11669da3ed040b800aa1e8dd59cdf9c617dafcaccb`;
the app declaration SHA-256 was
`984e0539c6926d42ddaf666c6b6890a567d08f711d9ae73a9b986620230eed9a`.
The generated backend declaration contains the mapped `BbPluginApi`,
`PluginStorage`, `PluginRpc`, `PluginRealtime`, `PluginBackground`, `PluginCli`,
`PluginAgents`, `FilesArea`, `ProjectsArea`, and `SystemArea` contracts. The
temporary prefix was removed after the read-only probe. This exact artifact,
not the nightly source checkout, is the 0.37 contract evidence for this ADR.

## Current topology and callers

```text
bb plugin backend (`plugins/studio/src/backend/plugin.ts`)
  -> project inventory (`project-adapter.ts` -> bb.sdk.system/projects)
  -> shared project-target controller
       -> bounded inspection kernel
       -> development-target catalog on `bb.storage.database()`
  -> bb.rpc status/refresh -> plugin frontend

browser-only source workbench (development only)
  -> `apps/workbench/server/development-target-adapter.ts`
  -> inspection kernel + development-target catalog directly
  -> static schema-v2 session projection
```

The shipped Studio flow calls the target domain directly:

- `plugin.ts` admits only one unambiguous primary-host `local_path` source per
  project, revalidates it before scanning and immediately before mutation, and
  shares one abortable refresh across RPC callers.
- `packages/runtime/src/project-target-controller.ts` composes the existing
  trusted-root, workspace discovery, alias/overlap, capacity, and retirement
  behavior without a transport boundary.
- `studio-catalog.ts` opens the catalog through bb-owned storage and leaves the
  database handle lifecycle to bb.
- RPC schema v4 exposes only browser availability and path-free project scan
  truth; runtime version/API/startup handshake fields are gone.

Supervisor, launcher, resolver, private target client, HTTP `serve`, packaged
executable files, and their test graph have been removed. The production plugin
uses no secondary process or private listener.

The removed generic object service is not in that product call graph. Sessions,
surfaces, annotations, captures, comparisons, plugin briefs, reviews, private
bootstrap, and private MCP/HTTP capabilities were deleted with the child
runtime. They must not return unless a product caller and a separate decision
justify them through public bb contracts.

## Ownership decision

| Responsibility                                 | Current owner                                                           | Target owner                                                                                                  | Disposition and public contract                                                                                                                                                                                     |
| ---------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Project inventory and primary source selection | Studio backend through `project-adapter.ts`                             | Studio backend                                                                                                | `bb.sdk.system.config()` plus `bb.sdk.projects.list/get()` provide the primary host and authorized `local_path` sources.                                                                                            |
| Manifest-only discovery                        | Studio backend using bounded `packages/inspection`                      | Studio backend using `packages/inspection`                                                                    | Moved in-process under #99 after #97 closed the per-directory materialization gap. No plugin entrypoint or build tool is imported or executed.                                                                      |
| Enrolled remote-host discovery                 | Disabled Studio feature flag                                            | Deferred bb host/SDK capability                                                                               | Default off and outside current scope. Remote-only projects are omitted; mixed declarations fail closed. Never use server-local paths, hidden terminals, unrestricted commands, or `files.listPaths` as a fallback. |
| Development-target catalog                     | `bb.storage.database()` and `bb.storage.migrate()`                      | `bb.storage.database()` and `bb.storage.migrate()`                                                            | Migrated under #100 with durable identity and event semantics. bb owns the plugin database handle, WAL mode, busy timeout, and disposal.                                                                            |
| Generic objects and events                     | None; development-target history lives in the native bb-owned catalog   | None by default                                                                                               | Removed as future-only. Reintroduce product objects behind native bb RPC/storage only as their surfaces ship.                                                                                                       |
| Child supervision and handshake                | None                                                                    | bb plugin loader and `bb.background.service` only where continuous work is real                               | Removed under #101. Refresh work is request-scoped; abort in-flight work from `bb.onDispose`.                                                                                                                       |
| Private HTTP and bearer auth                   | None                                                                    | `bb.rpc` for app calls; `bb.http` only for a real external HTTP use case                                      | Removed. bb's local RPC auth and output validation replace the private target routes. Do not publish an unauthenticated replacement.                                                                                |
| Realtime progress                              | Not currently a live runtime capability                                 | `bb.realtime.publish` if progress becomes necessary                                                           | Delegate to bb; do not add private streaming first.                                                                                                                                                                 |
| CLI                                            | Source `bb-plugin-studio` inspection and Fixture commands               | bb native `bb.cli.register` for installed-plugin operations; retain independently useful source commands only | The private `serve` path was removed under #101; source inspection and Fixture commands remain.                                                                                                                     |
| Agent tools and skills                         | Capability probes and plugin manifest                                   | `bb.agents.registerTool/configure` plus manifest skills                                                       | Delegate to bb. Do not add an MCP server to compensate for a native tool surface already available.                                                                                                                 |
| Browser bootstrap and app communication        | Future capability plus current `bb.rpc` status/refresh                  | bb-hosted plugin app and `bb.rpc`; browser-only Fixture workbench stays independent                           | Remove the private bootstrap concept. Native bb is the Live visual authority; the ordinary browser remains a deterministic Fixture surface.                                                                         |
| Packaging                                      | Studio npm artifact contains the plugin, source CLI, and Fixture assets | Plugin server/app/assets plus independently useful source commands                                            | The executable child runtime, checksum stamp, supervision gates, and associated redistribution work were removed under #101.                                                                                        |
| Lifecycle cleanup                              | Plugin-owned refresh abort/dispose plus bb-owned database handles       | Plugin-owned refresh abort/dispose plus bb-owned database handles                                             | Abort the shared scan controller from `bb.onDispose`; close only resources Plugin Studio itself owns. No child supervision remains.                                                                                 |

## Public bb capabilities to reuse

The following are present in the pinned bb 0.36 generated declaration and the
exact published bb 0.37 generated declaration probed above. Each implementation
must compile against the public plugin SDK, not the upstream checkout.

| Need                              | Public bb capability                                                                                                      | Evidence and consequence                                                                                                                                                                         |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| App-to-backend status and refresh | `bb.rpc.register` with strict Standard Schema input/output                                                                | Already used by `plugins/studio/src/backend/plugin.ts`; it replaces `/v2/targets/*`.                                                                                                             |
| Plugin persistence                | `bb.storage.kv`, `bb.storage.database()`, `bb.storage.migrate()`                                                          | The database is namespaced beneath the plugin data root, host-tracked, and closed on dispose. Use it for the target catalog and migration ledger.                                                |
| Project context                   | `bb.sdk.system.config()` and `bb.sdk.projects.list/get()`                                                                 | Already used by `project-adapter.ts`; keep primary-host source authorization in bb.                                                                                                              |
| Host file operations              | `bb.sdk.files.read/list/listPaths` with explicit `hostId` and abort signal                                                | Useful only where the operation's safety contract matches the task. `read` supports `rootPath`; current recursive listing does not provide the traversal bounds required by #102.                |
| Work cancellation and lifecycle   | file/tool/service `AbortSignal`, `bb.background.service`, `bb.onDispose`                                                  | `bb.rpc` handlers do not receive a request signal. Refresh must share a plugin-owned `AbortController`, pass its signal into scanning, and abort it from `bb.onDispose`. No child PID is needed. |
| App updates                       | `bb.realtime.publish`                                                                                                     | Optional ephemeral progress; durable catalog state remains in plugin storage.                                                                                                                    |
| Native CLI                        | `bb.cli.register`                                                                                                         | Installed-plugin commands can live under bb without another executable server mode.                                                                                                              |
| Agent integration                 | `bb.agents.registerTool`, `configure`, and manifest skills                                                                | Use the native timeline, project/thread context, abort signal, and tool lifecycle.                                                                                                               |
| Host-rendered UI                  | manifest-declared plugin app slots; `bb.ui.requestInput` and `registerMentionProvider` for their narrow host interactions | Live bb owns host chrome and navigation. `bb.ui` is not a general rendering hook; Plugin Studio supplies only plugin-owned app content.                                                          |
| External HTTP, if later required  | `bb.http.route` with `local`, `token`, or explicitly unauthenticated modes                                                | Add only for an actual non-RPC caller. bb owns route namespace and auth semantics.                                                                                                               |

### Why `files.listPaths` is not the missing discovery primitive

Both bb 0.36 and 0.37 expose `files.listPaths({ hostId, path, query, limit,
includeFiles, includeDirectories, signal })`. The host-daemon implementation
currently calls `listPathsRecursively(...)` and only then applies
`finalizeListedPaths(..., limit)`. The public request has no depth, visited-entry,
per-directory-work, byte, deadline, stable-entry, or pagination contract, and
it has no `rootPath` confinement field for listing.

Calling it with a small result limit therefore does not bound traversal work or
memory. It cannot satisfy Plugin Studio's nonexecution and pathological-tree
requirements. #102 should preferably add a first-class development-plugin
discovery operation. A generic walk is acceptable only if limits are charged
during traversal, host routing is explicit, exact reads are bounded and strict
UTF-8, symlinks are not followed, cancellation/deadlines work, and partial
results explain uncertainty without exposing private paths.

## In-process scanning decision

Manifest-only primary-host scanning does not require process isolation.

The process boundary is not a security boundary for a full-trust bb plugin,
while the inspection kernel already avoids importing plugin entrypoints,
running package scripts, building, installing, or mounting content scripts. Its
existing protections include trusted-root admission, canonical containment,
symlink and race attestations, bounded manifest reads, strict UTF-8, global
visited-entry/candidate/match-work limits, per-root fairness, abort signals,
deadlines in the workspace path, and path-private diagnostics.

One known gap must close before in-process discovery becomes authoritative:
[`#97`](https://github.com/galligan/bb-plugin-studio/issues/97) records that
`fs.readdir(..., { withFileTypes: true })` currently materializes and sorts a
whole directory before the global entry budget is charged. #99 may build the
in-process adapter and shadow comparisons in parallel, but it must not remove
the fallback or claim pathological-tree bounds until #97 (or equivalent
bounded enumeration in the final owner) passes.

If later discovery needs to execute target code, native binaries, build tools,
or arbitrary commands, this decision no longer applies. That operation needs a
new threat model and likely a disposable environment, not silent expansion of
the manifest scanner.

## Historical legacy-state inventory

This inventory records the migration risk that existed when the ADR was
accepted. The owner subsequently removed the legacy installation and chose a clean Studio install,
so production Plugin Studio does not import this database. The bb-owned catalog
starts clean and preserves the same identity, revision, scope, retirement, and
event semantics going forward. The historical files, if retained outside the
active profile, are evidence only and never an operational fallback.

The legacy data root resolves to `<bb-data>/plugins/studio/runtime`; its database
is `workbench.sqlite3`, and `runtime-identity.json` stores a generated principal
and bb-context identity. #100 must make these files immutable import input at
the cutover barrier and keep them unchanged through the rollback window.

The live schema is an ordered migration set (versions 1 through 9):

- `runtime_migrations`: version and checksum ledger.
- `runtime_objects`: object id, kind, principal/bb-context/target/session
  bindings, revision, timestamps, and canonical JSON payload.
- `runtime_events`: append-only sequence, event type, object kind/id, revision,
  timestamp, and the same bindings.
- `development_target_sources`: durable object-to-canonical-root identity and
  root provenance (`current-project`, `explicit`, or `pinned`).
- `development_target_host_observations`: runtime instance plus optional bb host
  facts and observation time.
- `development_target_retirements`: retirement timestamp and revision.
- `development_target_project_scopes`: authoritative project roots.
- `development_target_event_retention`: monotonic expired-through sequence.

A read-only immutable query of the current profile on 2026-08-13 found three
`development-target` objects, three source rows, two project scopes, one
retirement, no host observations, and no event-retention checkpoint. Its 33
events are three `object.created`, 29 `object.updated`, and one
`target.retired`. No generic session, surface, annotation, capture, comparison,
plugin-brief, or review row exists in that profile. These counts establish that
the catalog identity/history is live state; they are not an authorization to
copy paths or payloads from the primary profile into fixtures.

The migration must preserve, where present and valid:

- target/object IDs and their equality invariant;
- current revision, creation/update timestamps, manifest projection,
  capabilities, native status, and redacted display path;
- source kind, canonical root privately, and project-scope membership;
- retirement and reopen behavior;
- `object.created`, `object.updated`, `target.native-reconciled`,
  `target.reopened`, and `target.retired` ordering and cursor/retention meaning;
- host observations needed for native reconciliation; and
- enough source identity/checksum metadata to make import idempotent and to
  detect a changed or partially imported source.

Generic session/surface/annotation/capture/comparison/plugin-brief/review rows
have no current product caller and none exist in the current profile. Preserve
the untouched legacy database for rollback, but do not create destination
tables for these future-only kinds without a product owner, codec, and retention
decision. An importer must still fail closed if another profile contains an
unexpected object kind rather than silently dropping it.

Principal IDs, bb-context IDs, runtime instance IDs, bearer tokens, and
browser-session scopes are topology credentials, not product identity. They do
not survive as active authorization concepts. Migration metadata may retain a
one-way source identity/checksum, but native RPC authorization is owned by bb.

## Security and privacy boundary after convergence

Removing the child process removes a loopback listener, bearer token,
supervisor pipe, descriptor parser, PID liveness loop, process environment, and
duplicate identity. It also removes the opportunity to mistake that machinery
for a sandbox.

The converged path must retain these invariants:

- accept project roots only from current public bb project/source results;
- require the source to be an unambiguous `local_path` on the selected host;
- never send canonical roots or incidental absolute paths to the frontend;
- expose only strict allowlisted projections with opaque target IDs;
- never import or execute a discovered plugin during scan or preview;
- re-resolve and compare project source identity around a refresh to catch
  source changes;
- deduplicate concurrent refreshes and abort on plugin reload/disposal;
- report partial/unavailable states instead of a false ready-empty result;
- keep Live bb, Harness, and Fixture claims separate; and
- do not mutate, reinstall, or retarget an installed plugin as part of
  discovery or migration.

Moving scanning into bb's server process increases the consequence of CPU,
memory, or event-loop exhaustion. #97's per-directory bounds, existing global
budgets, deadlines, cancellation, and a pathological-tree regression are
therefore release gates. The scanner should yield between bounded units of
work when measurements show event-loop starvation; a worker process is not the
default solution unless measurements prove bounded in-process work still harms
bb responsiveness.

## Migration and dependency plan

```text
#98 boundary ADR
  |-- #99 in-process primary-host discovery + shadow parity --\
  |-- #100 bb-owned catalog import + rollback ---------------+--> #101 remove child runtime
  `-- #102 bounded enrolled-host discovery (deferred; feature flag off)

#97 bounded per-directory enumeration -----> authoritative #99 cutover
```

### Phase 0: freeze and fixture

- Freeze private runtime expansion.
- Capture a scrubbed schema fixture and inventory real row kinds/counts without
  exposing paths or user data.
- Pin normalized target projections, retirement/reopen transitions, and event
  cursor behavior as migration fixtures.

### Phase 1: authoritative in-process discovery (#99, implemented)

- The backend admits and revalidates bb-authorized primary-host project sources
  before the bounded inspection kernel and again before catalog mutation.
- One shared refresh carries the plugin lifecycle abort signal through root
  admission, discovery, candidate issuance, and catalog writes.
- The extracted controller keeps the existing deterministic corpus as the
  parity oracle for aliases, overlaps, partial results, capacity, retirement,
  reopen, cancellation, and path-private diagnostics.
- Enrolled, mixed, and multiple-primary source declarations fail closed.

### Phase 2: clean bb-owned catalog (#100, implemented)

- The schema is created through `bb.storage.database()` and append-only
  `bb.storage.migrate()` statements.
- The adapter enables and verifies foreign keys without changing bb's WAL mode
  or closing bb's handle.
- Reload, stable identity/revision/history, failed migration, and tampered schema
  proofs run against the host-neutral catalog and real `better-sqlite3` adapter.
- The removed legacy profile is not imported; there is no dual-writer or rollback
  database in the active Studio topology.

### Phase 3: remove dormant child machinery (#101)

- Keep direct status/refresh through existing `bb.rpc` and schema v4.
- Keep the frontend catalog-oriented with per-project scan truth and no runtime
  version/API/startup handshake.
- Remove supervisor, launcher, resolver, target HTTP client, private handler,
  principals/scopes, runtime identity, health/capability endpoints, `serve`, and
  the packaged executable/stamp/gates.
- Retain independently useful Fixture/inspect commands only if they no longer
  imply the removed topology.

### Deferred enrolled-host track (#102)

- Ship `STUDIO_FEATURE_FLAGS.enrolledHostDiscovery` as `false`.
- Omit remote-only projects from the active inventory while the flag is off;
  mixed or ambiguous declarations remain partial.
- Do not schedule upstream work as part of the current Plugin Studio scope.
- If the product later reopens this feature, agree on and implement the public
  bounded host operation before enabling it. Never substitute primary-host
  filesystem access.

## Historical rollback design and current compatibility

The dual-database rollback design below is retained as decision history, not an
active Studio mechanism. The legacy installation was removed before native cutover, and Studio
starts with one clean bb-owned catalog. Current rollback must preserve that
catalog; it must not reactivate or write a legacy child database.

One bounded migration window retains the legacy executable path and quiesced
database while both legacy and native catalogs are write-frozen. Rollback may
switch reads back to the child path only inside that window, through a new
stop/drain/snapshot barrier, and when:

- the legacy files pass their original integrity checks;
- the installed plugin version still understands their schema and runtime
  protocol;
- neither catalog has accepted a mutation since the shared snapshot; and
- the operator intentionally selects rollback in a disposable or backed-up
  profile first.

The rehearsal window ends before native mutation is enabled. After that point,
rollback means rolling code forward or back while keeping the native store
authoritative; returning to the legacy database requires a separately reviewed
reverse migration and is not part of #101.

The importer is idempotent, never edits the source database, and refuses
unknown future schemas, checksum drift, partial prior imports, or ambiguous
identity. After the rollback window and explicit release evidence, a later
decision may remove legacy files; #101 does not silently delete them.

The plugin declares a minimum bb version but accepts newer compatible releases.
Implementation gates run against both the minimum lane and the current stable
lane. The enrolled-host feature remains off regardless of bb version; a future
implementation would capability-detect its bounded host contract rather than
use exact version equality. A newer bb version must not be rejected merely
because it is newer.

## Acceptance evidence

#98 is complete when this decision and its code references have independent
review. Implementation issues must provide the following evidence before #101
removes the child runtime:

1. **Public-contract proof:** minimum and current-stable generated declarations
   compile the direct backend adapter with no private bb imports.
2. **Call-graph proof:** production imports show no path from Studio to the
   generic object service, private HTTP handler, or child supervision after
   removal.
3. **Controller parity:** the shared deterministic corpus preserves target IDs,
   revisions, ordering, aliases, overlaps, partial states, capacity,
   retirement/reopen, and diagnostics without a second implementation.
4. **Native-catalog proof:** clean initialization, repeated load, failed
   migration rollback, corrupt schema, stable identity/history,
   retirement/reopen, and event cursor/retention tests pass on bb-owned storage.
5. **Resource proof:** a 100k-entry pathological directory is bounded before
   full materialization, with recorded wall time, peak memory, cancellation,
   deadline, symlink, and event-loop responsiveness evidence.
6. **Lifecycle proof:** refresh deduplication, plugin reload, disable/enable,
   disposal, and bb shutdown leave no work, listener, child, token, or stale
   database handle behind.
7. **Privacy proof:** frontend/RPC snapshots, diagnostics, logs, and errors
   contain no canonical roots, host credentials, source migration details, or
   user data.
8. **Disposable-profile walking skeleton:** install by path in isolated bb,
   load projects, refresh the in-process catalog, reload, disable/enable, and
   remove while the normal profile remains byte-equivalent.
9. **Repository gates:** compatibility lanes, typecheck, tests, build, visual
   tests, package inspection, and clean-room lifecycle are green with no
   packaged child executable.
10. **Rollback proof:** reload and compatible code rollback keep the bb-owned
    catalog authoritative and never reactivate a legacy child database.

## Consequences

Plugin Studio becomes smaller, follows bb's public extension model, and avoids
maintaining a duplicate server. Primary-host projects can reach the target end
state without waiting for an upstream remote filesystem contract.

The tradeoff is that discovery work now shares bb's process, so bounded work
and cancellation become hard safety requirements rather than defense in depth.
Remote enrolled-host parity is deliberately outside the current product scope
and its feature flag remains off. Future sessions, annotations, captures,
comparisons, briefs, reviews, or MCP work must choose native bb surfaces when
those product slices are actually implemented; the dormant generic runtime
schema is not carried forward automatically.
