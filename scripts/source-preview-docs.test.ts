import { describe, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));

describe("bb Plugin Studio source preview documentation", () => {
  test("presents source checkout as the supported first-contact path", async () => {
    const readme = await Bun.file(`${repositoryRoot}/README.md`).text();
    const preview = await Bun.file(
      `${repositoryRoot}/docs/source-preview.md`,
    ).text();
    const packageReadme = await Bun.file(
      `${repositoryRoot}/apps/cli/README.md`,
    ).text();
    const support = await Bun.file(`${repositoryRoot}/SUPPORT.md`).text();
    const authorGuide = await Bun.file(
      `${repositoryRoot}/docs/plugin-author-guide.md`,
    ).text();
    const packageProse = packageReadme.replace(/\s+/gu, " ");
    const authorProse = authorGuide.replace(/\s+/gu, " ");
    const previewProse = preview.replace(/\s+/gu, " ");

    for (const firstContactSurface of [readme, packageReadme]) {
      expect(firstContactSurface).not.toContain(
        "npm install --global bb-plugin-studio@alpha",
      );
      expect(firstContactSurface).toContain(
        "`bb-plugin-studio` is the canonical package and command identity",
      );
    }

    expect(readme).not.toContain("img.shields.io/npm/v/bb-plugin-studio");
    expect(readme).toContain("## Try the source preview");
    expect(readme).toContain("[Source preview guide](docs/source-preview.md)");
    expect(readme).toContain(
      "Remote projects on enrolled bb machines are not currently supported.",
    );

    expect(preview).toContain(
      "git clone https://github.com/galligan/bb-plugin-studio.git\ncd bb-plugin-studio",
    );
    expect(preview).toContain("bun install --frozen-lockfile");
    expect(preview).toContain("bun run bb-plugin-studio --help");
    expect(preview).toContain("bun run dev");
    expect(preview).toContain(
      "bb Plugin Studio is not currently distributed as a public installable package",
    );
    expect(previewProse).toContain(
      "This rename introduces `bb-plugin-studio` as the canonical package and command identity",
    );
    expect(previewProse).toContain(
      "The source preview creates a clean `studio` installation",
    );
    expect(preview).not.toContain("predates the product rename");
    expect(preview).not.toContain("silently migrating an existing `studio`");
    expect(preview).toMatch(
      /Live bb is the visual\s+and integration authority/,
    );

    expect(packageProse).toContain(
      "The CLI package contains the command and deterministic static plugin-surface lab",
    );
    expect(packageProse).not.toContain("The source workspace contains a CLI");
    expect(packageProse).toContain(
      "The source development server exposes a bounded inspection session",
    );
    expect(packageProse).toContain(
      "the packaged static lab does not serve inspection data over HTTP",
    );
    expect(packageProse).not.toContain(
      "it never serves inspection data over HTTP",
    );
    expect(authorProse).toContain(
      "native bb 0.36.0 or newer, verified through 0.37.0",
    );
    expect(authorProse).toContain(
      "Newer releases remain usable with a nonfatal audit notice",
    );
    expect(authorProse).not.toContain(
      "native bb 0.36.0, the currently recorded target",
    );
    for (const maintainedGuide of [support, authorGuide]) {
      expect(maintainedGuide).not.toContain("bb-plugin-studio@alpha");
      expect(maintainedGuide).toContain("source preview");
    }
  });

  test("describes the canonical plugin package truthfully", async () => {
    const pluginReadme = await Bun.file(
      `${repositoryRoot}/plugins/studio/README.md`,
    ).text();

    expect(pluginReadme).toContain("bun run plugin-studio:package:test");
    expect(pluginReadme).not.toContain("bun run studio:package:test");
    expect(pluginReadme).toContain("publishable package manifest");
    expect(pluginReadme).not.toContain("manifest remain `private: true`");
    expect(pluginReadme).not.toContain("older `bb-plugin-studio` npm artifact");
  });
});
