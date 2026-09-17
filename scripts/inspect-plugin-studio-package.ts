import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import {
  assertPluginStudioPackagePaths,
  PLUGIN_STUDIO_PACKAGE_ALLOWLIST,
} from "./plugin-studio-package-artifact.ts";
import { generateThirdPartyLicenses } from "./third-party-licenses.ts";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const expectedPackageName = "bb-plugin-studio";
const expectedPackageVersion = "0.1.0-alpha.3";
const defaultExpectedBbVersion = "0.43.1";
const expectedSdkVersion = "0.4.87";
const MAX_COMPRESSED_PACKAGE_BYTES = 128 * 1024 * 1024;
const MAX_EXPANDED_PACKAGE_BYTES = 256 * 1024 * 1024;
const MAX_NON_RUNTIME_FILE_BYTES = 16 * 1024 * 1024;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function assertExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  label: string,
): void {
  const actual = Object.keys(value).sort(compareText);
  const sortedExpected = [...expected].sort(compareText);
  assert(
    JSON.stringify(actual) === JSON.stringify(sortedExpected),
    `${label} keys differ: ${actual.join(", ")}.`,
  );
}

interface PackagedManifest {
  readonly [key: string]: unknown;
  name?: unknown;
  version?: unknown;
  description?: unknown;
  homepage?: unknown;
  repository?: unknown;
  bugs?: unknown;
  keywords?: unknown;
  type?: unknown;
  license?: unknown;
  bin?: unknown;
  publishConfig?: unknown;
  engines?: Record<string, unknown>;
  bb?: Record<string, unknown>;
  files?: unknown;
  scripts?: unknown;
  devDependencies?: unknown;
}

interface BuildMetadata {
  sdkMajor?: unknown;
  sdkVersion?: unknown;
  artifactFormatVersion?: unknown;
  pluginId?: unknown;
  pluginVersion?: unknown;
  builtWith?: Record<string, unknown>;
}

export function expectedPluginStudioPackageBbVersion(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): string {
  const override = environment.BB_PLUGIN_STUDIO_EXPECTED_BB_VERSION;
  if (override === undefined) return defaultExpectedBbVersion;
  assert(
    /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u.test(override),
    "BB_PLUGIN_STUDIO_EXPECTED_BB_VERSION must be a stable semantic version.",
  );
  return override;
}

export function assertPluginStudioPackageMetadata(
  manifest: PackagedManifest,
  serverMetadata: BuildMetadata,
  appMetadata: BuildMetadata,
  expectedBbVersion = defaultExpectedBbVersion,
): void {
  assertExactKeys(
    manifest as Record<string, unknown>,
    [
      "bb",
      "bin",
      "bugs",
      "description",
      "engines",
      "files",
      "homepage",
      "keywords",
      "license",
      "name",
      "publishConfig",
      "repository",
      "type",
      "version",
    ],
    "Plugin Studio package manifest",
  );
  assert(
    manifest.name === expectedPackageName &&
      manifest.version === expectedPackageVersion &&
      manifest.type === "module" &&
      manifest.license === "MIT" &&
      manifest.description === "Build, inspect, and preview bb plugins." &&
      JSON.stringify(manifest.bin) ===
        JSON.stringify({ "bb-plugin-studio": "./dist/cli.js" }) &&
      JSON.stringify(manifest.publishConfig) ===
        JSON.stringify({ access: "public", tag: "alpha" }),
    "Unexpected Plugin Studio package identity or publication metadata.",
  );
  assertExactKeys(
    manifest.engines!,
    ["bb", "bbPluginSdk"],
    "Plugin Studio compatibility engines",
  );
  assertExactKeys(
    manifest.bb!,
    ["app", "branding", "description", "name", "server", "skills"],
    "Plugin Studio bb manifest",
  );
  assert(
    JSON.stringify(manifest.files) ===
      JSON.stringify(
        PLUGIN_STUDIO_PACKAGE_ALLOWLIST.filter(
          (file) => file !== "package.json",
        ),
      ),
    "Plugin Studio package files manifest differs from the exact payload allowlist.",
  );
  assert(
    manifest.engines?.bb === ">=0.43.1" &&
      manifest.engines?.bbPluginSdk === "^0.4.87",
    "Unexpected Plugin Studio engine requirements.",
  );
  assert(
    manifest.bb?.server === "./dist/server.js" &&
      manifest.bb?.app === "./dist/app.js",
    "Plugin Studio package entrypoints must reference built dist files.",
  );
  assert(
    manifest.bb?.name === "Plugin Studio" &&
      manifest.bb?.description === "Build, inspect, and preview bb plugins.",
    "Plugin Studio package identity differs from the approved metadata.",
  );
  assert(
    JSON.stringify(manifest.bb?.branding) ===
      JSON.stringify({ icon: "Toolbox" }),
    "Plugin Studio package branding differs from the approved Toolbox icon.",
  );
  assert(
    JSON.stringify(manifest.bb?.skills) ===
      JSON.stringify(["./skills/plugin-studio"]),
    "Plugin Studio package skill paths differ from the approved payload.",
  );
  assert(
    manifest.scripts === undefined && manifest.devDependencies === undefined,
    "Plugin Studio package may not contain private build configuration.",
  );
  for (const metadata of [serverMetadata, appMetadata]) {
    assert(
      metadata.sdkMajor === 0 &&
        metadata.sdkVersion === expectedSdkVersion &&
        metadata.artifactFormatVersion === 1 &&
        metadata.pluginId === "studio" &&
        metadata.pluginVersion === expectedPackageVersion &&
        metadata.builtWith?.bbVersion === expectedBbVersion &&
        metadata.builtWith?.pluginSdkVersion === expectedSdkVersion,
      "Unexpected Plugin Studio plugin build metadata.",
    );
  }
}

export function assertPluginStudioThirdPartyCoverage(
  notices: string,
  licenses: string,
): void {
  assert(
    notices.includes("Radix Slot") &&
      notices.includes("Radix Tooltip") &&
      notices.includes("bundled Zod schema implementation") &&
      /^## @radix-ui\/react-slot@/mu.test(licenses) &&
      /^## @radix-ui\/react-tooltip@/mu.test(licenses) &&
      /^## zod@/mu.test(licenses),
    "Plugin Studio third-party notices do not cover the native component dependencies and bundled Zod.",
  );
}

async function collectPackageFiles(
  root: string,
  directory = root,
): Promise<string[]> {
  const files: string[] = [];
  const entries = await fs.readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectPackageFiles(root, absolute)));
      continue;
    }
    assert(
      entry.isFile(),
      `Plugin Studio package contains a non-file: ${entry.name}`,
    );
    const stat = await fs.lstat(absolute);
    assert(
      stat.isFile() && stat.nlink === 1,
      `Plugin Studio package contains a linked file: ${entry.name}`,
    );
    const relative = path.relative(root, absolute).split(path.sep).join("/");
    assertPluginStudioPackageFileSize(relative, stat.size);
    files.push(relative);
  }
  return files.sort(compareText);
}

export function assertPluginStudioPackageFileSize(
  relative: string,
  size: number,
): void {
  assert(
    Number.isSafeInteger(size) &&
      size >= 0 &&
      size <= MAX_NON_RUNTIME_FILE_BYTES,
    `Plugin Studio package file is oversized: ${relative}.`,
  );
}

export interface PluginStudioPackageInspection {
  files: number;
}

export async function inspectPluginStudioPackageDirectory(
  packageRoot: string,
  expectedBbVersion = expectedPluginStudioPackageBbVersion(),
): Promise<PluginStudioPackageInspection> {
  const resolvedRoot = path.resolve(packageRoot);
  const paths = await collectPackageFiles(resolvedRoot);
  assertPluginStudioPackagePaths(paths);

  const [manifest, serverMetadata, appMetadata] = await Promise.all([
    fs
      .readFile(path.join(resolvedRoot, "package.json"), "utf8")
      .then((value) => JSON.parse(value) as PackagedManifest),
    fs
      .readFile(path.join(resolvedRoot, "dist", "server.meta.json"), "utf8")
      .then((value) => JSON.parse(value) as BuildMetadata),
    fs
      .readFile(path.join(resolvedRoot, "dist", "app.meta.json"), "utf8")
      .then((value) => JSON.parse(value) as BuildMetadata),
  ]);
  assertPluginStudioPackageMetadata(
    manifest,
    serverMetadata,
    appMetadata,
    expectedBbVersion,
  );
  const serverBundle = await fs.readFile(
    path.join(resolvedRoot, "dist", "server.js"),
    "utf8",
  );
  const appBundle = await fs.readFile(
    path.join(resolvedRoot, "dist", "app.js"),
    "utf8",
  );
  for (const [name, bundle] of [
    ["server.js", serverBundle],
    ["app.js", appBundle],
  ] as const) {
    assert(
      !bundle.includes("sourcesContent") &&
        !bundle.includes("sourceMappingURL") &&
        !/^\/\/ (?:src\/|\.\.\/\.\.\/packages\/)/mu.test(bundle),
      `Plugin Studio package exposes workspace source names in dist/${name}.`,
    );
  }
  const [
    notices,
    licenses,
    sourceNotices,
    expectedLicenses,
    approvedLicense,
    approvedSkill,
    approvedReadme,
    packagedLicense,
    packagedSkill,
    packagedReadme,
  ] = await Promise.all([
    fs.readFile(path.join(resolvedRoot, "THIRD_PARTY_NOTICES.md"), "utf8"),
    fs.readFile(path.join(resolvedRoot, "THIRD_PARTY_LICENSES.md"), "utf8"),
    fs.readFile(
      path.join(repositoryRoot, "apps", "cli", "THIRD_PARTY_NOTICES.md"),
      "utf8",
    ),
    generateThirdPartyLicenses(),
    fs.readFile(path.join(repositoryRoot, "plugins", "studio", "LICENSE")),
    fs.readFile(
      path.join(
        repositoryRoot,
        "plugins",
        "studio",
        "skills",
        "plugin-studio",
        "SKILL.md",
      ),
    ),
    fs.readFile(path.join(repositoryRoot, "plugins", "studio", "README.md")),
    fs.readFile(path.join(resolvedRoot, "LICENSE")),
    fs.readFile(path.join(resolvedRoot, "skills", "plugin-studio", "SKILL.md")),
    fs.readFile(path.join(resolvedRoot, "README.md")),
  ]);
  assertPluginStudioThirdPartyCoverage(notices, licenses);
  assert(
    notices === sourceNotices && licenses === expectedLicenses,
    "Plugin Studio third-party notice bytes differ from their generated sources.",
  );
  assert(
    createHash("sha256").update(packagedReadme).digest("hex") ===
      "6f77c204f0b4798bccab6d31bffd69418ddf1a86ddccc679b6884759e0d35a1a" &&
      Buffer.compare(packagedReadme, approvedReadme) === 0,
    "Plugin Studio packaged README differs from the approved usage document.",
  );
  assert(
    createHash("sha256").update(packagedLicense).digest("hex") ===
      "e417aaf9e252bd066a2d03c54789efa73f757a62daea00a8b1edba7efd453760" &&
      Buffer.compare(packagedLicense, approvedLicense) === 0,
    "Plugin Studio package LICENSE differs from the approved MIT license.",
  );
  const skillText = packagedSkill.toString("utf8");
  assert(
    createHash("sha256").update(packagedSkill).digest("hex") ===
      "e4346c408df02ebcd07c55f731866dbb580058829d118ad1c8d9799dc7a4f6b4" &&
      Buffer.compare(packagedSkill, approvedSkill) === 0 &&
      skillText.startsWith("---\nname: plugin-studio\ndescription:") &&
      skillText.includes("# Plugin Studio") &&
      skillText.includes("On mount, Plugin Studio automatically performs"),
    "Plugin Studio packaged skill identity differs from the approved plugin-studio skill.",
  );
  for (const file of paths) {
    const contents = await fs.readFile(path.join(resolvedRoot, file));
    assert(
      !contents.includes(Buffer.from(repositoryRoot)) &&
        !contents.includes(Buffer.from("/Users/mg/")),
      `Plugin Studio package leaks a checkout path in ${file}.`,
    );
  }
  return {
    files: paths.length,
  };
}

async function runTar(
  tarExecutable: string,
  args: readonly string[],
  cwd: string,
): Promise<string> {
  const child = Bun.spawn([tarExecutable, ...args], {
    cwd,
    env: {},
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  assert(exitCode === 0, `tar failed: ${stderr.trim()}`);
  return stdout;
}

function readTarText(block: Uint8Array, start: number, length: number): string {
  const bytes = block.subarray(start, start + length);
  const nul = bytes.indexOf(0);
  return Buffer.from(nul === -1 ? bytes : bytes.subarray(0, nul)).toString(
    "utf8",
  );
}

export function gunzipPluginStudioTar(
  compressed: Uint8Array,
  maxOutputLength = MAX_EXPANDED_PACKAGE_BYTES,
): Buffer {
  return gunzipSync(Buffer.from(compressed), { maxOutputLength });
}

export function preflightPluginStudioTarBytes(
  compressed: Uint8Array,
): string[] {
  const archive = gunzipPluginStudioTar(compressed);
  const entries: string[] = [];
  let offset = 0;
  while (offset + 512 <= archive.byteLength) {
    const header = archive.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const name = readTarText(header, 0, 100);
    const prefix = readTarText(header, 345, 155);
    const entry = prefix ? `${prefix}/${name}` : name;
    assert(
      entry.length > 0 &&
        !/[\u0000-\u001f\u007f\\]/u.test(entry) &&
        !entry.startsWith("/") &&
        !entry.split("/").some((part) => part === ".." || part === ""),
      `Plugin Studio archive contains an unsafe raw header: ${JSON.stringify(entry)}.`,
    );
    const type = header[156];
    assert(
      type === 0 || type === 0x30,
      `Plugin Studio archive contains unsupported raw header type ${type} for ${entry}.`,
    );
    const sizeText = readTarText(header, 124, 12).trim();
    assert(
      /^[0-7]+$/u.test(sizeText),
      `Plugin Studio archive has invalid size for ${entry}.`,
    );
    const size = Number.parseInt(sizeText, 8);
    assert(
      Number.isSafeInteger(size) && size >= 0,
      `Plugin Studio archive has invalid size for ${entry}.`,
    );
    entries.push(entry);
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  const canonicalEnd = archive.subarray(offset);
  assert(
    canonicalEnd.byteLength === 1024 &&
      canonicalEnd.every((byte) => byte === 0),
    "Plugin Studio archive does not have one canonical end or contains trailing decompressed data.",
  );
  const expected = PLUGIN_STUDIO_PACKAGE_ALLOWLIST.map(
    (file) => `package/${file}`,
  ).sort(compareText);
  assert(
    JSON.stringify([...entries].sort(compareText)) === JSON.stringify(expected),
    `Plugin Studio archive raw header allowlist mismatch: ${entries.join(", ")}`,
  );
  return entries;
}

export function assertSafeStudioTarHeaders(
  paths: readonly string[],
  verboseLines: readonly string[],
): void {
  assert(
    paths.length === verboseLines.length,
    "Plugin Studio archive header listing is inconsistent.",
  );
  assert(
    new Set(paths).size === paths.length,
    "Plugin Studio archive has duplicate entries.",
  );
  for (let index = 0; index < paths.length; index += 1) {
    const entry = paths[index]!;
    const pathWithoutTrailingSlash = entry.endsWith("/")
      ? entry.slice(0, -1)
      : entry;
    const type = verboseLines[index]?.[0];
    assert(
      type === "-" || type === "d",
      `Plugin Studio archive contains a non-file archive entry: ${entry}`,
    );
    assert(
      !entry.includes("\\") &&
        (entry === "package/" ||
          (entry.startsWith("package/") &&
            !pathWithoutTrailingSlash
              .split("/")
              .some((part) => part === ".." || part === ""))),
      `Plugin Studio archive contains an unsafe entry: ${entry}`,
    );
  }
}

export async function inspectPluginStudioPackageArchive(
  archivePath: string,
  tarExecutable: string,
  expectedBbVersion = expectedPluginStudioPackageBbVersion(),
): Promise<PluginStudioPackageInspection> {
  assert(path.isAbsolute(tarExecutable), "tarExecutable must be absolute.");
  const resolvedArchive = path.resolve(archivePath);
  const temporaryRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "bb-plugin-studio-inspect-"),
  );
  try {
    const archiveStat = await fs.lstat(resolvedArchive);
    assert(
      archiveStat.isFile() &&
        archiveStat.nlink === 1 &&
        archiveStat.size > 0 &&
        archiveStat.size <= MAX_COMPRESSED_PACKAGE_BYTES,
      "Plugin Studio archive must be one bounded regular file.",
    );
    preflightPluginStudioTarBytes(await fs.readFile(resolvedArchive));
    const listed = (
      await runTar(tarExecutable, ["-tzf", resolvedArchive], temporaryRoot)
    )
      .split("\n")
      .filter(Boolean);
    const verbose = (
      await runTar(tarExecutable, ["-tvzf", resolvedArchive], temporaryRoot)
    )
      .split("\n")
      .filter(Boolean);
    assertSafeStudioTarHeaders(listed, verbose);
    await runTar(
      tarExecutable,
      ["-xzf", resolvedArchive, "--no-same-owner"],
      temporaryRoot,
    );
    return await inspectPluginStudioPackageDirectory(
      path.join(temporaryRoot, "package"),
      expectedBbVersion,
    );
  } finally {
    await fs.rm(temporaryRoot, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  const archivePath = process.argv[2];
  const tarExecutable = process.env.BB_PLUGIN_STUDIO_TAR_EXECUTABLE;
  if (!archivePath || !tarExecutable) {
    throw new Error(
      "Usage: BB_PLUGIN_STUDIO_TAR_EXECUTABLE=/absolute/tar bun scripts/inspect-plugin-studio-package.ts <artifact.tgz>",
    );
  }
  console.log(
    JSON.stringify(
      await inspectPluginStudioPackageArchive(archivePath, tarExecutable),
      null,
      2,
    ),
  );
}
