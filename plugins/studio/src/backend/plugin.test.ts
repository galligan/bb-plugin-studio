import { describe, expect, mock, test } from "bun:test";
import type { BbPluginApi } from "@bb/plugin-sdk";
import type {
  BatchProjectTargetAdmissionRequest,
  BatchProjectTargetAdmissionResponse,
  ProjectTargetControllerOptions,
  ProjectTargetController,
} from "@bb-plugin-studio/runtime/catalog";

mock.module("@bb/plugin-sdk", () => ({
  defineRpcContract: <T>(contract: T) => contract,
}));

const { createStudioPlugin } = await import("./plugin.ts");

const source = (overrides: Record<string, unknown> = {}) => ({
  id: "source-1",
  projectId: "project-1",
  updatedAt: 1,
  type: "local_path" as const,
  hostId: "host-1",
  path: "/Users/test/project",
  ...overrides,
});

const project = (overrides: Record<string, unknown> = {}) => ({
  id: "project-1",
  name: "Example",
  sources: [source()],
  threads: [],
  ...overrides,
});

function hostFixture(options: {
  projects?: ReturnType<typeof project>[];
  listProjects?: () => Promise<ReturnType<typeof project>[]>;
  getProject?: (projectId: string) => Promise<ReturnType<typeof project>>;
  controller: (
    input: BatchProjectTargetAdmissionRequest,
    signal: AbortSignal | undefined,
    beforeWrite: ProjectTargetControllerOptions["beforeCatalogMutation"],
  ) => ReturnType<ProjectTargetController["admit"]>;
}) {
  let handlers: Record<string, () => Promise<unknown>> | undefined;
  let dispose: (() => void | Promise<void>) | undefined;
  let controllerOptions: ProjectTargetControllerOptions | undefined;
  let closed = 0;
  const projects = options.projects ?? [project()];
  const catalog = { close: () => (closed += 1) };
  const bb = {
    storage: {},
    sdk: {
      system: {
        config: async () => ({ primaryHostId: "host-1", dataDir: "/bb" }),
      },
      projects: {
        list: options.listProjects ?? (async () => projects),
        get: async ({ projectId }: { projectId: string }) =>
          options.getProject?.(projectId) ??
          projects.find(({ id }) => id === projectId)!,
      },
    },
    rpc: {
      register: (_contract: unknown, value: typeof handlers) =>
        (handlers = value),
    },
    onDispose: (value: typeof dispose) => (dispose = value),
  } as unknown as BbPluginApi;
  let key = 0;
  createStudioPlugin({
    createOpaqueKey: () => String(++key).padStart(32, "0"),
    openCatalog: (() => catalog) as never,
    createController: ((input: ProjectTargetControllerOptions) => {
      controllerOptions = input;
      return {
        principalId: input.principalId,
        bbContextId: input.bbContextId,
        admit: (_context, request, signal) =>
          options.controller(request, signal, input.beforeCatalogMutation),
        list: () => ({ schemaVersion: 1, state: "ready", targets: [] }),
      } satisfies ProjectTargetController;
    }) as never,
  })(bb);
  return {
    handlers: () => handlers!,
    dispose: () => dispose!,
    closed: () => closed,
    controllerOptions: () => controllerOptions!,
  };
}

function admission(
  input: BatchProjectTargetAdmissionRequest,
): BatchProjectTargetAdmissionResponse {
  return {
    schemaVersion: 2 as const,
    state: "ready" as const,
    projects: input.projects.map(({ projectKey }) => ({
      projectKey,
      state: "ready" as const,
      targets: [
        {
          schemaVersion: 1 as const,
          kind: "development-target" as const,
          id: "t".repeat(32),
          revision: 1,
          createdAt: 1,
          updatedAt: 1,
          displayName: "Notes",
          displayPath: "plugins/notes",
          sourceKind: "workspace-discovered" as const,
          manifest: {
            pluginId: "notes",
            packageName: "bb-plugin-notes",
            version: "1.0.0",
            hasServer: true,
            hasApp: true,
          },
          native: { status: "absent" as const, observedAt: 1 },
          capabilities: { fixture: false, harness: false, live: false },
        },
      ],
    })),
  } as unknown as BatchProjectTargetAdmissionResponse;
}

describe("Plugin Studio in-process backend v4", () => {
  test("returns the catalog-only schema and scans only the revalidated primary source", async () => {
    const requests: BatchProjectTargetAdmissionRequest[] = [];
    const host = hostFixture({
      async controller(input, signal, beforeWrite) {
        signal?.throwIfAborted();
        await beforeWrite?.(signal);
        requests.push(input);
        return admission(input);
      },
    });

    expect(await host.handlers().status()).toEqual({
      schemaVersion: 4,
      browserLaunch: "unavailable",
      projects: {
        state: "ready",
        truncated: false,
        items: [
          expect.objectContaining({
            id: "project-1",
            scan: { state: "not_scanned", items: [] },
          }),
        ],
      },
    });
    expect(await host.handlers().refresh()).toMatchObject({
      schemaVersion: 4,
      browserLaunch: "unavailable",
      projects: {
        state: "ready",
        items: [
          {
            id: "project-1",
            label: "Example",
            activity: { active: false, lastThreadUpdatedAt: null },
            scan: {
              state: "ready",
              items: [{ pluginId: "notes", label: "Notes", revision: 1 }],
            },
          },
        ],
      },
    });
    expect(requests).toEqual([
      {
        schemaVersion: 2,
        inventoryState: "complete",
        projects: [
          {
            projectKey: "00000000000000000000000000000001",
            sourcePath: "/Users/test/project",
          },
        ],
      },
    ]);
  });

  test("shares one refresh and disposal aborts and drains it before releasing the catalog", async () => {
    let starts = 0;
    let observedAbort = false;
    let markStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => (markStarted = resolve));
    const host = hostFixture({
      controller(_input, signal) {
        starts += 1;
        markStarted?.();
        return new Promise((_resolve, reject) => {
          signal?.addEventListener(
            "abort",
            () => {
              observedAbort = true;
              reject(signal.reason);
            },
            { once: true },
          );
        });
      },
    });
    const first = host.handlers().refresh();
    const second = host.handlers().refresh();
    await started;
    const disposing = host.dispose()();

    await expect(first).rejects.toHaveProperty("name", "AbortError");
    await expect(second).rejects.toHaveProperty("name", "AbortError");
    await disposing;
    expect(starts).toBe(1);
    expect(observedAbort).toBe(true);
    expect(host.closed()).toBe(1);
  });

  test("fails closed before catalog mutation when bb changes source identity", async () => {
    let listCalls = 0;
    let writes = 0;
    const host = hostFixture({
      listProjects: async () => {
        listCalls += 1;
        return [
          project({
            sources: [source({ updatedAt: listCalls >= 3 ? 2 : 1 })],
          }),
        ];
      },
      async controller(input, signal, beforeWrite) {
        await beforeWrite?.(signal);
        writes += 1;
        return admission(input);
      },
    });

    const result = await host.handlers().refresh();
    expect(result).toMatchObject({
      schemaVersion: 4,
      projects: {
        state: "partial",
        items: [{ scan: { state: "unavailable", reason: "source_changed" } }],
      },
    });
    expect(writes).toBe(0);
    expect(JSON.stringify(result)).not.toContain("/Users/test");
  });

  test("never sends enrolled, mixed, or ambiguous paths to discovery", async () => {
    for (const [sources, expectedState] of [
      [[source({ hostId: "enrolled-host" })], "ready"],
      [
        [source(), source({ id: "source-2", hostId: "enrolled-host" })],
        "partial",
      ],
      [[source(), source({ id: "source-2" })], "partial"],
    ]) {
      let called = false;
      let scannedPaths: string[] = [];
      const host = hostFixture({
        projects: [project({ sources })],
        async controller(input) {
          called = true;
          scannedPaths = input.projects.map(({ sourcePath }) => sourcePath);
          return admission(input);
        },
      });
      const result = await host.handlers().refresh();
      expect(called).toBe(true);
      expect(scannedPaths).toEqual([]);
      expect(result).toMatchObject({ projects: { state: expectedState } });
      expect(JSON.stringify(result)).not.toContain("enrolled-host");
    }
  });
});
