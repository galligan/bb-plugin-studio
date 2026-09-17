import { describe, expect, test } from "bun:test";
import {
  createPluginStudioRegistryDocument,
  PLUGIN_STUDIO_PACKAGE_NAME,
  PLUGIN_STUDIO_PACKAGE_VERSION,
} from "./plugin-studio-package-registry.ts";

describe("Studio package clean-room registry", () => {
  test("serves one exact engine-pinned release with strict integrity", () => {
    const document = createPluginStudioRegistryDocument({
      baseUrl: "http://127.0.0.1:1234",
      integrity: "sha512-exact",
      shasum: "exact-sha1",
    }) as {
      name: string;
      "dist-tags": Record<string, string>;
      versions: Record<string, Record<string, unknown>>;
    };

    expect(document.name).toBe(PLUGIN_STUDIO_PACKAGE_NAME);
    expect(document["dist-tags"]).toEqual({
      latest: PLUGIN_STUDIO_PACKAGE_VERSION,
    });
    expect(Object.keys(document.versions)).toEqual([
      PLUGIN_STUDIO_PACKAGE_VERSION,
    ]);
    expect(document.versions[PLUGIN_STUDIO_PACKAGE_VERSION]).toEqual({
      name: PLUGIN_STUDIO_PACKAGE_NAME,
      version: PLUGIN_STUDIO_PACKAGE_VERSION,
      license: "MIT",
      engines: { bb: ">=0.43.1", bbPluginSdk: "^0.4.87" },
      dist: {
        integrity: "sha512-exact",
        shasum: "exact-sha1",
        tarball:
          "http://127.0.0.1:1234/bb-plugin-studio/-/bb-plugin-studio-0.1.0-alpha.3.tgz",
      },
    });
  });
});
