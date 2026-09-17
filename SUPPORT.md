# Support and compatibility

bb Plugin Studio is an MIT-licensed experimental source preview. It does not
yet have a stable API, long-term support line, response-time commitment, or
compatibility promise across every bb release.

## Where to ask

Open a [GitHub Issue](https://github.com/galligan/bb-plugin-studio/issues) for:

- bb Plugin Studio discovery or inspection bugs;
- Fixture lab, story, accessibility, or visual-regression problems;
- incorrect compatibility diagnostics or native-command handoffs;
- bb Plugin Studio documentation and packaging problems.

Report native bb scaffolding, build/install/dev behavior, plugin runtime, host
UI, routing, or SDK contract problems to the
[upstream bb issue tracker](https://github.com/get-bb/bb/issues). A minimal
reproduction that isolates the responsible layer helps both projects.

Do not open a public issue for a vulnerability. Follow
[SECURITY.md](SECURITY.md) instead.

## Include in a report

Please include:

- the bb Plugin Studio version or source commit;
- `bun --version`;
- native `bb --version`, when native behavior is involved;
- the selected plugin's `engines.bb` and `engines.bbPluginSdk` ranges;
- the exact command, exit status, and sanitized diagnostic output;
- a small reproduction using fake data when possible.

Do not include credentials, customer data, authenticated state, or unredacted
local paths.

## Supported line

The actively maintained surface is:

- the current green `main` branch;
- the source preview documented in [docs/source-preview.md](docs/source-preview.md);
- the bb target recorded in `compatibility/bb-target.json`;
- Bun 1.3.14 and newer engine-compatible versions on a best-effort basis;
- macOS for native bb handoffs;
- the Linux environments exercised by CI for Fixture, package, and browser
  checks.

Old commits, modified tarballs, undeclared bb/SDK versions, alternate runtimes,
and third-party plugin behavior are best-effort.

Before diagnosing a native mismatch, run:

```sh
bun run compatibility:check
```

The check fails closed when public upstream evidence is unavailable; a failed
network probe is not proof of incompatibility. See
[docs/compatibility-target.md](docs/compatibility-target.md) for the recorded
target and update process.

## Fidelity boundaries

- **Fixture** support covers bb Plugin Studio's deterministic stories and adapters.
- **Harness** support is available when the selected plugin resolves the
  official `@get-bb/plugin-sdk/testing` contracts. Results are behavioral, not
  visual authority.
- **Live bb** is the authority for host rendering and integration behavior.

Fixture screenshots cannot overrule live bb. When upstream adds a native
capability that replaces a bb Plugin Studio seam, bb Plugin Studio should adopt it and retire the
duplicate.
