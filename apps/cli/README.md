# bb Plugin Studio

bb Plugin Studio is an experimental, fixture-driven authoring companion for native
[bb](https://github.com/get-bb/bb) plugins.

The CLI package contains the command and deterministic static plugin-surface lab.
It does not bundle bb, third-party plugin packages, a copied plugin SDK, or
authenticated host state. The repository also contains the separately packaged
Studio-owned integration plugin used for native bb testing.

> bb Plugin Studio is an independent community project. Native bb and
> `@get-bb/plugin-sdk` remain authoritative for plugin contracts, scaffolding,
> build/install/dev behavior, host rendering, and runtime state.

## Try the source preview

```sh
git clone https://github.com/galligan/bb-plugin-studio.git
cd bb-plugin-studio
bun install --frozen-lockfile
bun run bb-plugin-studio --help
bun run dev
```

bb Plugin Studio is not currently distributed as a public installable package.
The supported first-contact path is this experimental source preview. The older
`bb-plugin-studio` npm artifact is not the current onboarding path.

`bb-plugin-studio` is the canonical package and command identity introduced by
the Studio rename. The package has not been published yet.

To inspect an existing plugin source tree explicitly:

```sh
bun run bb-plugin-studio inspect /absolute/path/to/plugin
bun run bb-plugin-studio dev /absolute/path/to/plugin
```

See the
[source preview guide](https://github.com/galligan/bb-plugin-studio/blob/main/docs/source-preview.md)
for native handoff side effects, confidence levels, and current limitations.

## Commands

```text
bb-plugin-studio inspect <plugin>  Read manifests, native metadata, and compatibility
bb-plugin-studio dev <plugin>      Open the packaged Fixture surface lab
bb-plugin-studio check <plugin>    Inspect, delegate bb plugin build, inspect again
bb-plugin-studio live <plugin>     Hand off an installed path plugin to bb plugin dev
```

`inspect` is passive: it does not import or execute the selected plugin.

`check` and `live` cross the passive boundary by delegating to the native
`bb` CLI with inherited output. `live` runs only when bb confirms that the
same real plugin path is installed; otherwise it prints the native installation
command without running it.

The source `dev` command serves the 13-story lab on loopback. It does not
install, build, reload, or run the selected plugin. The source development
server exposes a bounded inspection session for the explicitly selected tree;
the packaged static lab does not serve inspection data over HTTP.

## bb, the SDK, and bb Plugin Studio

- **bb** owns scaffolding, declaration refresh, build, install, update,
  dev/reload, host UI, and live runtime.
- **`@get-bb/plugin-sdk`** owns the typed backend/frontend contracts and official
  testing contracts.
- **bb Plugin Studio** adds passive inspection, deterministic Fixture stories,
  compatibility diagnostics, visual/a11y tooling, and native handoff.

bb Plugin Studio never copies the SDK testing harness or uses private bb application code
as a substitute. Harness mode is available only when the selected plugin
resolves `@get-bb/plugin-sdk/testing` and `@get-bb/plugin-sdk/testing/app`.
Live bb is always the visual and integration authority.

Learn more in the
[repository README](https://github.com/galligan/bb-plugin-studio#readme) and
[plugin-author guide](https://github.com/galligan/bb-plugin-studio/blob/main/docs/plugin-author-guide.md).

## Runtime support

- Bun 1.3.14 is the verified runtime; newer engine-compatible Bun versions are
  best-effort until added to CI.
- The clean-room packaging lane uses npm for artifact inspection, but no
  current public package is the supported installation path. Node is not a
  supported CLI runtime.
- Native handoffs target a supported macOS bb host.
- Fixture and package checks are also exercised in isolated Linux CI.

The source CLI retains passive inspection, native command delegation, and the
deterministic Fixture surface lab. Studio discovery itself runs in the bb
plugin process; the package does not embed or supervise a second runtime.

## Trust and security

Plugins are full-trust local code. Review a plugin before using native
`check` or `live` handoffs. See the
[trust model](https://github.com/galligan/bb-plugin-studio/blob/main/docs/trust-model.md)
for the filesystem, network, secret, and execution boundaries.

Report bugs through
[GitHub Issues](https://github.com/galligan/bb-plugin-studio/issues). Report
vulnerabilities privately through
[GitHub Security Advisories](https://github.com/galligan/bb-plugin-studio/security/advisories/new).

## Source and license

Source: <https://github.com/galligan/bb-plugin-studio>

bb Plugin Studio is available under the
[MIT License](https://github.com/galligan/bb-plugin-studio/blob/main/LICENSE). bb and its
plugin SDK are separate upstream software governed by their own repository and
license.
