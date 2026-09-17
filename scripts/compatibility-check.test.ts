import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { surfaceCatalog } from "../apps/workbench/src/surface-catalog";
import {
  evaluateCompatibility,
  formatCompatibilityReport,
  observeBbVersion,
  parseCompatibilityTarget,
  projectCompatibilityTargetToRelease,
  resolveCompatibilityDecisionPath,
  validCompatibilityDecision,
  type CompatibilityObservations,
  type CompatibilityTarget,
} from "./compatibility-check";

describe("native bb version probe", () => {
  test("sanitizes re-exec selectors and parses the bounded command result", async () => {
    const version = await observeBbVersion(
      "/fake/bb",
      async (executable, args, _cwd, options) => {
        expect(executable).toBe("/fake/bb");
        expect(args).toEqual(["--version"]);
        expect(options?.env?.BB_CLI).toBeUndefined();
        expect(options?.env?.BB_CLI_REEXEC).toBeUndefined();
        return { stdout: "bb 0.36.0\n", stderr: "", exitCode: 0 };
      },
    );
    expect(version).toBe("0.36.0");
  });

  test("reports bounded native failures instead of accepting partial output", async () => {
    await expect(
      observeBbVersion("/fake/bb", async () => ({
        stdout: "0.36.0\n",
        stderr: "Native command timed out after 10000ms.",
        exitCode: 124,
      })),
    ).rejects.toThrow("timed out");
  });

  test.each(["spawn bb ENOENT", 'Executable not found in $PATH: "bb"'])(
    "falls back to the workspace pin for missing executable: %s",
    async (stderr) => {
      const candidates: string[] = [];
      const version = await observeBbVersion("", async (executable) => {
        candidates.push(executable);
        return executable === "bb"
          ? { stdout: "", stderr, exitCode: 1 }
          : { stdout: "0.36.0\n", stderr: "", exitCode: 0 };
      });
      expect(candidates).toEqual([
        "bb",
        path.resolve("plugins/studio/node_modules/.bin/bb"),
      ]);
      expect(version).toBe("0.36.0");
    },
  );
});

const target: CompatibilityTarget = {
  schemaVersion: 2,
  acceptedDecision: null,
  target: {
    minimumBbVersion: "0.36.0",
    verifiedThroughBbVersion: "0.37.0",
    pluginSdkVersion: "0.4.1",
    pluginSdkEngineRange: "^0.4.1",
    upstreamRef: "desktop-v0.37.0",
  },
  publicArtifacts: {
    appPackageUrl:
      "https://raw.githubusercontent.com/get-bb/bb/desktop-v0.37.0/apps/app/package.json",
    pluginSdkPackageUrl:
      "https://raw.githubusercontent.com/get-bb/bb/desktop-v0.37.0/packages/plugin-sdk/package.json",
    themeCssUrl:
      "https://raw.githubusercontent.com/get-bb/bb/desktop-v0.37.0/apps/app/src/components/ui/theme.css",
    themeCssSha256: "c".repeat(64),
    declarations: {
      backend: {
        url: "https://raw.githubusercontent.com/get-bb/bb/desktop-v0.37.0/packages/plugin-sdk/bundled-types/bb-plugin-sdk.d.ts",
        sha256: "d".repeat(64),
      },
      app: {
        url: "https://raw.githubusercontent.com/get-bb/bb/desktop-v0.37.0/packages/plugin-sdk/bundled-types/bb-plugin-sdk-app.d.ts",
        sha256: "e".repeat(64),
      },
    },
    registry: {
      url: "https://raw.githubusercontent.com/get-bb/bb/desktop-v0.37.0/packages/plugin-registry/r/index.json",
      sha256: "a".repeat(64),
      items: ["button"],
    },
  },
  dependencies: [
    {
      id: "icons",
      package: "icons",
      localRange: "^1.0.0",
      upstreamRange: "^1.0.0",
    },
  ],
  measuredTokens: [
    {
      name: "--row-height",
      localValue: "1rem",
      upstreamValue: "1rem",
      source: "public-theme-css",
    },
  ],
  registrationPaths: ["slots.example"],
};

function matchingObservations(): CompatibilityObservations {
  return {
    bbVersion: "0.36.0",
    pluginSdkEngineRange: "^0.4.1",
    pluginSdkVersion: "0.4.1",
    registrySha256: "a".repeat(64),
    registryItems: ["button"],
    themeCssSha256: "c".repeat(64),
    declarationSha256: { backend: "d".repeat(64), app: "e".repeat(64) },
    dependencies: { icons: { local: "^1.0.0", upstream: "^1.0.0" } },
    tokens: { "--row-height": { local: "1rem", upstream: "1rem" } },
    registrationPaths: ["slots.example"],
  };
}

describe("compatibility evaluation", () => {
  test("passes the exact minimum supported host", () => {
    const report = evaluateCompatibility(target, matchingObservations());
    expect(report.outcome).toBe("pass");
    expect(report.checks.every(({ status }) => status === "pass")).toBe(true);
  });

  test("passes a host at the verified-through boundary", () => {
    const observed = matchingObservations();
    observed.bbVersion = "0.37.0";
    const report = evaluateCompatibility(target, observed);
    expect(report.outcome).toBe("pass");
    expect(report.checks.find(({ id }) => id === "bb.version")).toMatchObject({
      status: "pass",
      observed: "0.37.0",
    });
  });

  test("fails a host below the minimum supported version", () => {
    const observed = matchingObservations();
    observed.bbVersion = "0.35.9";
    const report = evaluateCompatibility(target, observed);
    expect(report.outcome).toBe("fail");
    expect(report.checks.find(({ id }) => id === "bb.version")).toMatchObject({
      status: "fail",
      observed: "0.35.9",
    });
  });

  test("reports a newer-than-verified host without failing", () => {
    const observed = matchingObservations();
    observed.bbVersion = "0.38.0";
    const report = evaluateCompatibility(target, observed);
    expect(report.outcome).toBe("pass");
    expect(report.checks.find(({ id }) => id === "bb.version")).toMatchObject({
      status: "notice",
      observed: "0.38.0",
      nextAction: expect.stringContaining("audit"),
    });
  });

  test("fails when release identity and immutable URLs diverge", () => {
    const incoherent: CompatibilityTarget = {
      ...target,
      target: { ...target.target, upstreamRef: "desktop-v9.9.9" },
    };
    expect(
      evaluateCompatibility(incoherent, matchingObservations()).checks.find(
        ({ id }) => id === "target.release-coherence",
      ),
    ).toMatchObject({
      status: "fail",
      observed: expect.arrayContaining([expect.any(String)]),
    });
  });

  test("accepts published SDK declaration URLs on unpkg", () => {
    const withUnpkg: CompatibilityTarget = {
      ...target,
      target: {
        ...target.target,
        pluginSdkVersion: "0.4.87",
        pluginSdkEngineRange: "^0.4.87",
      },
      publicArtifacts: {
        ...target.publicArtifacts,
        declarations: {
          backend: {
            url: "https://unpkg.com/@get-bb/plugin-sdk@0.4.87/bundled-types/bb-plugin-sdk.d.ts",
            sha256: "d".repeat(64),
          },
          app: {
            url: "https://unpkg.com/@get-bb/plugin-sdk@0.4.87/bundled-types/bb-plugin-sdk-app.d.ts",
            sha256: "e".repeat(64),
          },
        },
      },
    };
    expect(
      parseCompatibilityTarget(withUnpkg).publicArtifacts.declarations.backend
        .url,
    ).toContain("unpkg.com");
    expect(
      evaluateCompatibility(withUnpkg, {
        ...matchingObservations(),
        pluginSdkVersion: "0.4.87",
        pluginSdkEngineRange: "^0.4.87",
      }).checks.find(({ id }) => id === "target.release-coherence"),
    ).toMatchObject({ status: "pass", observed: [] });
  });

  test("rejects unpkg declaration URLs that do not pin the recorded SDK version", () => {
    expect(() =>
      parseCompatibilityTarget({
        ...target,
        publicArtifacts: {
          ...target.publicArtifacts,
          declarations: {
            ...target.publicArtifacts.declarations,
            backend: {
              url: "https://unpkg.com/@get-bb/plugin-sdk@0.4.99/bundled-types/bb-plugin-sdk.d.ts",
              sha256: "d".repeat(64),
            },
          },
        },
      }),
    ).toThrow(/immutable public/);
  });

  test.each([
    [
      "SDK engine",
      (value: CompatibilityObservations) =>
        (value.pluginSdkEngineRange = "^0.5.0"),
      "plugin-sdk.engine-range",
    ],
    [
      "SDK version",
      (value: CompatibilityObservations) => (value.pluginSdkVersion = "0.5.0"),
      "plugin-sdk.public-version",
    ],
    [
      "registry digest",
      (value: CompatibilityObservations) => (value.registrySha256 = "def"),
      "component-registry.sha256",
    ],
    [
      "registry items",
      (value: CompatibilityObservations) =>
        (value.registryItems = ["button", "card"]),
      "component-registry.items",
    ],
    [
      "full theme",
      (value: CompatibilityObservations) =>
        (value.themeCssSha256 = "theme-def"),
      "theme.sha256",
    ],
    [
      "backend declarations",
      (value: CompatibilityObservations) =>
        (value.declarationSha256.backend = "backend-def"),
      "plugin-sdk.declaration.backend.sha256",
    ],
    [
      "app declarations",
      (value: CompatibilityObservations) =>
        (value.declarationSha256.app = "app-def"),
      "plugin-sdk.declaration.app.sha256",
    ],
    [
      "local dependency",
      (value: CompatibilityObservations) =>
        (value.dependencies.icons!.local = "^2.0.0"),
      "dependency.icons.local",
    ],
    [
      "upstream dependency",
      (value: CompatibilityObservations) =>
        (value.dependencies.icons!.upstream = "^2.0.0"),
      "dependency.icons.upstream",
    ],
    [
      "local token",
      (value: CompatibilityObservations) =>
        (value.tokens["--row-height"]!.local = "2rem"),
      "token.--row-height.local",
    ],
    [
      "upstream token",
      (value: CompatibilityObservations) =>
        (value.tokens["--row-height"]!.upstream = "2rem"),
      "token.--row-height.upstream",
    ],
    [
      "registration paths",
      (value: CompatibilityObservations) =>
        (value.registrationPaths = ["slots.new"]),
      "plugin-registration.paths",
    ],
  ])("reports precise %s drift", (_name, mutate, checkId) => {
    const observed = matchingObservations();
    mutate(observed);
    const report = evaluateCompatibility(target, observed);
    expect(report.outcome).toBe("fail");
    expect(report.checks.find(({ id }) => id === checkId)).toMatchObject({
      status: "fail",
      nextAction: expect.any(String),
    });
  });

  test("fails closed when a public probe is unverified", () => {
    const observed = matchingObservations();
    observed.registrySha256 = undefined;
    observed.registryItems = undefined;
    observed.registryError = "network unavailable";
    const report = evaluateCompatibility(target, observed);
    expect(report.outcome).toBe("fail");
    expect(
      report.checks.filter(({ id }) => id.startsWith("component-registry")),
    ).toEqual([
      expect.objectContaining({
        status: "unverified",
        observed: "network unavailable",
      }),
      expect.objectContaining({
        status: "unverified",
        observed: "network unavailable",
      }),
    ]);
  });

  test("formats a concise actionable terminal report", () => {
    const observed = matchingObservations();
    observed.bbVersion = "0.34.0";
    const output = formatCompatibilityReport(
      evaluateCompatibility(target, observed),
    );
    expect(output).toContain("bb Plugin Studio compatibility: fail");
    expect(output).toContain("✗ bb.version: fail");
    expect(output).toContain("next:");
  });
});

describe("explicit compatibility decisions", () => {
  test("requires accepted status, owner, reason, and an unexpired date", () => {
    const now = new Date("2026-08-07T12:00:00Z");
    expect(
      validCompatibilityDecision(
        "# Compatibility Decision\nStatus: accepted\nOwner: Matt\nReason: bounded migration\nExpires: 2026-08-08\n",
        now,
      ),
    ).toBe(true);
    expect(
      validCompatibilityDecision(
        "Status: accepted\nOwner: Matt\nReason: bounded migration\nExpires: 2026-08-06\n",
        now,
      ),
    ).toBe(false);
    expect(validCompatibilityDecision("Status: accepted\n", now)).toBe(false);
    expect(
      validCompatibilityDecision(
        "Status: accepted\nOwner: Matt\nReason: invalid date\nExpires: 9999-99-99\n",
        now,
      ),
    ).toBe(false);
  });

  test("requires a target-declared repository decision path", () => {
    const withDecision = {
      ...target,
      acceptedDecision: "compatibility/decisions/bounded.md",
    };
    expect(() =>
      resolveCompatibilityDecisionPath(withDecision, "/dev/stdin"),
    ).toThrow("acceptedDecision");
    expect(
      resolveCompatibilityDecisionPath(
        withDecision,
        "compatibility/decisions/bounded.md",
      ),
    ).toEndWith("/compatibility/decisions/bounded.md");
  });
});

describe("target validation", () => {
  test("rejects removed guard families and non-public artifact URLs", () => {
    expect(() =>
      parseCompatibilityTarget({ ...target, dependencies: [] }),
    ).toThrow("dependencies");
    expect(() =>
      parseCompatibilityTarget({
        ...target,
        publicArtifacts: {
          ...target.publicArtifacts,
          appPackageUrl: "https://example.test/app.json",
        },
      }),
    ).toThrow("immutable public");
  });

  test("rejects malformed immutable artifact hashes", () => {
    expect(() =>
      parseCompatibilityTarget({
        ...target,
        publicArtifacts: {
          ...target.publicArtifacts,
          themeCssSha256: "not-a-sha256",
        },
      }),
    ).toThrow("SHA-256");
  });
});

test("projects immutable probe URLs to a candidate without accepting new hashes", () => {
  const projected = projectCompatibilityTargetToRelease(target, "0.38.0");
  expect(projected.target).toMatchObject({
    minimumBbVersion: "0.36.0",
    verifiedThroughBbVersion: "0.38.0",
    upstreamRef: "desktop-v0.38.0",
  });
  expect(projected.publicArtifacts.themeCssUrl).toContain("desktop-v0.38.0");
  expect(projected.publicArtifacts.declarations.backend.url).toContain(
    "desktop-v0.38.0",
  );
  expect(projected.publicArtifacts.themeCssSha256).toBe("c".repeat(64));
  expect(projected.publicArtifacts.declarations.backend.sha256).toBe(
    "d".repeat(64),
  );
});

test("the checked-in target mirrors the catalog registration paths", async () => {
  const text = await readFile(
    path.resolve("compatibility/bb-target.json"),
    "utf8",
  );
  const checkedTarget = parseCompatibilityTarget(JSON.parse(text));
  expect(checkedTarget.registrationPaths).toEqual(
    surfaceCatalog.map(({ registrationPath }) => registrationPath),
  );
});

test("keeps local checks valid when only an upstream probe fails", () => {
  const observed = matchingObservations();
  observed.dependencies.icons = {
    local: "^1.0.0",
    upstreamError: "public app package unavailable",
  };
  observed.tokens["--row-height"] = {
    local: "1rem",
    upstreamError: "public theme unavailable",
  };
  const checks = evaluateCompatibility(target, observed).checks;
  expect(checks.find(({ id }) => id === "dependency.icons.local")?.status).toBe(
    "pass",
  );
  expect(
    checks.find(({ id }) => id === "dependency.icons.upstream")?.status,
  ).toBe("unverified");
  expect(
    checks.find(({ id }) => id === "token.--row-height.local")?.status,
  ).toBe("pass");
  expect(
    checks.find(({ id }) => id === "token.--row-height.upstream")?.status,
  ).toBe("unverified");
});
