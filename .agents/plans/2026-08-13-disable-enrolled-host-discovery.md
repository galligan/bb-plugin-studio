# Disable enrolled-host discovery

Date: 2026-08-13
Status: Implemented; review PR pending

## Outcome

Keep Plugin Studio focused on primary-host projects. Enrolled-host discovery is
an explicit Studio feature flag that ships disabled. Remote-only projects stay
outside the active Studio inventory and never enter filesystem discovery.

## Behavior

- `enrolledHostDiscovery` defaults to `false` in one backend feature-flag
  module.
- A project with exactly one valid source on an enrolled, non-primary host is
  omitted while the flag is disabled. It does not make healthy primary-host
  inventory partial.
- Mixed, multiple, malformed, or otherwise ambiguous source declarations still
  make inventory partial and never enter discovery.
- Enabling the future feature still requires the bounded public bb capability;
  this change does not add a remote scanner or an unsafe fallback.

## Verification

- Add a public adapter regression for the disabled remote-only behavior.
- Retain plugin-level proof that enrolled paths never reach the controller or
  public response.
- Run focused backend tests, Studio typecheck/build, repository formatting, and
  diff checks.
- Reconcile #102 and the runtime ADR as deferred, default-off future scope.

## Boundary

Do not change browser behavior, upstream bb, package publication, or the
primary-host scanner.

## Completion evidence

- Focused Studio backend: 15 tests, 81 assertions.
- Full workspace unit suite and script suite: green.
- Full check, bb 0.37 compatibility, Studio build, format, and diff checks:
  green.
- Browser code and issue #70: unchanged.
