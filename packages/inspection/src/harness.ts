import { promises as fs } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import type { HarnessResolution, SdkPublicationResolution } from "./types.ts";
import type { PluginPackageJson } from "./manifest.ts";

export const PLUGIN_SDK_PACKAGE = "@get-bb/plugin-sdk";
const PLUGIN_SDK_TESTING = `${PLUGIN_SDK_PACKAGE}/testing`;
const PLUGIN_SDK_TESTING_APP = `${PLUGIN_SDK_PACKAGE}/testing/app`;
const PLUGIN_SDK_REGISTRY_URL =
  "https://registry.npmjs.org/@get-bb%2Fplugin-sdk";

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function recordOrNull(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

async function readJson(filePath: string): Promise<unknown> {
  return JSON.parse(await fs.readFile(filePath, "utf8")) as unknown;
}

async function packageVersionFromResolvedFile(
  resolvedFile: string,
): Promise<string | null> {
  let current = path.dirname(resolvedFile);
  for (;;) {
    const packagePath = path.join(current, "package.json");
    try {
      const packageJson = recordOrNull(await readJson(packagePath));
      if (packageJson?.name === PLUGIN_SDK_PACKAGE) {
        return stringOrNull(packageJson.version);
      }
    } catch {
      // Walk upward until the package root is found.
    }
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function declaresPluginSdk(packageJson: PluginPackageJson): boolean {
  return [
    packageJson.dependencies,
    packageJson.devDependencies,
    packageJson.optionalDependencies,
    packageJson.peerDependencies,
  ].some((value) => recordOrNull(value)?.[PLUGIN_SDK_PACKAGE] !== undefined);
}

export async function resolveHarness(
  pluginRoot: string,
  packageJson: PluginPackageJson,
): Promise<HarnessResolution> {
  if (!declaresPluginSdk(packageJson)) {
    return {
      state: "package-not-declared",
      version: null,
      detail: `The selected plugin does not declare ${PLUGIN_SDK_PACKAGE}.`,
    };
  }
  const requireFromPlugin = createRequire(
    path.join(pluginRoot, "package.json"),
  );
  const resolveRequiredSubpath = (specifier: string) => {
    try {
      return { file: requireFromPlugin.resolve(specifier), error: null };
    } catch (error) {
      return { file: null, error };
    }
  };
  const frontendHarness = resolveRequiredSubpath(PLUGIN_SDK_TESTING_APP);
  const serverHarness = resolveRequiredSubpath(PLUGIN_SDK_TESTING);
  if (frontendHarness.file && serverHarness.file) {
    return {
      state: "available",
      version:
        (await packageVersionFromResolvedFile(frontendHarness.file)) ??
        (await packageVersionFromResolvedFile(serverHarness.file)),
      detail: "The official selected-plugin testing subpaths resolved.",
    };
  }

  const resolvedHarness = frontendHarness.file ?? serverHarness.file;
  if (resolvedHarness) {
    return {
      state: "testing-subpath-unavailable",
      version: await packageVersionFromResolvedFile(resolvedHarness),
      detail: `${PLUGIN_SDK_PACKAGE} resolves locally, but both testing subpaths do not: ${[
        frontendHarness.error,
        serverHarness.error,
      ]
        .filter((error) => error !== null)
        .map((error) =>
          error instanceof Error ? error.message : String(error),
        )
        .join("; ")}`,
    };
  }

  try {
    const sdkRuntime = requireFromPlugin.resolve(PLUGIN_SDK_PACKAGE);
    return {
      state: "testing-subpath-unavailable",
      version: await packageVersionFromResolvedFile(sdkRuntime),
      detail: `${PLUGIN_SDK_PACKAGE} resolves locally, but its testing subpaths do not: ${[
        frontendHarness.error,
        serverHarness.error,
      ]
        .map((error) =>
          error instanceof Error ? error.message : String(error),
        )
        .join("; ")}`,
    };
  } catch (error) {
    return {
      state: "dependency-unresolved",
      version: null,
      detail: `${PLUGIN_SDK_PACKAGE} is declared but cannot be resolved locally: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export async function resolveSdkPublication(): Promise<SdkPublicationResolution> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetch(PLUGIN_SDK_REGISTRY_URL, {
      headers: { Accept: "application/vnd.npm.install-v1+json" },
      signal: controller.signal,
    });
    if (response.status === 404) {
      return {
        state: "missing",
        version: null,
        detail: `The npm registry does not currently publish ${PLUGIN_SDK_PACKAGE}.`,
      };
    }
    if (!response.ok) {
      return {
        state: "unknown",
        version: null,
        detail: `The npm registry returned HTTP ${response.status}; publication status is unknown.`,
      };
    }
    const body = recordOrNull((await response.json()) as unknown);
    const version = stringOrNull(recordOrNull(body?.["dist-tags"])?.latest);
    return version
      ? {
          state: "published",
          version,
          detail: `The npm registry publishes ${PLUGIN_SDK_PACKAGE} ${version}.`,
        }
      : {
          state: "unknown",
          version: null,
          detail: "The npm registry response had no latest dist-tag.",
        };
  } catch (error) {
    return {
      state: "unknown",
      version: null,
      detail: `The npm registry could not be checked: ${error instanceof Error ? error.message : String(error)}`,
    };
  } finally {
    clearTimeout(timeout);
  }
}
