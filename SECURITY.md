# Security policy

## Reporting a vulnerability

Please report suspected bb Plugin Studio vulnerabilities through
[GitHub's private vulnerability reporting](https://github.com/galligan/bb-plugin-studio/security/advisories/new).

Do not open a public issue or include exploit details, credentials, customer
data, authenticated state, or local paths in public logs or comments. A useful
private report includes:

- the affected bb Plugin Studio version or source commit;
- reproduction steps using fake data;
- the expected and observed behavior;
- the potential impact;
- any known workaround.

This alpha has no guaranteed response or remediation time, but maintainers will
acknowledge reports while the project is actively staffed, reproduce and triage
the issue, coordinate a fix and disclosure boundary, and credit the reporter if
requested.

Security problems in native bb or `@get-bb/plugin-sdk` should follow the
[upstream bb security policy](https://github.com/get-bb/bb/security/policy).

## Security boundary

bb Plugin Studio treats plugins as full-trust local code. It is not a sandbox.

Passive inspection is designed to read manifests and generated metadata without
importing the plugin entrypoint. Native build and Live commands are explicit
terminal actions because they can execute plugin toolchains or code and mutate
native plugin state. The packaged Fixture server binds to loopback and does not
serve plugin inspection data.

See [docs/trust-model.md](docs/trust-model.md) for the detailed filesystem,
network, secret, content-script, and native-command boundaries.

A third-party plugin intentionally reading files or using the network is usually
a plugin issue. The following are bb Plugin Studio security issues:

- passive inspection executes a selected plugin;
- diagnostics expose paths that should be redacted;
- the packaged server escapes its static-lab root or binds beyond its documented
  loopback boundary;
- bb Plugin Studio runs a native mutation without an explicit user handoff;
- a content-script fixture mounts trusted plugin code during ordinary discovery.

## Supported versions

Security fixes target the current `main` branch and current npm alpha. Old
commits, modified artifacts, unsupported bb/SDK versions, and third-party plugin
code are not maintained release lines.

## Handling fixes

- Reproduce with deterministic fake data and isolated profiles.
- Keep advisory branches and artifacts private until coordinated disclosure.
- Do not remove and reinstall a managed path plugin when that could discard its
  settings or secrets.
- Verify the smallest fix plus the complete relevant repository, browser, and
  package gates before release.
- Treat publication, tagging, disclosure timing, and credential rotation as
  separate maintainer decisions.
