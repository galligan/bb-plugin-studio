import { describe, expect, test } from "bun:test";
import {
  assertPluginStudioPackagePaths,
  createPluginStudioStagedManifest,
  PLUGIN_STUDIO_PACKAGE_ALLOWLIST,
  stripPluginStudioBundleSourceNames,
} from "./plugin-studio-package-artifact.ts";

describe("Studio package artifact", () => {
  test("accepts only the native plugin and source CLI payload", () => {
    expect(PLUGIN_STUDIO_PACKAGE_ALLOWLIST).toHaveLength(12);
    expect(PLUGIN_STUDIO_PACKAGE_ALLOWLIST).not.toContain("BUN_LICENSE.md");
    expect(PLUGIN_STUDIO_PACKAGE_ALLOWLIST.join("\n")).not.toContain(
      "runtime/",
    );
    expect(() =>
      assertPluginStudioPackagePaths(PLUGIN_STUDIO_PACKAGE_ALLOWLIST),
    ).not.toThrow();
    expect(() =>
      assertPluginStudioPackagePaths([
        ...PLUGIN_STUDIO_PACKAGE_ALLOWLIST,
        "runtime/darwin-arm64/bb-plugin-studio-runtime",
      ]),
    ).toThrow("allowlist mismatch");
  });

  test("rewrites the staged manifest to built public entrypoints", () => {
    const staged = createPluginStudioStagedManifest({
      name: "bb-plugin-studio",
      version: "0.1.0-alpha.3",
      description: "Build, inspect, and preview bb plugins.",
      homepage: "https://example.com",
      repository: { type: "git", url: "https://example.com/repo.git" },
      bugs: { url: "https://example.com/issues" },
      keywords: ["bb"],
      type: "module",
      license: "MIT",
      bin: { "bb-plugin-studio": "./dist/cli.js" },
      publishConfig: { access: "public", tag: "alpha" },
      engines: { bb: ">=0.43.1", bbPluginSdk: "^0.4.87" },
      bb: {
        name: "Plugin Studio",
        server: "./server.ts",
        app: "./app.tsx",
      },
    });
    expect(staged.bb.server).toBe("./dist/server.js");
    expect(staged.bb.app).toBe("./dist/app.js");
    expect(staged.files).toEqual(
      PLUGIN_STUDIO_PACKAGE_ALLOWLIST.filter((file) => file !== "package.json"),
    );
  });

  test("strips workspace source comments from bundles", () => {
    expect(
      stripPluginStudioBundleSourceNames("// src/private.ts\nexport {};\n"),
    ).toBe("export {};\n");
  });
});
