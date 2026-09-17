import { afterEach, describe, expect, test } from "bun:test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  formatInspection,
  inspectPlugin,
  type CommandResult,
  type HarnessResolution,
} from "./index.ts";
import { resolveHarness } from "./harness.ts";
import type { PluginPackageJson } from "./manifest.ts";

const temporaryRoots: string[] = [];

async function createWorkspace(): Promise<string> {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "bb-plugin-studio-report-"),
  );
  temporaryRoots.push(root);
  await fs.mkdir(path.join(root, "plugins"), { recursive: true });
  return root;
}

async function writePlugin(
  workspaceRoot: string,
  name: string,
  packageJson: Record<string, unknown>,
): Promise<string> {
  const pluginRoot = path.join(workspaceRoot, "plugins", name);
  await fs.mkdir(pluginRoot, { recursive: true });
  await fs.writeFile(
    path.join(pluginRoot, "package.json"),
    `${JSON.stringify(packageJson, null, 2)}\n`,
  );
  const bb = packageJson.bb as Record<string, unknown> | undefined;
  for (const entry of [bb?.server, bb?.app]) {
    if (typeof entry !== "string" || !entry.startsWith("./")) continue;
    const entryPath = path.resolve(pluginRoot, entry);
    if (!entryPath.startsWith(`${pluginRoot}${path.sep}`)) continue;
    await fs.mkdir(path.dirname(entryPath), { recursive: true });
    await fs.writeFile(entryPath, "export {};\n");
  }
  return pluginRoot;
}

function validPluginPackage(
  slug: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const bbOverrides =
    typeof overrides.bb === "object" &&
    overrides.bb !== null &&
    !Array.isArray(overrides.bb)
      ? (overrides.bb as Record<string, unknown>)
      : {};
  return {
    name: `bb-plugin-${slug}`,
    version: "1.0.0",
    ...overrides,
    bb: {
      name: slug,
      description: `${slug} test plugin`,
      branding: { icon: "Puzzle" },
      server: "./server.ts",
      ...bbOverrides,
    },
  };
}

function command(
  stdout: string,
  options: Partial<CommandResult> = {},
): CommandResult {
  return {
    stdout,
    stderr: "",
    exitCode: 0,
    ...options,
  };
}

function nativeRunner(pluginRoot: string) {
  return async (args: readonly string[]): Promise<CommandResult> => {
    if (args[0] === "--version") return command("0.35.1\n");
    if (args[0] === "connect") {
      return command(
        JSON.stringify(
          args[1] === "shares"
            ? {
                host: { id: "host_test", name: "test", isServer: true },
                shares: [],
              }
            : {
                state: "connected",
                paired: true,
                url: "https://example.getbb.app",
                shares: [],
              },
        ),
      );
    }
    if (args[1] === "source") {
      return command(
        JSON.stringify({
          requested: `path:${pluginRoot}`,
          resolved: `path:${pluginRoot}`,
          engines: { bb: ">=0.35", bbPluginSdk: "^0.4.1" },
        }),
      );
    }
    return command(
      JSON.stringify({
        plugins: [
          {
            id: "linear",
            rootDir: pluginRoot,
            source: `path:${pluginRoot}`,
            status: "running",
            hasSettings: true,
            capabilities: [
              {
                kind: "thread-integration",
                id: "mention:linear-issue",
                label: "Linear issues",
              },
            ],
            services: [],
            app: { hasApp: false, bundle: null },
          },
        ],
      }),
    );
  };
}

const unavailableHarness: HarnessResolution = {
  state: "package-not-declared",
  version: null,
  detail: "The selected plugin does not declare @get-bb/plugin-sdk.",
};

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

describe("actionable plugin inspection", () => {
  test("resolves the required harness exports without requiring the app runtime", async () => {
    const workspaceRoot = await createWorkspace();
    const packageJson = validPluginPackage("harness", {
      dependencies: { "@get-bb/plugin-sdk": "^0.5.0" },
    }) as PluginPackageJson;
    const pluginRoot = await writePlugin(workspaceRoot, "harness", packageJson);
    const sdkRoot = path.join(
      pluginRoot,
      "node_modules",
      "@get-bb",
      "plugin-sdk",
    );
    await fs.mkdir(sdkRoot, { recursive: true });
    await fs.writeFile(
      path.join(sdkRoot, "package.json"),
      `${JSON.stringify({
        name: "@get-bb/plugin-sdk",
        version: "0.5.0",
        exports: {
          ".": "./index.js",
          "./testing": "./testing.js",
          "./testing/app": "./testing-app.js",
        },
      })}\n`,
    );
    await Promise.all(
      ["index.js", "testing.js", "testing-app.js"].map((file) =>
        fs.writeFile(path.join(sdkRoot, file), "export {};\n"),
      ),
    );

    await expect(resolveHarness(pluginRoot, packageJson)).resolves.toEqual({
      state: "available",
      version: "0.5.0",
      detail: "The official selected-plugin testing subpaths resolved.",
    });
  });

  test(
    "resolves published testing subpaths from a clean package install",
    async () => {
      const workspaceRoot = await createWorkspace();
      const packageJson = validPluginPackage("published-harness", {
        dependencies: { "@get-bb/plugin-sdk": "0.4.87" },
      }) as PluginPackageJson;
      const pluginRoot = await writePlugin(
        workspaceRoot,
        "published-harness",
        packageJson,
      );
      const packedSdk = path.join(
        fileURLToPath(new URL("../../..", import.meta.url)),
        "plugins",
        "studio",
        "node_modules",
        "@get-bb",
        "plugin-sdk",
      );
      const pack = Bun.spawnSync(
        ["npm", "pack", "--ignore-scripts", "--pack-destination", pluginRoot],
        { cwd: packedSdk, stdout: "pipe", stderr: "pipe" },
      );
      expect(pack.exitCode).toBe(0);
      const tarball = path.join(pluginRoot, "get-bb-plugin-sdk-0.4.87.tgz");
      const install = Bun.spawnSync(
        [
          "npm",
          "install",
          "--ignore-scripts",
          "--no-audit",
          "--no-fund",
          "--prefix",
          pluginRoot,
          tarball,
        ],
        { stdout: "pipe", stderr: "pipe" },
      );
      expect(install.exitCode).toBe(0);

      await expect(resolveHarness(pluginRoot, packageJson)).resolves.toEqual({
        state: "available",
        version: "0.4.87",
        detail: "The official selected-plugin testing subpaths resolved.",
      });
    },
    { timeout: 30_000 },
  );

  test("emits a versioned report with compatibility, provenance, and trust facts", async () => {
    const workspaceRoot = await createWorkspace();
    const pluginRoot = await writePlugin(
      workspaceRoot,
      "linear",
      validPluginPackage("linear", {
        name: "bb-plugin-linear",
        version: "0.1.0",
        engines: { bb: ">=0.35", bbPluginSdk: "^0.4.1" },
        bb: {
          name: "Linear",
          description: "Linear test plugin",
          branding: { icon: "Check" },
          server: "./server.ts",
          skills: ["./skills/linear"],
        },
      }),
    );
    await fs.mkdir(path.join(pluginRoot, "dist"));
    await fs.writeFile(
      path.join(pluginRoot, "dist", "server.meta.json"),
      JSON.stringify({
        artifactFormatVersion: 1,
        sdkMajor: 0,
        sdkVersion: "0.4.1",
        pluginId: "linear",
        pluginVersion: "0.1.0",
        builtWith: {
          bbVersion: "0.35.1",
          pluginSdkVersion: "0.4.1",
        },
      }),
    );

    const report = await inspectPlugin({
      workspaceRoot,
      runBb: nativeRunner(pluginRoot),
      resolveHarness: async () => unavailableHarness,
    });

    expect(report.schemaVersion).toBe(1);
    expect(report.target?.displayName).toBe("Linear");
    expect(
      report.checks.find((check) => check.id === "engine.bb")?.status,
    ).toBe("pass");
    expect(
      report.checks.find((check) => check.id === "engine.plugin-sdk")?.status,
    ).toBe("pass");
    expect(report.provenance).toMatchObject({
      kind: "path",
      requested: `path:${pluginRoot}`,
      resolved: `path:${pluginRoot}`,
    });
    expect(report.trust).toMatchObject({
      model: "full-trust-local-code",
      entrypoints: ["./server.ts"],
      skills: ["./skills/linear"],
      hasSettings: true,
      undisclosedAccess: [
        "filesystem",
        "network",
        "secrets",
        "external-services",
      ],
    });
    expect(report.modes.fixture.available).toBe(true);
    expect(report.modes.harness.available).toBe(false);
  });

  test("preserves native command evidence and an actionable next step", async () => {
    const workspaceRoot = await createWorkspace();
    await writePlugin(workspaceRoot, "broken", validPluginPackage("broken"));

    const report = await inspectPlugin({
      workspaceRoot,
      resolveHarness: async () => unavailableHarness,
      runBb: async (args) =>
        args[0] === "--version"
          ? command("", {
              stderr: "bb daemon unavailable",
              exitCode: 17,
            })
          : command("", { stderr: "connection refused", exitCode: 9 }),
    });

    const nativeCheck = report.checks.find(
      (check) => check.id === "native.bb-version",
    );
    expect(nativeCheck).toMatchObject({
      status: "fail",
      nextAction: expect.any(String),
      nativeError: {
        exitCode: 17,
        stderr: "bb daemon unavailable",
      },
    });
    expect(report.outcome).toBe("blocked");
  });

  test("reports incompatible and invalid engine ranges", async () => {
    const workspaceRoot = await createWorkspace();
    const pluginRoot = await writePlugin(
      workspaceRoot,
      "future",
      validPluginPackage("future", {
        engines: { bb: ">=0.40", bbPluginSdk: "definitely-not-semver" },
      }),
    );
    await fs.mkdir(path.join(pluginRoot, "dist"));
    await fs.writeFile(
      path.join(pluginRoot, "dist", "server.meta.json"),
      JSON.stringify({
        artifactFormatVersion: 1,
        sdkMajor: 0,
        sdkVersion: "0.4.1",
        pluginId: "future",
        pluginVersion: "1.0.0",
        builtWith: { bbVersion: "0.35.1", pluginSdkVersion: "0.4.1" },
      }),
    );

    const report = await inspectPlugin({
      workspaceRoot,
      runBb: nativeRunner(pluginRoot),
      resolveHarness: async () => unavailableHarness,
    });

    expect(
      report.checks.find((check) => check.id === "engine.bb"),
    ).toMatchObject({ status: "fail", nextAction: expect.any(String) });
    expect(
      report.checks.find((check) => check.id === "engine.plugin-sdk"),
    ).toMatchObject({ status: "fail", nextAction: expect.any(String) });
  });

  test("distinguishes an absent SDK declaration from a broken local dependency", async () => {
    const workspaceRoot = await createWorkspace();
    const pluginRoot = await writePlugin(
      workspaceRoot,
      "ui",
      validPluginPackage("ui", {
        dependencies: { "@get-bb/plugin-sdk": "^0.4.1" },
        bb: { app: "./app.tsx" },
      }),
    );

    const report = await inspectPlugin({
      workspaceRoot,
      runBb: nativeRunner(pluginRoot),
      resolveHarness: async () => ({
        state: "dependency-unresolved",
        version: null,
        detail: "@get-bb/plugin-sdk is declared but cannot be resolved.",
      }),
      resolveSdkPublication: async () => ({
        state: "published",
        version: "0.4.1",
        detail: "Published on npm.",
      }),
    });

    expect(report.modes.harness.detail).toContain(
      "declared but cannot be resolved",
    );
    expect(
      report.checks.find((check) => check.id === "mode.harness"),
    ).toMatchObject({
      status: "unavailable",
      nextAction: expect.stringContaining("dependency"),
    });
  });

  test("reports malformed manifests and artifacts without executing entrypoints", async () => {
    const workspaceRoot = await createWorkspace();
    const pluginRoot = path.join(workspaceRoot, "plugins", "malformed");
    await fs.mkdir(path.join(pluginRoot, "dist"), { recursive: true });
    await fs.writeFile(path.join(pluginRoot, "package.json"), "{not-json");
    await fs.writeFile(path.join(pluginRoot, "dist", "server.meta.json"), "[");

    const report = await inspectPlugin({
      workspaceRoot,
      targetPath: pluginRoot,
    });

    expect(report.state).toBe("error");
    expect(
      report.checks.find((check) => check.id === "manifest.read"),
    ).toMatchObject({ status: "fail", nextAction: expect.any(String) });
  });

  test("formats checks deterministically with remediation and native evidence", async () => {
    const workspaceRoot = await createWorkspace();
    await writePlugin(
      workspaceRoot,
      "ui",
      validPluginPackage("ui", { bb: { app: "./app.tsx" } }),
    );
    const report = await inspectPlugin({
      workspaceRoot,
      resolveHarness: async () => unavailableHarness,
      runBb: async () =>
        command("", { stderr: "native command failed", exitCode: 3 }),
    });

    const output = formatInspection(report);
    expect(output).toContain("bb Plugin Studio compatibility report v1");
    expect(output).toContain("Next:");
    expect(output).toContain("Native error (exit 3): native command failed");
    expect(output).toContain("Provenance:");
    expect(output).toContain("full-trust local code");
  });

  test("reports missing and malformed expected artifacts separately", async () => {
    const workspaceRoot = await createWorkspace();
    const pluginRoot = await writePlugin(
      workspaceRoot,
      "artifacts",
      validPluginPackage("artifacts", { bb: { app: "./app.tsx" } }),
    );
    await fs.mkdir(path.join(pluginRoot, "dist"));
    await fs.writeFile(path.join(pluginRoot, "dist", "app.meta.json"), "[");

    const report = await inspectPlugin({
      workspaceRoot,
      runBb: nativeRunner(pluginRoot),
      resolveHarness: async () => unavailableHarness,
    });

    expect(
      report.checks.find((check) => check.id === "artifact.server"),
    ).toMatchObject({
      status: "warning",
      nextAction: expect.stringContaining("bb plugin build"),
    });
    expect(
      report.checks.find((check) => check.id === "artifact.app"),
    ).toMatchObject({
      status: "fail",
      nextAction: expect.stringContaining("bb plugin build"),
    });
  });

  test("reports malformed native JSON without hiding the parse error", async () => {
    const workspaceRoot = await createWorkspace();
    await writePlugin(
      workspaceRoot,
      "native-json",
      validPluginPackage("native-json"),
    );

    const report = await inspectPlugin({
      workspaceRoot,
      resolveHarness: async () => unavailableHarness,
      runBb: async (args) =>
        args[0] === "--version" ? command("0.35.1") : command("not-json"),
    });

    expect(
      report.checks.find((check) => check.id === "native.plugin-list"),
    ).toMatchObject({
      status: "fail",
      detail: expect.any(String),
      nextAction: expect.any(String),
    });
    expect(report.outcome).toBe("blocked");
  });

  test("keeps testing-subpath failure distinct from an unresolved dependency", async () => {
    const workspaceRoot = await createWorkspace();
    const pluginRoot = await writePlugin(
      workspaceRoot,
      "partial-sdk",
      validPluginPackage("partial-sdk", {
        dependencies: { "@get-bb/plugin-sdk": "^0.4.1" },
        bb: { app: "./app.tsx" },
      }),
    );

    const report = await inspectPlugin({
      workspaceRoot,
      runBb: nativeRunner(pluginRoot),
      resolveHarness: async () => ({
        state: "testing-subpath-unavailable",
        version: "0.4.1",
        detail: "The installed SDK does not export testing/app.",
      }),
      resolveSdkPublication: async () => ({
        state: "published",
        version: "0.4.1",
        detail: "Published on npm.",
      }),
    });

    expect(report.modes.harness).toMatchObject({
      available: false,
      resolution: "testing-subpath-unavailable",
      sdkVersion: "0.4.1",
    });
    expect(
      report.checks.find((check) => check.id === "mode.harness")?.nextAction,
    ).toContain("testing subpaths");
  });

  test("returns deterministic discovery failures for zero and multiple plugins", async () => {
    const emptyRoot = await createWorkspace();
    const missing = await inspectPlugin({ workspaceRoot: emptyRoot });
    expect(missing).toMatchObject({
      schemaVersion: 1,
      state: "missing",
      outcome: "blocked",
    });

    const ambiguousRoot = await createWorkspace();
    await writePlugin(ambiguousRoot, "b", validPluginPackage("b"));
    await writePlugin(ambiguousRoot, "a", validPluginPackage("a"));
    const ambiguous = await inspectPlugin({ workspaceRoot: ambiguousRoot });
    expect(ambiguous.state).toBe("ambiguous");
    expect(ambiguous.candidates).toEqual(["plugins/a", "plugins/b"]);
  });

  test("keeps the JSON contract and check order stable", async () => {
    const workspaceRoot = await createWorkspace();
    const pluginRoot = await writePlugin(
      workspaceRoot,
      "stable",
      validPluginPackage("stable", {
        engines: { bb: ">=0.35", bbPluginSdk: "^0.4.1" },
      }),
    );
    const report = await inspectPlugin({
      workspaceRoot,
      runBb: nativeRunner(pluginRoot),
      resolveHarness: async () => unavailableHarness,
    });

    expect(Object.keys(report)).toEqual([
      "schemaVersion",
      "state",
      "outcome",
      "message",
      "candidates",
      "target",
      "checks",
      "modes",
      "native",
      "provenance",
      "trust",
    ]);
    expect(report.checks.map((check) => check.id)).toEqual([
      "manifest.read",
      "manifest.schema",
      "artifact.server",
      "artifact.app",
      "artifact.consistency",
      "native.bb-version",
      "native.plugin-list",
      "native.plugin-source",
      "native.connect",
      "engine.bb",
      "engine.plugin-sdk",
      "sdk.publication",
      "mode.fixture",
      "mode.harness",
      "mode.live",
      "trust.disclosure",
    ]);
  });
});
