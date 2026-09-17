import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { findSurface, surfaceCatalog } from "@/surface-catalog";
import { CatalogFixtures as composerStory } from "@/stories/surfaces/composer-customization.stories";
import { CatalogFixtures as contentScriptStory } from "@/stories/surfaces/content-script.stories";
import { CatalogFixtures as fileOpenerStory } from "@/stories/surfaces/file-opener.stories";
import { CatalogFixtures as homepageStory } from "@/stories/surfaces/homepage-section.stories";
import { CatalogFixtures as messageActionStory } from "@/stories/surfaces/message-action.stories";
import { CatalogFixtures as messageDirectiveStory } from "@/stories/surfaces/message-directive.stories";
import { CatalogFixtures as navigationStory } from "@/stories/surfaces/navigation-panel.stories";
import { CatalogFixtures as pendingStory } from "@/stories/surfaces/pending-interaction.stories";
import { CatalogFixtures as settingsStory } from "@/stories/surfaces/settings-section.stories";
import { CatalogFixtures as sidebarFooterStory } from "@/stories/surfaces/sidebar-footer-action.stories";
import { CatalogFixtures as threadHeaderStory } from "@/stories/surfaces/thread-header-action.stories";
import { CatalogFixtures as threadListStory } from "@/stories/surfaces/thread-list.stories";
import { CatalogFixtures as threadPanelStory } from "@/stories/surfaces/thread-panel-action.stories";
import { SurfaceLab } from "./SurfaceLab";

const stories = [
  homepageStory,
  settingsStory,
  navigationStory,
  threadPanelStory,
  pendingStory,
  sidebarFooterStory,
  threadListStory,
  threadHeaderStory,
  fileOpenerStory,
  messageDirectiveStory,
  messageActionStory,
  composerStory,
  contentScriptStory,
] as const;

function sourceFilesUnder(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return sourceFilesUnder(path);
    }
    if (
      entry.name.endsWith(".test.tsx") ||
      !/\.(?:[cm]?[jt]sx?|css)$/.test(entry.name)
    ) {
      return [];
    }
    return [path];
  });
}

describe("public plugin surface lab", () => {
  test("declares exactly one statically discoverable story per catalog surface", () => {
    const catalogIds = surfaceCatalog.map(({ id }) => id);
    const storyIds = stories.map(({ surfaceId }) => surfaceId);
    const storyDirectory = join(import.meta.dir, "../stories/surfaces");
    const storyFiles = readdirSync(storyDirectory).filter((file) =>
      file.endsWith(".stories.tsx"),
    );

    expect(storyIds).toEqual(catalogIds);
    expect(new Set(storyIds).size).toBe(surfaceCatalog.length);
    expect(storyFiles).toHaveLength(surfaceCatalog.length);
  });

  test("exposes only bounded, linkable fixture, theme, and viewport controls", () => {
    for (const [index, surface] of surfaceCatalog.entries()) {
      const story = stories[index];
      expect(story?.surfaceId).toBe(surface.id);
      expect(story?.args).toEqual({
        fixtureId: surface.fixtures[0]?.id,
        theme: "light",
        viewport: "desktop",
      });
      expect(story?.argTypes?.fixtureId?.options).toEqual(
        surface.fixtures.map(({ id }) => id),
      );
      expect(story?.argTypes?.theme?.options).toEqual(["light", "dark"]);
      expect(story?.argTypes?.viewport?.options).toEqual([
        "desktop",
        "compact",
      ]);
    }
  });

  test("renders every fixture through a stable surface adapter", () => {
    for (const surface of surfaceCatalog) {
      for (const fixture of surface.fixtures) {
        const markup = renderToStaticMarkup(
          <SurfaceLab
            surfaceId={surface.id}
            fixtureId={fixture.id}
            theme="light"
            viewport="desktop"
          />,
        );

        expect(markup).toContain(`data-surface-id="${surface.id}"`);
        expect(markup).toContain(`data-fixture-id="${fixture.id}"`);
        expect(markup).toContain('data-viewport="desktop"');
        expect(markup).toContain("Fixture ≈ approximation");

        const interactionIds = fixture.interactions.map(({ id }) => id);
        expect(new Set(interactionIds).size).toBe(interactionIds.length);
        for (const interactionId of interactionIds) {
          expect(markup).toContain(interactionId.replaceAll("-", " "));
        }
      }
    }
  });

  test("shows concrete host-action context and outcomes without host chrome", () => {
    for (const surfaceId of [
      "sidebar-footer-action",
      "message-action",
    ] as const) {
      const surface = findSurface(surfaceId);
      for (const fixture of surface.fixtures) {
        const markup = renderToStaticMarkup(
          <SurfaceLab
            surfaceId={surfaceId}
            fixtureId={fixture.id}
            theme="light"
            viewport="desktop"
          />,
        );

        expect(markup).toContain("bb owns this control");
        expect(markup).toContain("Fixture context");
        for (const stateKey of Object.keys(fixture.state)) {
          expect(markup).toContain(stateKey);
        }
        for (const { outcome } of fixture.interactions) {
          expect(markup).toContain(outcome);
        }
      }
    }
  });

  test("makes the thread-list viewport control change the bounded shell", () => {
    const desktop = renderToStaticMarkup(
      <SurfaceLab
        surfaceId="thread-list"
        fixtureId="agents"
        theme="light"
        viewport="desktop"
      />,
    );
    const compact = renderToStaticMarkup(
      <SurfaceLab
        surfaceId="thread-list"
        fixtureId="agents"
        theme="light"
        viewport="compact"
      />,
    );

    expect(desktop).toContain('data-viewport="desktop"');
    expect(compact).toContain('data-viewport="compact"');
    expect(desktop).not.toBe(compact);
  });

  test("keeps every content-script fixture inert during discovery and render", () => {
    const contentScript = findSurface("content-script");

    for (const fixture of contentScript.fixtures) {
      expect(fixture.state.phase).toBe("unmounted");
      const markup = renderToStaticMarkup(
        <SurfaceLab
          surfaceId="content-script"
          fixtureId={fixture.id}
          theme="light"
          viewport="desktop"
        />,
      );
      expect(markup).toContain("No content-script code mounted");
    }
  });

  test("has no runtime, inspection, plugin, or sibling-source dependency", () => {
    const workbenchDirectory = join(import.meta.dir, "../..");
    const boundaryFiles = [
      ...sourceFilesUnder(join(workbenchDirectory, ".ladle")),
      ...sourceFilesUnder(join(workbenchDirectory, "src/surface-lab")),
      ...sourceFilesUnder(join(workbenchDirectory, "src/stories/surfaces")),
      join(workbenchDirectory, "src/components/BbIcon.tsx"),
      join(workbenchDirectory, "src/components/BbShell.tsx"),
      join(workbenchDirectory, "src/components/SidebarListView.tsx"),
      join(workbenchDirectory, "src/styles.css"),
      join(workbenchDirectory, "src/surface-catalog.ts"),
      join(workbenchDirectory, "src/surface-fixtures.ts"),
      join(workbenchDirectory, "src/thread-list-fixtures.ts"),
    ];
    const sourceFiles = boundaryFiles
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");

    expect(sourceFiles).not.toContain("@bb/plugin-sdk");
    expect(sourceFiles).not.toContain("@get-bb/plugin-sdk");
    expect(sourceFiles).not.toContain("usePluginInspection");
    expect(sourceFiles).not.toContain("pluginInspectionPlugin");
    expect(sourceFiles).not.toMatch(
      /from\s+["'][^"']*(?:\.\.\/)+bb(?:\/|["'])/,
    );
    expect(sourceFiles).not.toMatch(/from\s+["'][^"']*plugins\//);
  });
});
