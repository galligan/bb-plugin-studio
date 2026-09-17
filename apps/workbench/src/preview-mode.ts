import type { PluginInspection } from "@bb-plugin-studio/inspection";
import type { PreviewMode } from "@/workbench-state";

export interface LauncherPreviewCapability {
  available: boolean;
  detail: string;
}

export function previewModeCapabilities(
  inspection: PluginInspection | null,
): Record<PreviewMode, LauncherPreviewCapability> {
  const harness = inspection?.modes.harness;
  const live = inspection?.modes.live;

  return {
    fixture: {
      available: true,
      detail: "Deterministic approximation rendered by bb Plugin Studio.",
    },
    harness: {
      available: Boolean(harness?.available),
      detail: harness?.available
        ? `${harness.detail} Harness results are behavioral, not visual authority.`
        : (harness?.detail ?? "Inspecting the official SDK testing contract."),
    },
    live: {
      available: Boolean(live?.available),
      detail: live?.detail ?? "Inspecting native bb.",
    },
  };
}
