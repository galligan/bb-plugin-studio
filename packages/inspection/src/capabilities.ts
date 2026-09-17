import { satisfies, valid, validRange } from "semver";
import { PLUGIN_SDK_PACKAGE } from "./harness.ts";
import type { InstalledPlugin } from "./native.ts";
import type {
  HarnessResolution,
  InspectionCheck,
  SdkPublicationResolution,
} from "./types.ts";

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

export function engineCheck(
  id: "engine.bb" | "engine.plugin-sdk",
  label: string,
  range: string | null,
  actual: string | null,
): InspectionCheck {
  if (!range) {
    return {
      id,
      status: "warning",
      summary: `${label} engine range is not declared.`,
      nextAction: `Declare an honest ${label} range in package.json engines.`,
    };
  }
  if (!validRange(range)) {
    return {
      id,
      status: "fail",
      summary: `${label} engine range is invalid: ${range}.`,
      nextAction: `Replace ${range} with a valid semver range.`,
    };
  }
  const parsedActual = actual ? valid(actual.replace(/^v/, "")) : null;
  if (!parsedActual) {
    return {
      id,
      status: "unavailable",
      summary: `${label} compatibility cannot be evaluated.`,
      nextAction: `Make ${label} version metadata available, then rerun inspection.`,
    };
  }
  if (!satisfies(parsedActual, range)) {
    return {
      id,
      status: "fail",
      summary: `${label} ${parsedActual} does not satisfy ${range}.`,
      nextAction: `Use a compatible ${label} version or update the declared range after validation.`,
    };
  }
  return {
    id,
    status: "pass",
    summary: `${label} ${parsedActual} satisfies ${range}.`,
  };
}

export function harnessCheck(
  harness: HarnessResolution,
  publication: SdkPublicationResolution | null,
): InspectionCheck {
  if (harness.state === "headless") {
    return {
      id: "mode.harness",
      status: "info",
      summary: "Harness mode is not applicable to this headless plugin.",
      detail: harness.detail,
    };
  }
  if (harness.state === "available") {
    return {
      id: "mode.harness",
      status: "pass",
      summary: `Harness mode is available${harness.version ? ` with SDK ${harness.version}` : ""}.`,
    };
  }
  if (publication?.state === "missing") {
    return {
      id: "mode.harness",
      status: "unavailable",
      summary: `Harness mode is unavailable because ${PLUGIN_SDK_PACKAGE} is not published.`,
      detail: `${publication.detail} ${harness.detail}`,
      nextAction: `Install the published ${PLUGIN_SDK_PACKAGE} package in the selected plugin; do not use a local fallback.`,
    };
  }
  if (harness.state === "dependency-unresolved") {
    return {
      id: "mode.harness",
      status: "unavailable",
      summary:
        "Harness mode is unavailable because the local SDK dependency cannot resolve.",
      detail: harness.detail,
      nextAction: `Repair the selected plugin's declared ${PLUGIN_SDK_PACKAGE} dependency.`,
    };
  }
  if (harness.state === "testing-subpath-unavailable") {
    return {
      id: "mode.harness",
      status: "unavailable",
      summary:
        "Harness mode is unavailable because local testing subpaths do not resolve.",
      detail: harness.detail,
      nextAction:
        "Use an official SDK release that exports both testing subpaths.",
    };
  }
  return {
    id: "mode.harness",
    status: "unavailable",
    summary: `Harness mode is unavailable because the plugin does not declare ${PLUGIN_SDK_PACKAGE}.`,
    detail: harness.detail,
    nextAction:
      publication?.state === "published"
        ? `Declare and install the published ${PLUGIN_SDK_PACKAGE} package in the selected plugin.`
        : "Check SDK publication, then declare the official package when available.",
  };
}

export function publicationCheck(
  appEntry: string | null,
  publication: SdkPublicationResolution | null,
): InspectionCheck {
  if (!appEntry) {
    return {
      id: "sdk.publication",
      status: "info",
      summary: "SDK publication is not applicable to this headless plugin.",
    };
  }
  if (publication?.state === "published") {
    return {
      id: "sdk.publication",
      status: "pass",
      summary: `${PLUGIN_SDK_PACKAGE} ${publication.version ?? "is"} published.`,
    };
  }
  if (publication?.state === "missing") {
    return {
      id: "sdk.publication",
      status: "unavailable",
      summary: `The official ${PLUGIN_SDK_PACKAGE} package is not published.`,
      detail: publication.detail,
      nextAction: `Confirm ${PLUGIN_SDK_PACKAGE} is published, then install it in the selected plugin.`,
    };
  }
  return {
    id: "sdk.publication",
    status: "warning",
    summary: "SDK publication status is unknown.",
    detail: publication?.detail,
    nextAction:
      "Retry with npm registry access; do not substitute sibling or copied SDK code.",
  };
}

export function liveCapability(
  appEntry: string | null,
  installed: InstalledPlugin | null,
): { available: boolean; detail: string; nextAction?: string } {
  if (!appEntry) {
    return {
      available: false,
      detail:
        "This plugin is headless; Live frontend validation is not applicable.",
    };
  }
  const pluginId = stringOrNull(installed?.id);
  if (!pluginId) {
    return {
      available: false,
      detail: "The selected frontend plugin is not installed in native bb.",
      nextAction:
        "Install the plugin by path with native bb before Live validation.",
    };
  }
  const status = stringOrNull(installed?.status);
  if (installed?.enabled !== true || status !== "running") {
    const actions: Record<string, string> = {
      disabled: `Enable plugin ${pluginId} in native bb before Live validation.`,
      "needs-configuration": `Configure plugin ${pluginId}, then reload it with native bb.`,
      incompatible: `Rebuild or update plugin ${pluginId} with a compatible native bb SDK.`,
      error: `Inspect native bb's error for plugin ${pluginId}, fix it, and reload the plugin.`,
      missing: `Repair or reinstall plugin ${pluginId} with native bb.`,
      degraded: `Resolve native bb's degraded status for plugin ${pluginId} before Live validation.`,
    };
    return {
      available: false,
      detail: `Plugin ${pluginId} is ${status ?? "not runnable"} in native bb.`,
      nextAction:
        actions[status ?? ""] ??
        `Make plugin ${pluginId} enabled and running in native bb.`,
    };
  }
  const app = recordOrNull(installed.app);
  const bundle = recordOrNull(app?.bundle);
  if (app?.hasApp !== true || !bundle) {
    return {
      available: false,
      detail: `Plugin ${pluginId} has no loadable native app bundle.`,
      nextAction:
        "Run `bb plugin build`, then reload the plugin with native bb.",
    };
  }
  if (bundle.compatible !== true) {
    return {
      available: false,
      detail: `Plugin ${pluginId}'s native app bundle is SDK-incompatible.`,
      nextAction:
        "Rebuild the app bundle with the active native bb SDK, then reload the plugin.",
    };
  }
  return {
    available: true,
    detail: `Plugin ${pluginId} is running with a compatible native app bundle.`,
  };
}
