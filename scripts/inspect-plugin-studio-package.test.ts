import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { gzipSync } from "node:zlib";
import {
  assertPluginStudioPackageFileSize,
  assertPluginStudioPackageMetadata,
  assertPluginStudioThirdPartyCoverage,
  expectedPluginStudioPackageBbVersion,
  gunzipPluginStudioTar,
  inspectPluginStudioPackageArchive,
  preflightPluginStudioTarBytes,
} from "./inspect-plugin-studio-package.ts";
import { PLUGIN_STUDIO_PACKAGE_ALLOWLIST } from "./plugin-studio-package-artifact.ts";
import { createCanonicalUstarFixture } from "./plugin-studio-package-ustar-fixture.ts";

function buildMetadata() {
  return {
    sdkMajor: 0,
    sdkVersion: "0.4.87",
    artifactFormatVersion: 1,
    pluginId: "studio",
    pluginVersion: "0.1.0-alpha.3",
    builtWith: { bbVersion: "0.43.1", pluginSdkVersion: "0.4.87" },
  };
}

function packageManifest() {
  return {
    name: "bb-plugin-studio",
    version: "0.1.0-alpha.3",
    description: "Build, inspect, and preview bb plugins.",
    homepage: "https://github.com/galligan/bb-plugin-studio#readme",
    repository: {
      type: "git",
      url: "git+https://github.com/galligan/bb-plugin-studio.git",
      directory: "plugins/studio",
    },
    bugs: { url: "https://github.com/galligan/bb-plugin-studio/issues" },
    keywords: ["bb", "plugin-development", "developer-tools"],
    type: "module",
    license: "MIT",
    bin: { "bb-plugin-studio": "./dist/cli.js" },
    publishConfig: { access: "public", tag: "alpha" },
    engines: { bb: ">=0.43.1", bbPluginSdk: "^0.4.87" },
    bb: {
      name: "Plugin Studio",
      description: "Build, inspect, and preview bb plugins.",
      branding: { icon: "Toolbox" },
      server: "./dist/server.js",
      app: "./dist/app.js",
      skills: ["./skills/plugin-studio"],
    },
    files: PLUGIN_STUDIO_PACKAGE_ALLOWLIST.filter(
      (file) => file !== "package.json",
    ),
  };
}

describe("Plugin Studio package inspection", () => {
  test("pins the current approved README and skill together", async () => {
    const [readme, skill] = await Promise.all([
      Bun.file(new URL("../plugins/studio/README.md", import.meta.url)).bytes(),
      Bun.file(
        new URL(
          "../plugins/studio/skills/plugin-studio/SKILL.md",
          import.meta.url,
        ),
      ).bytes(),
    ]);
    expect(createHash("sha256").update(readme).digest("hex")).toBe(
      "6f77c204f0b4798bccab6d31bffd69418ddf1a86ddccc679b6884759e0d35a1a",
    );
    expect(createHash("sha256").update(skill).digest("hex")).toBe(
      "e4346c408df02ebcd07c55f731866dbb580058829d118ad1c8d9799dc7a4f6b4",
    );
  });

  test("ships the canonical Plugin Studio package and plugin identities", () => {
    const manifest = packageManifest();
    expect(manifest.name).toBe("bb-plugin-studio");
    expect(manifest.bb.name).toBe("Plugin Studio");
    expect(manifest.bb.description).toBe(
      "Build, inspect, and preview bb plugins.",
    );
    expect(manifest.bb.skills).toEqual(["./skills/plugin-studio"]);
    expect(buildMetadata().pluginId).toBe("studio");
  });

  test("ships schema-v4 all-project guidance without stale admission controls", async () => {
    const [readme, skill] = await Promise.all([
      Bun.file(new URL("../plugins/studio/README.md", import.meta.url)).text(),
      Bun.file(
        new URL(
          "../plugins/studio/skills/plugin-studio/SKILL.md",
          import.meta.url,
        ),
      ).text(),
    ]);
    for (const document of [readme, skill]) {
      const prose = document.replace(/\s+/gu, " ");
      expect(prose).toContain("schema-v4");
      expect(prose).toContain("read-only status");
      expect(prose).toContain("all eligible bb-registered local projects");
      if (document === skill) {
        expect(prose).toContain(
          "On mount, Plugin Studio automatically performs",
        );
        expect(prose).toContain("contains no secondary runtime artifact");
        expect(prose).not.toContain("runtime artifact is dormant");
        expect(prose).not.toContain("On mount, Workbench automatically");
      }
      expect(prose).toContain("refresh icon");
      expect(prose).toContain("npm or Bun workspace configuration");
      expect(prose).toContain("bounded `pnpm-workspace.yaml`");
      expect(prose).toContain("expanded");
      expect(prose).toContain("plugin row");
      expect(prose).toContain("Preview remains unavailable under #70");
      expect(prose).toContain("does not execute target code");
      expect(prose).toMatch(/[Ss]ource paths/u);
      expect(prose).not.toContain("explicit admission");
      expect(prose).not.toContain("Select one eligible");
      expect(prose).not.toContain("status is idle");
      expect(prose).not.toContain("request stays idle");
    }
  });

  test("accepts only the pinned package and plugin build identities", () => {
    expect(() =>
      assertPluginStudioPackageMetadata(
        packageManifest(),
        buildMetadata(),
        buildMetadata(),
      ),
    ).not.toThrow();
  });

  test("pins normal inspection to the minimum build and permits one explicit candidate build", () => {
    expect(expectedPluginStudioPackageBbVersion({})).toBe("0.43.1");
    expect(
      expectedPluginStudioPackageBbVersion({
        BB_PLUGIN_STUDIO_EXPECTED_BB_VERSION: "0.38.0",
      }),
    ).toBe("0.38.0");
    expect(() =>
      expectedPluginStudioPackageBbVersion({
        BB_PLUGIN_STUDIO_EXPECTED_BB_VERSION: "latest",
      }),
    ).toThrow("stable semantic version");

    expect(() =>
      assertPluginStudioPackageMetadata(
        packageManifest(),
        {
          ...buildMetadata(),
          sdkVersion: "0.4.87",
          builtWith: { bbVersion: "0.38.0", pluginSdkVersion: "0.4.87" },
        },
        {
          ...buildMetadata(),
          sdkVersion: "0.4.87",
          builtWith: { bbVersion: "0.38.0", pluginSdkVersion: "0.4.87" },
        },
        "0.38.0",
      ),
    ).not.toThrow();
  });

  test("rejects source entrypoints and build-version drift", () => {
    expect(() =>
      assertPluginStudioPackageMetadata(
        {
          ...packageManifest(),
          bb: {
            ...packageManifest().bb,
            server: "./server.ts",
            app: "./app.tsx",
          },
        },
        buildMetadata(),
        buildMetadata(),
      ),
    ).toThrow("entrypoints");
    expect(() =>
      assertPluginStudioPackageMetadata(
        packageManifest(),
        {
          ...buildMetadata(),
          builtWith: { bbVersion: "0.37.0", pluginSdkVersion: "0.4.87" },
        },
        buildMetadata(),
      ),
    ).toThrow("build metadata");
  });

  test("reports branding drift separately from entrypoint drift", () => {
    expect(() =>
      assertPluginStudioPackageMetadata(
        {
          ...packageManifest(),
          bb: {
            ...packageManifest().bb,
            branding: { icon: "Wrench" },
          },
        },
        buildMetadata(),
        buildMetadata(),
      ),
    ).toThrow("Plugin Studio package branding");
  });

  test("rejects dependency drift in the local-verification manifest", () => {
    expect(() =>
      assertPluginStudioPackageMetadata(
        { ...packageManifest(), dependencies: { zod: "latest" } },
        buildMetadata(),
        buildMetadata(),
      ),
    ).toThrow("manifest keys differ");
  });

  test("rejects incomplete dependency notices", () => {
    const notices =
      "Radix Slot; Radix Tooltip; bundled Zod schema implementation";
    const licenses =
      "## @radix-ui/react-slot@1.3.3\n\n## @radix-ui/react-tooltip@1.2.16\n\n## zod@4.4.3\n";
    expect(() =>
      assertPluginStudioThirdPartyCoverage(notices, licenses),
    ).not.toThrow();
    expect(() =>
      assertPluginStudioThirdPartyCoverage(
        notices,
        licenses.replace("## @radix-ui/react-tooltip@1.2.16\n\n", ""),
      ),
    ).toThrow("do not cover");
    expect(() =>
      assertPluginStudioThirdPartyCoverage(
        notices.replace("Radix Tooltip; ", ""),
        licenses,
      ),
    ).toThrow("do not cover");
  });

  test("bounds package files and expanded gzip input", () => {
    expect(() =>
      assertPluginStudioPackageFileSize("dist/server.js", 17 * 1024 * 1024),
    ).toThrow("oversized");
    expect(() =>
      gunzipPluginStudioTar(gzipSync(Buffer.alloc(2_048)), 1_024),
    ).toThrow();
  });

  test("rejects crafted link and traversal headers before extraction", async () => {
    const tarExecutable = "/usr/bin/tar";
    const temporaryRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "studio-hostile-tar-"),
    );
    async function createArchive(
      name: string,
      entries: Parameters<typeof createCanonicalUstarFixture>[0],
    ): Promise<string> {
      const archive = path.join(temporaryRoot, `${name}.tgz`);
      await fs.writeFile(
        archive,
        gzipSync(createCanonicalUstarFixture(entries)),
      );
      return archive;
    }
    try {
      const symlink = await createArchive("symlink", [
        { name: "package/symlink", type: "2", linkName: "file" },
      ]);
      const hardlink = await createArchive("hardlink", [
        { name: "package/hardlink", type: "1", linkName: "package/file" },
      ]);
      const traversal = await createArchive("traversal", [
        { name: "../escape", contents: "fixture" },
      ]);
      const longname = await createArchive("longname", [
        {
          name: "././@LongLink",
          type: "L",
          contents: `${"package/"}${"a".repeat(120)}\0`,
        },
      ]);
      await expect(
        inspectPluginStudioPackageArchive(symlink, tarExecutable),
      ).rejects.toThrow("unsupported raw header type");
      await expect(
        inspectPluginStudioPackageArchive(hardlink, tarExecutable),
      ).rejects.toThrow("unsupported raw header type");
      await expect(
        inspectPluginStudioPackageArchive(traversal, tarExecutable),
      ).rejects.toThrow("unsafe raw header");
      await expect(
        inspectPluginStudioPackageArchive(longname, tarExecutable),
      ).rejects.toThrow("unsupported raw header type");
      expect(
        await fs
          .access(path.join(temporaryRoot, "escape"))
          .then(() => true)
          .catch(() => false),
      ).toBe(false);
    } finally {
      await fs.rm(temporaryRoot, { recursive: true, force: true });
    }
  });

  test("rejects a second gzip member and noncanonical tar endings", async () => {
    const expanded = createCanonicalUstarFixture(
      PLUGIN_STUDIO_PACKAGE_ALLOWLIST.map((file) => ({
        name: `package/${file}`,
        contents: file,
      })),
    );
    const valid = gzipSync(expanded);
    expect(preflightPluginStudioTarBytes(valid)).toHaveLength(12);
    expect(() =>
      preflightPluginStudioTarBytes(
        Buffer.concat([valid, gzipSync("SECRET_SOURCE_PAYLOAD")]),
      ),
    ).toThrow("canonical end");
    expect(() =>
      preflightPluginStudioTarBytes(gzipSync(expanded.subarray(0, -512))),
    ).toThrow("canonical end");
    expect(() =>
      preflightPluginStudioTarBytes(
        gzipSync(Buffer.concat([expanded, Buffer.alloc(512)])),
      ),
    ).toThrow("canonical end");
  });
});
