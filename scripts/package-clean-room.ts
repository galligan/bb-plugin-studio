import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

interface PackResult {
  filename: string;
  files: Array<{ path: string }>;
}

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const sourceManifest = JSON.parse(
  await fs.readFile(
    path.join(repositoryRoot, "apps", "cli", "package.json"),
    "utf8",
  ),
) as { name: string; version: string };
const artifactName = `${sourceManifest.name}-${sourceManifest.version}.tgz`;
const artifactPath = path.join(repositoryRoot, "artifacts", artifactName);

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function declaresPackage(value: unknown, packageName: string): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const packages = record.packages;
  if (
    packages &&
    typeof packages === "object" &&
    !Array.isArray(packages) &&
    Object.keys(packages).some((key) => {
      const normalized = key.replaceAll("\\", "/");
      return (
        normalized === `node_modules/${packageName}` ||
        normalized.endsWith(`/node_modules/${packageName}`)
      );
    })
  ) {
    return true;
  }
  if (record.name === packageName) return true;
  const bin = record.bin;
  if (
    bin &&
    typeof bin === "object" &&
    !Array.isArray(bin) &&
    Object.hasOwn(bin, packageName)
  ) {
    return true;
  }
  if (
    typeof record.resolved === "string" &&
    path.basename(record.resolved).startsWith(`${packageName}-`) &&
    record.resolved.endsWith(".tgz")
  ) {
    return true;
  }
  for (const field of [
    "dependencies",
    "devDependencies",
    "optionalDependencies",
    "peerDependencies",
  ]) {
    const dependencies = record[field];
    if (
      dependencies &&
      typeof dependencies === "object" &&
      !Array.isArray(dependencies) &&
      Object.hasOwn(dependencies, packageName)
    ) {
      return true;
    }
  }
  return Object.values(record).some((child) =>
    declaresPackage(child, packageName),
  );
}

function verifyResidueDetector(packageName: string) {
  for (const residue of [
    { packages: { [`../../tmp/node_modules/${packageName}`]: {} } },
    { packages: { "": { name: packageName } } },
    { packages: { "": { bin: { [packageName]: "dist/cli.js" } } } },
    {
      packages: {
        "": { resolved: `file:../${packageName}-0.1.0-alpha.3.tgz` },
      },
    },
  ]) {
    assert(
      declaresPackage(residue, packageName),
      "The uninstall-residue detector missed a known npm lockfile shape.",
    );
  }
  assert(
    !declaresPackage({ packages: { "": {} } }, packageName),
    "The uninstall-residue detector rejected a neutral npm lockfile.",
  );
}

async function run(
  args: readonly string[],
  options: {
    cwd?: string;
    env: NodeJS.ProcessEnv;
    allowFailure?: boolean;
  },
): Promise<CommandResult> {
  const child = Bun.spawn([...args], {
    cwd: options.cwd ?? repositoryRoot,
    env: options.env,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (exitCode !== 0 && !options.allowFailure) {
    throw new Error(
      `${args.join(" ")} exited with code ${exitCode}\n${stdout.trim()}\n${stderr.trim()}`,
    );
  }
  return { exitCode, stdout, stderr };
}

async function sha256(file: string): Promise<string> {
  const hash = createHash("sha256");
  hash.update(await fs.readFile(file));
  return hash.digest("hex");
}

async function collectFiles(root: string, relative = ""): Promise<string[]> {
  const entries = await fs.readdir(path.join(root, relative), {
    withFileTypes: true,
  });
  const files: string[] = [];
  for (const entry of entries) {
    const child = path.join(relative, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`Package contains a symlink: ${child}`);
    }
    if (entry.isDirectory()) files.push(...(await collectFiles(root, child)));
    else if (entry.isFile()) files.push(child);
  }
  return files;
}

async function freePort(): Promise<number> {
  const probe = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () => new Response("probe"),
  });
  const port = probe.port;
  probe.stop(true);
  if (port === undefined) throw new Error("Could not allocate a probe port.");
  return port;
}

const temporaryRoot = await fs.mkdtemp(
  path.join(os.tmpdir(), "bb-plugin-studio-package-"),
);
let server: ReturnType<typeof Bun.spawn> | null = null;

try {
  verifyResidueDetector(sourceManifest.name);
  const installRoot = path.join(temporaryRoot, "install");
  const globalInstallRoot = path.join(temporaryRoot, "global-install");
  const homeRoot = path.join(temporaryRoot, "home");
  const cacheRoot = path.join(temporaryRoot, "cache");
  const configRoot = path.join(temporaryRoot, "config");
  const dataRoot = path.join(temporaryRoot, "data");
  const stateRoot = path.join(temporaryRoot, "state");
  const tempRoot = path.join(temporaryRoot, "tmp");
  const toolRoot = path.join(temporaryRoot, "bin");
  await Promise.all(
    [
      homeRoot,
      globalInstallRoot,
      cacheRoot,
      configRoot,
      dataRoot,
      stateRoot,
      tempRoot,
      toolRoot,
    ].map((root) => fs.mkdir(root, { recursive: true })),
  );

  const exactTools = {
    bun: process.execPath,
    node: Bun.which("node"),
    npm: Bun.which("npm"),
    tar: Bun.which("tar"),
    gzip: Bun.which("gzip"),
  };
  for (const [name, executable] of Object.entries(exactTools)) {
    assert(executable, `Required clean-room tool is unavailable: ${name}.`);
    assert(
      !executable.startsWith(`${repositoryRoot}${path.sep}`),
      `Clean-room tool resolves inside the repository: ${executable}.`,
    );
    await fs.symlink(executable, path.join(toolRoot, name));
  }
  const npmUserConfig = path.join(configRoot, "npmrc");
  await fs.writeFile(
    npmUserConfig,
    [
      "audit=false",
      "fund=false",
      "ignore-scripts=true",
      "package-lock=false",
      "update-notifier=false",
      "",
    ].join("\n"),
  );
  const lifecycleEnv: NodeJS.ProcessEnv = {
    PATH: toolRoot,
    HOME: homeRoot,
    TMPDIR: tempRoot,
    XDG_CACHE_HOME: cacheRoot,
    XDG_CONFIG_HOME: configRoot,
    XDG_DATA_HOME: dataRoot,
    XDG_STATE_HOME: stateRoot,
    BUN_INSTALL: path.join(dataRoot, "bun"),
    BUN_INSTALL_CACHE_DIR: path.join(cacheRoot, "bun"),
    npm_config_cache: path.join(cacheRoot, "npm"),
    npm_config_prefix: installRoot,
    npm_config_userconfig: npmUserConfig,
    npm_config_audit: "false",
    npm_config_fund: "false",
    npm_config_ignore_scripts: "true",
    npm_config_package_lock: "false",
    NO_UPDATE_NOTIFIER: "1",
    BB_CLI: "",
    CI: "1",
    LANG: "C.UTF-8",
  };

  const firstBuild = path.join(temporaryRoot, "build-a.tgz");
  const secondBuild = path.join(temporaryRoot, "build-b.tgz");
  await run([process.execPath, "scripts/package-local.ts"], {
    env: lifecycleEnv,
  });
  await fs.access(artifactPath, constants.R_OK);
  await fs.copyFile(artifactPath, firstBuild);
  await run([process.execPath, "scripts/package-local.ts"], {
    env: lifecycleEnv,
  });
  await fs.copyFile(artifactPath, secondBuild);

  const repackRoot = path.join(temporaryRoot, "repack");
  await fs.mkdir(repackRoot);
  const repack = await run(
    [
      "npm",
      "pack",
      path.join(repositoryRoot, "artifacts", "package"),
      "--pack-destination",
      repackRoot,
      "--json",
      "--ignore-scripts",
    ],
    { env: lifecycleEnv },
  );
  const parsed = JSON.parse(repack.stdout) as PackResult[];
  assert(parsed.length === 1, "Expected one npm pack result.");
  const packed = parsed[0]!;
  const repackedArtifact = path.join(repackRoot, packed.filename);
  const hashes = await Promise.all(
    [firstBuild, secondBuild, artifactPath, repackedArtifact].map(sha256),
  );
  assert(
    hashes.every((hash) => hash === hashes[0]),
    "Two complete package builds are not byte-for-byte deterministic.",
  );

  const paths = packed.files.map((file) => file.path);
  const unexpected = paths.filter(
    (file) =>
      file !== "package.json" &&
      file !== "LICENSE" &&
      file !== "README.md" &&
      file !== "THIRD_PARTY_NOTICES.md" &&
      file !== "THIRD_PARTY_LICENSES.md" &&
      file !== "dist/cli.js" &&
      !file.startsWith("dist/lab/"),
  );
  assert(
    unexpected.length === 0,
    `Unexpected packed files: ${unexpected.join(", ")}`,
  );

  const extractionRoot = path.join(temporaryRoot, "extracted");
  await fs.mkdir(extractionRoot);
  await run(["tar", "-xzf", artifactPath, "-C", extractionRoot], {
    env: lifecycleEnv,
  });
  const extractedPackage = path.join(extractionRoot, "package");
  const extractedFiles = await collectFiles(extractedPackage);
  assert(
    !extractedFiles.some((file) =>
      /(^|\/)(node_modules|plugins|src)(\/|$)/.test(file),
    ),
    "Artifact contains source, plugin, or node_modules content.",
  );
  const stagedManifest = JSON.parse(
    await fs.readFile(path.join(extractedPackage, "package.json"), "utf8"),
  ) as Record<string, unknown>;
  assert(
    !("private" in stagedManifest),
    "Public artifact must not retain the private publication guard.",
  );
  assert(
    stagedManifest.license === "MIT",
    "Public artifact must declare the approved MIT license.",
  );
  assert(
    stagedManifest.version === "0.1.0-alpha.3",
    "Artifact must use the approved alpha.3 version.",
  );
  assert(
    stagedManifest.homepage ===
      "https://github.com/galligan/bb-plugin-studio#readme" &&
      JSON.stringify(stagedManifest.repository) ===
        JSON.stringify({
          type: "git",
          url: "git+https://github.com/galligan/bb-plugin-studio.git",
          directory: "apps/cli",
        }) &&
      JSON.stringify(stagedManifest.bugs) ===
        JSON.stringify({
          url: "https://github.com/galligan/bb-plugin-studio/issues",
        }),
    "Artifact must link to the public source and issue tracker.",
  );
  assert(
    JSON.stringify(stagedManifest.publishConfig) ===
      JSON.stringify({ access: "public", tag: "alpha" }),
    "Artifact must publish publicly under the alpha dist-tag.",
  );
  assert(
    !("dependencies" in stagedManifest),
    "Artifact must not retain workspace dependencies.",
  );
  const packageLicense = await fs.readFile(
    path.join(extractedPackage, "LICENSE"),
    "utf8",
  );
  assert(
    packageLicense.startsWith("MIT License") &&
      packageLicense.includes("Copyright (c) 2026 Matt Galligan"),
    "Artifact must ship the approved MIT license text.",
  );
  const thirdPartyLicenses = await fs.readFile(
    path.join(extractedPackage, "THIRD_PARTY_LICENSES.md"),
    "utf8",
  );
  for (const required of [
    "@ladle/react@",
    "debug@",
    "history@",
    "classnames@",
    "prism-react-renderer@",
    "prop-types@",
    "query-string@",
    "react-hotkeys-hook@",
    "react-inspector@",
    "scheduler@",
    "tslib@",
    "zod@",
    "@fontsource-variable/geist@",
    "@fontsource-variable/inter@",
    "Apache License",
    "SIL OPEN FONT LICENSE",
  ]) {
    assert(
      thirdPartyLicenses.includes(required),
      `Third-party license payload is missing ${required}.`,
    );
  }

  const textFiles = extractedFiles.filter((file) =>
    /\.(css|html|js|json|md|svg|webmanifest)$/.test(file),
  );
  for (const file of textFiles) {
    const content = await fs.readFile(
      path.join(extractedPackage, file),
      "utf8",
    );
    assert(
      !content.includes(repositoryRoot) && !content.includes("/Users/mg/"),
      `Artifact leaks an absolute developer path in ${file}.`,
    );
  }
  const labJavaScript = (
    await Promise.all(
      extractedFiles
        .filter((file) => file.startsWith("dist/lab/") && file.endsWith(".js"))
        .map((file) => fs.readFile(path.join(extractedPackage, file), "utf8")),
    )
  ).join("\n");
  assert(
    labJavaScript.includes("bb-plugin-studio-surface-lab-v1"),
    "Packaged Ladle must use the checkout-independent application ID.",
  );

  const copiedArtifact = path.join(temporaryRoot, artifactName);
  await fs.copyFile(artifactPath, copiedArtifact);
  await run(
    [
      "npm",
      "install",
      "--global",
      "--prefix",
      globalInstallRoot,
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      copiedArtifact,
    ],
    { env: lifecycleEnv },
  );
  const globalBin = path.join(globalInstallRoot, "bin", "bb-plugin-studio");
  const globalPackage = path.join(
    globalInstallRoot,
    "lib",
    "node_modules",
    sourceManifest.name,
  );
  await Promise.all([
    fs.access(globalBin, constants.X_OK),
    fs.access(globalPackage, constants.R_OK),
  ]);
  const globalHelp = await run([globalBin, "--help"], {
    cwd: temporaryRoot,
    env: lifecycleEnv,
  });
  assert(
    globalHelp.stdout.includes("Usage: bb-plugin-studio"),
    "Global installed bin help failed.",
  );
  await run(
    [
      "npm",
      "uninstall",
      "--global",
      "--prefix",
      globalInstallRoot,
      sourceManifest.name,
    ],
    { env: lifecycleEnv },
  );
  for (const residue of [globalBin, globalPackage]) {
    await fs.access(residue).then(
      () => {
        throw new Error(`npm global uninstall left ${residue} behind.`);
      },
      () => undefined,
    );
  }

  await run(
    [
      "npm",
      "install",
      "--prefix",
      installRoot,
      "--ignore-scripts",
      "--no-save",
      "--package-lock=false",
      "--no-audit",
      "--no-fund",
      copiedArtifact,
    ],
    { env: lifecycleEnv },
  );

  const installedBin = path.join(
    installRoot,
    "node_modules",
    ".bin",
    "bb-plugin-studio",
  );
  await fs.access(installedBin, constants.X_OK);
  const help = await run([installedBin, "--help"], {
    cwd: temporaryRoot,
    env: lifecycleEnv,
  });
  assert(
    help.stdout.includes("Usage: bb-plugin-studio"),
    "Installed bin help failed.",
  );

  const workspaceRoot = path.join(temporaryRoot, "workspace");
  const pluginRoot = path.join(workspaceRoot, "plugins", "fixture");
  await fs.mkdir(pluginRoot, { recursive: true });
  const executionMarker = path.join(temporaryRoot, "plugin-executed");
  await fs.writeFile(
    path.join(pluginRoot, "package.json"),
    `${JSON.stringify(
      {
        name: "bb-plugin-fixture",
        version: "1.0.0",
        engines: { bb: ">=0.35.1", bbPluginSdk: ">=0.1.0" },
        dependencies: { "@get-bb/plugin-sdk": "0.4.87" },
        bb: {
          name: "Fixture",
          description: "Clean-room fixture plugin",
          branding: { icon: "Puzzle" },
          server: "./server.ts",
          app: "./app.tsx",
        },
      },
      null,
      2,
    )}\n`,
  );
  await fs.writeFile(
    path.join(pluginRoot, "server.ts"),
    `await Bun.write(${JSON.stringify(executionMarker)}, "executed");\n`,
  );
  await fs.writeFile(path.join(pluginRoot, "app.tsx"), "export default {};\n");

  const inspection = await run([installedBin, "inspect", pluginRoot], {
    cwd: workspaceRoot,
    env: lifecycleEnv,
    allowFailure: true,
  });
  assert(
    inspection.exitCode === 1,
    "Unavailable native capabilities must fail inspection.",
  );
  assert(
    inspection.stdout.includes("Native bb executable: unavailable"),
    "Missing native bb was not reported clearly.",
  );
  assert(
    inspection.stdout.includes("Plugin: Fixture"),
    "Installed bin did not inspect the fixture package.",
  );
  assert(
    inspection.stdout.includes("Harness mode is unavailable"),
    "Missing official SDK/Harness capability was not reported clearly.",
  );
  await fs.access(executionMarker).then(
    () => {
      throw new Error("Passive inspection executed the plugin entrypoint.");
    },
    () => undefined,
  );

  const port = await freePort();
  server = Bun.spawn(
    [
      installedBin,
      "dev",
      pluginRoot,
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
    ],
    {
      cwd: workspaceRoot,
      env: lifecycleEnv,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  let exited = false;
  void server.exited.then(() => {
    exited = true;
  });
  interface SurfaceMetadata {
    stories?: Record<string, unknown>;
  }
  let metadata: SurfaceMetadata | null = null;
  for (let attempt = 0; attempt < 100 && !exited; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/meta.json`);
      if (response.ok) {
        metadata = (await response.json()) as SurfaceMetadata;
        break;
      }
    } catch {
      // The process is still starting.
    }
    await Bun.sleep(100);
  }
  assert(metadata, "Installed bin did not start the packaged surface lab.");
  assert(
    Object.keys(metadata.stories ?? {}).length === 13,
    "Packaged surface lab does not expose all 13 catalog stories.",
  );
  server.kill("SIGTERM");
  await server.exited;
  const stdoutStream = server.stdout;
  const stderrStream = server.stderr;
  assert(
    stdoutStream instanceof ReadableStream,
    "Server stdout was not captured.",
  );
  assert(
    stderrStream instanceof ReadableStream,
    "Server stderr was not captured.",
  );
  const [serverStdout, serverStderr] = await Promise.all([
    new Response(stdoutStream).text(),
    new Response(stderrStream).text(),
  ]);
  assert(
    serverStdout.includes("Launching Fixture surface lab"),
    `Installed dev output did not identify the packaged lab.\n${serverStderr}`,
  );
  assert(
    serverStdout.includes("Connect exposure: unavailable"),
    "Missing Connect capability was not reported while Fixture remained usable.",
  );
  server = null;

  await run(
    [
      "npm",
      "uninstall",
      "--prefix",
      installRoot,
      "--no-save",
      "--package-lock=false",
      sourceManifest.name,
    ],
    {
      env: lifecycleEnv,
    },
  );
  await fs.access(installedBin).then(
    () => {
      throw new Error(
        "npm uninstall left the installed bb-plugin-studio bin behind.",
      );
    },
    () => undefined,
  );
  const installedPackage = path.join(
    installRoot,
    "node_modules",
    sourceManifest.name,
  );
  await fs.access(installedPackage).then(
    () => {
      throw new Error("npm uninstall left the installed package behind.");
    },
    () => undefined,
  );
  const rootManifest = path.join(installRoot, "package.json");
  try {
    const content = await fs.readFile(rootManifest, "utf8");
    assert(
      !declaresPackage(JSON.parse(content), sourceManifest.name),
      `npm uninstall left ${sourceManifest.name} in package.json.`,
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  for (const lockPath of [
    path.join(installRoot, "package-lock.json"),
    path.join(installRoot, "node_modules", ".package-lock.json"),
  ]) {
    try {
      const content = await fs.readFile(lockPath, "utf8");
      assert(
        !declaresPackage(JSON.parse(content), sourceManifest.name),
        `npm uninstall left ${sourceManifest.name} in ${lockPath}.`,
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }

  console.log(
    `Clean-room package passed: ${artifactName}, ${paths.length} files, sha256 ${hashes[0]}, 13 stories.`,
  );
} finally {
  if (server) server.kill("SIGKILL");
  await fs.rm(temporaryRoot, { recursive: true, force: true });
}
