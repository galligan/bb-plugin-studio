import { BbShell } from "@/components/BbShell";
import type { CatalogSelection } from "@/surface-catalog";
import type {
  PreviewMode,
  PreviewTheme,
  PreviewViewport,
} from "@/workbench-state";

interface PreviewCanvasProps {
  selection: CatalogSelection;
  mode: PreviewMode;
  theme: PreviewTheme;
  viewport: PreviewViewport;
}

export function PreviewCanvas({
  selection,
  mode,
  theme,
  viewport,
}: PreviewCanvasProps) {
  if (mode === "fixture") {
    return <BbShell selection={selection} theme={theme} viewport={viewport} />;
  }

  return (
    <main
      className={`bb-mode-handoff bb-theme-${theme}`}
      data-viewport={viewport}
      aria-label={`${mode === "live" ? "Live bb" : "Harness"} handoff`}
    >
      <section>
        <span>{mode === "live" ? "Live bb" : "Harness"}</span>
        <h1>
          {mode === "live"
            ? "Continue in native bb"
            : "Official testing contracts resolved"}
        </h1>
        <p>
          {mode === "live"
            ? "Live bb is the visual authority. bb Plugin Studio does not fetch, embed, or reproduce the Connect runtime. Use the launcher handoff to open this plugin in bb."
            : "Harness validates public SDK behavior through the selected plugin's @get-bb/plugin-sdk/testing contracts. It does not reproduce bb layout, CSS, routing, or runtime, and this canvas does not execute plugin code. Run those official tests for behavioral checks. Live bb remains the visual authority."}
        </p>
      </section>
    </main>
  );
}
