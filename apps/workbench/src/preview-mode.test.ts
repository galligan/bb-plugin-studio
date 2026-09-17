import { describe, expect, test } from "bun:test";
import type { PluginInspection } from "@bb-plugin-studio/inspection";
import { previewModeCapabilities } from "./preview-mode";

function inspectionWithHarness(available: boolean): PluginInspection {
  return {
    schemaVersion: 1,
    state: "ready",
    outcome: "ready",
    message: null,
    candidates: [],
    target: null,
    checks: [],
    modes: {
      fixture: { available: true, detail: "Fixture." },
      harness: {
        available,
        detail: available ? "Official contract resolves." : "Unavailable.",
        sdkVersion: available ? "0.4.1" : null,
        resolution: available ? "available" : "dependency-unresolved",
        publication: available ? "published" : "unknown",
        publishedVersion: available ? "0.4.1" : null,
      },
      live: {
        available: true,
        detail: "Native bb is ready.",
        pluginId: "example",
        status: "running",
        sourceKind: "path",
        url: "https://example.getbb.app",
      },
    },
    native: { bbVersion: "0.35.1", connectUrl: null },
    provenance: null,
    trust: {
      model: "full-trust-local-code",
      entrypoints: [],
      skills: [],
      themes: [],
      hasSettings: null,
      capabilities: [],
      services: [],
      undisclosedAccess: [],
      detail: "Local code.",
    },
  };
}

describe("launcher preview capabilities", () => {
  test("exposes Harness when the official testing subpaths resolve", () => {
    const capabilities = previewModeCapabilities(inspectionWithHarness(true));

    expect(capabilities.harness).toEqual({
      available: true,
      detail:
        "Official contract resolves. Harness results are behavioral, not visual authority.",
    });
  });

  test("keeps Harness unavailable when the official contract does not resolve", () => {
    const capabilities = previewModeCapabilities(inspectionWithHarness(false));

    expect(capabilities.harness).toEqual({
      available: false,
      detail: "Unavailable.",
    });
  });

  test("exposes proven native live availability without changing Fixture", () => {
    const capabilities = previewModeCapabilities(inspectionWithHarness(false));

    expect(capabilities.fixture.available).toBe(true);
    expect(capabilities.live).toEqual({
      available: true,
      detail: "Native bb is ready.",
    });
  });
});
