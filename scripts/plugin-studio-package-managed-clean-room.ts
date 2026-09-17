import { promises as fs } from "node:fs";
import path from "node:path";
import { inspectPluginStudioPackageDirectory } from "./inspect-plugin-studio-package.ts";
import {
  assertCatalogRefresh,
  callStudioRpc,
  type StudioSnapshot,
} from "./plugin-studio-managed-rpc.ts";
import {
  PLUGIN_STUDIO_PACKAGE_NAME,
  PLUGIN_STUDIO_PACKAGE_VERSION,
  startPluginStudioPackageRegistry,
} from "./plugin-studio-package-registry.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function run(
  executable: string,
  args: readonly string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
): Promise<string> {
  const child = Bun.spawn([executable, ...args], {
    cwd,
    env,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  assert(
    exitCode === 0,
    `${path.basename(executable)} ${args.join(" ")} exited with ${exitCode}: ${stderr.trim()}`,
  );
  return stdout;
}

async function freePortPair(): Promise<readonly [number, number]> {
  const first = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () => new Response("probe"),
  });
  const second = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () => new Response("probe"),
  });
  const ports = [first.port, second.port] as const;
  first.stop(true);
  second.stop(true);
  assert(
    ports[0] !== undefined && ports[1] !== undefined && ports[0] !== ports[1],
    "Could not allocate distinct clean-room ports.",
  );
  return ports as readonly [number, number];
}

async function waitForServer(
  baseUrl: string,
  closed: Promise<number>,
): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const ready = await Promise.race([
      fetch(`${baseUrl}/health`)
        .then((response) => response.ok)
        .catch(() => false),
      closed.then((code) => {
        throw new Error(
          `Disposable bb server exited before readiness (${code}).`,
        );
      }),
    ]);
    if (ready) return;
    await Bun.sleep(50);
  }
  throw new Error("Disposable bb server did not become ready within 10s.");
}

async function waitFor<T>(
  probe: () => Promise<T | undefined>,
  label: string,
): Promise<T> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const value = await probe();
    if (value !== undefined) return value;
    await Bun.sleep(50);
  }
  throw new Error(`Timed out waiting for ${label}.`);
}

async function processGroup(
  processGroupId: number,
): Promise<ReadonlyMap<number, string>> {
  const child = Bun.spawn(["/bin/ps", "-axo", "pid=,pgid=,command="], {
    env: {},
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    child.exited,
  ]);
  assert(exitCode === 0, "Could not inspect disposable bb process group.");
  const result = new Map<number, string>();
  for (const line of stdout.split("\n")) {
    const match = /^\s*(\d+)\s+(\d+)\s+(.+)$/u.exec(line);
    if (match && Number(match[2]) === processGroupId)
      result.set(Number(match[1]), match[3]!);
  }
  return result;
}

async function listeners(
  processes: ReadonlyMap<number, string>,
): Promise<readonly string[]> {
  const values: string[] = [];
  for (const pid of processes.keys()) {
    const child = Bun.spawn(
      [
        "/usr/sbin/lsof",
        "-Pan",
        "-p",
        String(pid),
        "-iTCP",
        "-sTCP:LISTEN",
        "-Fn",
      ],
      { env: {}, stdout: "pipe", stderr: "pipe" },
    );
    const [stdout] = await Promise.all([
      new Response(child.stdout).text(),
      child.exited,
    ]);
    values.push(
      ...stdout
        .split("\n")
        .filter((line) => line.startsWith("n"))
        .map((line) => `${pid}:${line}`),
    );
  }
  return values.sort();
}

async function assertProcessFootprintUnchanged(
  processGroupId: number,
  expectedProcesses: ReadonlyMap<number, string>,
  expectedListeners: readonly string[],
  operation: string,
): Promise<void> {
  await Bun.sleep(200);
  const actualProcesses = await processGroup(processGroupId);
  const actualListeners = await listeners(actualProcesses);
  assert(
    JSON.stringify([...actualProcesses.entries()]) ===
      JSON.stringify([...expectedProcesses.entries()]),
    `Studio ${operation} changed the disposable bb process group.\nexpected=${JSON.stringify([...expectedProcesses.entries()])}\nactual=${JSON.stringify([...actualProcesses.entries()])}`,
  );
  assert(
    JSON.stringify(actualListeners) === JSON.stringify(expectedListeners),
    `Studio ${operation} changed the disposable bb listener set.`,
  );
}

async function createProject(args: {
  bbExecutable: string;
  cwd: string;
  env: NodeJS.ProcessEnv;
  machineId: string;
  name: string;
  root: string;
}): Promise<string> {
  const output = await run(
    args.bbExecutable,
    [
      "project",
      "create",
      "--name",
      args.name,
      "--root",
      args.root,
      "--machine",
      args.machineId,
      "--json",
    ],
    args.cwd,
    args.env,
  );
  const project = JSON.parse(output) as { id?: unknown };
  assert(
    typeof project.id === "string",
    `Disposable bb did not create ${args.name}.`,
  );
  return project.id;
}

function assertSchemaV4(snapshot: StudioSnapshot): void {
  assert(
    snapshot.schemaVersion === 4 && snapshot.browserLaunch === "unavailable",
    "Studio did not return schema v4.",
  );
  assert(
    snapshot.projects.state === "ready" ||
      snapshot.projects.state === "partial",
    "Studio project catalog is unavailable.",
  );
}

export function assertExpectedManagedCatalog(
  snapshot: StudioSnapshot,
  expected: {
    readonly studioProjectId: string;
    readonly gridProjectId: string;
    readonly studioTargets: readonly {
      readonly label: string;
      readonly pluginId: string;
    }[];
  },
): void {
  assertSchemaV4(snapshot);
  assert(
    snapshot.projects.state === "ready" && !snapshot.projects.truncated,
    `Studio did not return the expected managed catalog: ${JSON.stringify(snapshot.projects)}.`,
  );
  const actual = [...snapshot.projects.items]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((project) => ({
      id: project.id,
      label: project.label,
      activity: project.activity,
      scan: {
        state: project.scan.state,
        items: project.scan.items.map(({ label, pluginId }) => ({
          label,
          pluginId,
        })),
      },
    }));
  const wanted = [
    {
      id: expected.studioProjectId,
      label: "bb Plugin Studio",
      activity: { active: false, lastThreadUpdatedAt: null },
      scan: { state: "ready", items: expected.studioTargets },
    },
    {
      id: expected.gridProjectId,
      label: "grid",
      activity: { active: false, lastThreadUpdatedAt: null },
      scan: { state: "ready", items: [] },
    },
  ].sort((left, right) => left.id.localeCompare(right.id));
  assert(
    JSON.stringify(actual) === JSON.stringify(wanted),
    `Studio did not return the expected managed catalog: ${JSON.stringify(actual)}.`,
  );
}

export function assertManagedRefreshConvergence(
  first: StudioSnapshot,
  second: StudioSnapshot,
): void {
  assert(
    JSON.stringify(first) === JSON.stringify(second),
    "Concurrent Studio refreshes did not converge.",
  );
}

export function assertManagedCatalogContinuation(
  before: StudioSnapshot,
  after: StudioSnapshot,
): void {
  assertCatalogRefresh(before, after);
}

async function assertMarkersAbsent(
  ...markers: readonly string[]
): Promise<void> {
  for (const marker of markers)
    assert(
      !(await fs
        .access(marker)
        .then(() => true)
        .catch(() => false)),
      `Clean-room sentinel was executed: ${path.basename(marker)}.`,
    );
}

export async function verifyManagedPluginStudioPackage(args: {
  artifactPath: string;
  integrity: string;
  shasum: string;
  temporaryRoot: string;
  hostileCwd: string;
  env: NodeJS.ProcessEnv;
  bbExecutable: string;
  bbAppExecutable: string;
  bbPluginStudioSourceRoot: string;
  gridSourceRoot: string;
  targetMarker: string;
  ambientMarker: string;
}): Promise<void> {
  const registry = startPluginStudioPackageRegistry({
    artifactPath: args.artifactPath,
    integrity: args.integrity,
    shasum: args.shasum,
  });
  const [serverPort, hostDaemonPort] = await freePortPair();
  const serverUrl = `http://127.0.0.1:${serverPort}`;
  const dataDir = path.join(args.temporaryRoot, "managed-bb-data");
  await fs.mkdir(dataDir, { recursive: true });
  const env = {
    ...args.env,
    BB_DATA_DIR: dataDir,
    BB_SERVER_URL: serverUrl,
    npm_config_registry: registry.baseUrl,
  };
  const server = Bun.spawn(
    [
      args.bbAppExecutable,
      "--data-dir",
      dataDir,
      "--server-bind-host",
      "127.0.0.1",
      "--server-port",
      String(serverPort),
      "--host-daemon-port",
      String(hostDaemonPort),
    ],
    {
      cwd: args.hostileCwd,
      detached: true,
      env,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const stdout = new Response(server.stdout).text();
  const stderr = new Response(server.stderr).text();
  try {
    await waitForServer(serverUrl, server.exited);
    const install = JSON.parse(
      await run(
        args.bbExecutable,
        [
          "plugin",
          "install",
          `npm:${PLUGIN_STUDIO_PACKAGE_NAME}@${PLUGIN_STUDIO_PACKAGE_VERSION}`,
          "--yes",
          "--json",
        ],
        args.hostileCwd,
        env,
      ),
    ) as {
      ok?: unknown;
      plugin?: { id?: unknown; version?: unknown; source?: unknown };
    };
    assert(
      install.ok === true &&
        install.plugin?.id === "studio" &&
        install.plugin.version === PLUGIN_STUDIO_PACKAGE_VERSION &&
        install.plugin.source ===
          `npm:${PLUGIN_STUDIO_PACKAGE_NAME}@${PLUGIN_STUDIO_PACKAGE_VERSION}`,
      "Disposable bb did not report the exact managed-npm Studio install.",
    );
    const installedPackageRoot = path.join(
      dataDir,
      "plugins",
      "cache",
      "npm",
      PLUGIN_STUDIO_PACKAGE_NAME,
      PLUGIN_STUDIO_PACKAGE_VERSION,
      "node_modules",
      PLUGIN_STUDIO_PACKAGE_NAME,
    );
    await inspectPluginStudioPackageDirectory(installedPackageRoot);
    const packagedFiles = await Array.fromAsync(
      new Bun.Glob("**/*").scan({ cwd: installedPackageRoot, onlyFiles: true }),
    );
    assert(
      packagedFiles.every(
        (file) =>
          !file.startsWith("runtime/") && !file.includes("runtime-artifact"),
      ),
      "Managed package still embeds a child runtime.",
    );

    const machineId = await waitFor(async () => {
      const machines = JSON.parse(
        await run(
          args.bbExecutable,
          ["machine", "list", "--json"],
          args.hostileCwd,
          env,
        ),
      ) as Array<{ id?: unknown; status?: unknown }>;
      return machines.find(
        (machine) =>
          machine.status === "connected" && typeof machine.id === "string",
      )?.id as string | undefined;
    }, "disposable host enrollment");
    const [studioProjectId, gridProjectId] = await Promise.all([
      createProject({
        bbExecutable: args.bbExecutable,
        cwd: args.hostileCwd,
        env,
        machineId,
        name: "bb Plugin Studio",
        root: args.bbPluginStudioSourceRoot,
      }),
      createProject({
        bbExecutable: args.bbExecutable,
        cwd: args.hostileCwd,
        env,
        machineId,
        name: "grid",
        root: args.gridSourceRoot,
      }),
    ]);
    const status = await callStudioRpc(serverUrl, "status", {});
    assertSchemaV4(status);
    const beforeProcesses = await processGroup(server.pid);
    const beforeListeners = await listeners(beforeProcesses);
    const expectedCatalog = {
      studioProjectId,
      gridProjectId,
      studioTargets: [
        { label: "Linear", pluginId: "linear" },
        { label: "Plugin Studio", pluginId: "plugin-studio" },
      ],
    };
    const [refresh, concurrentRefresh] = await Promise.all([
      callStudioRpc(serverUrl, "refresh", {}),
      callStudioRpc(serverUrl, "refresh", {}),
    ]);
    assertExpectedManagedCatalog(refresh, expectedCatalog);
    assertExpectedManagedCatalog(concurrentRefresh, expectedCatalog);
    assertManagedRefreshConvergence(refresh, concurrentRefresh);
    await assertMarkersAbsent(args.targetMarker, args.ambientMarker);
    await assertProcessFootprintUnchanged(
      server.pid,
      beforeProcesses,
      beforeListeners,
      "refresh",
    );

    await run(
      args.bbExecutable,
      ["plugin", "reload", "studio", "--json"],
      args.hostileCwd,
      env,
    );
    const reloaded = await callStudioRpc(serverUrl, "refresh", {});
    assertExpectedManagedCatalog(reloaded, expectedCatalog);
    assertManagedCatalogContinuation(refresh, reloaded);
    await assertProcessFootprintUnchanged(
      server.pid,
      beforeProcesses,
      beforeListeners,
      "reload",
    );
    await run(
      args.bbExecutable,
      ["plugin", "disable", "studio", "--json"],
      args.hostileCwd,
      env,
    );
    const disabled = await fetch(
      `${serverUrl}/api/v1/plugins/studio/rpc/status`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      },
    );
    assert(disabled.status === 503, "Disabled Studio RPC remained available.");
    await assertProcessFootprintUnchanged(
      server.pid,
      beforeProcesses,
      beforeListeners,
      "disable",
    );
    await run(
      args.bbExecutable,
      ["plugin", "enable", "studio", "--json"],
      args.hostileCwd,
      env,
    );
    const enabled = await callStudioRpc(serverUrl, "refresh", {});
    assertExpectedManagedCatalog(enabled, expectedCatalog);
    assertManagedCatalogContinuation(reloaded, enabled);
    await assertMarkersAbsent(args.targetMarker, args.ambientMarker);
    await assertProcessFootprintUnchanged(
      server.pid,
      beforeProcesses,
      beforeListeners,
      "enable",
    );
    await run(
      args.bbExecutable,
      ["plugin", "remove", "studio", "--json"],
      args.hostileCwd,
      env,
    );
    await assertProcessFootprintUnchanged(
      server.pid,
      beforeProcesses,
      beforeListeners,
      "remove",
    );
    await Promise.all(
      [studioProjectId, gridProjectId].map((id) =>
        run(
          args.bbExecutable,
          ["project", "delete", id, "--yes", "--json"],
          args.hostileCwd,
          env,
        ),
      ),
    );
  } finally {
    registry.stop();
    try {
      process.kill(-server.pid, "SIGTERM");
    } catch {}
    let exitCode = await Promise.race([
      server.exited,
      Bun.sleep(5_000).then(() => null),
    ]);
    if (exitCode === null) {
      try {
        process.kill(-server.pid, "SIGKILL");
      } catch {}
      exitCode = await Promise.race([
        server.exited,
        Bun.sleep(2_000).then(() => null),
      ]);
    }
    const [out, err] = await Promise.all([stdout, stderr]);
    assert(
      exitCode !== null,
      `Disposable bb app did not stop: ${(err || out).slice(-2_000)}`,
    );
  }
}
