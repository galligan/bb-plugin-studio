import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { PreviewCanvas } from "./PreviewCanvas";
import { resolveCatalogSelection } from "../surface-catalog";

const selection = resolveCatalogSelection("thread-list", "agents");

describe("PreviewCanvas", () => {
  test("renders Fixture through the deterministic bb Plugin Studio shell", () => {
    const markup = renderToStaticMarkup(
      <PreviewCanvas
        selection={selection}
        mode="fixture"
        theme="dark"
        viewport="compact"
      />,
    );

    expect(markup).toContain('aria-label="bb Plugin Studio workbench"');
    expect(markup).toContain('data-viewport="compact"');
  });

  test("renders Harness as a behavioral handoff when contracts resolve", () => {
    const markup = renderToStaticMarkup(
      <PreviewCanvas
        selection={selection}
        mode="harness"
        theme="light"
        viewport="desktop"
      />,
    );

    expect(markup).toContain("Official testing contracts resolved");
    expect(markup).toContain("@get-bb/plugin-sdk/testing");
    expect(markup).toContain("does not execute plugin code");
    expect(markup).not.toContain("Harness preview is unavailable");
    expect(markup).not.toContain("upstream-backed adapter");
    expect(markup).not.toContain('aria-label="bb Plugin Studio workbench"');
    expect(markup).not.toContain("<iframe");
  });

  test("renders Live as a native handoff instead of Fixture output", () => {
    const markup = renderToStaticMarkup(
      <PreviewCanvas
        selection={selection}
        mode="live"
        theme="light"
        viewport="desktop"
      />,
    );

    expect(markup).toContain("Continue in native bb");
    expect(markup).toContain("does not fetch, embed, or reproduce");
    expect(markup).not.toContain('aria-label="bb Plugin Studio workbench"');
    expect(markup).not.toContain("<iframe");
  });
});
