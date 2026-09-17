import { describe, expect, test } from "bun:test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  deriveRuntimeDataRoot,
  loadProjectInventory,
  listProjectOptions,
  resolveProjectSource,
} from "./project-adapter.ts";
import { STUDIO_FEATURE_FLAGS } from "./studio-feature-flags.ts";

const source = (overrides: Record<string, unknown> = {}) => ({
  id: "source-1",
  projectId: "project-1",
  isDefault: false,
  createdAt: 1,
  updatedAt: 2,
  type: "local_path" as const,
  hostId: "host-1",
  path: "/Users/test/project",
  ...overrides,
});

const project = (overrides: Record<string, unknown> = {}) => ({
  id: "project-1",
  kind: "standard" as const,
  name: "Example",
  gitRemoteUrl: null,
  createdAt: 1,
  updatedAt: 2,
  sources: [source()],
  threads: [],
  ...overrides,
});

function sdk(projects = [project()], primaryHostId: string | null = "host-1") {
  const listInputs: unknown[] = [];
  return {
    listInputs,
    system: { config: async () => ({ primaryHostId, dataDir: "/bb-data" }) },
    projects: {
      list: async (input?: unknown) => {
        listInputs.push(input);
        return projects;
      },
      get: async ({ projectId }: { projectId: string }) => {
        const found = projects.find(({ id }) => id === projectId);
        if (!found) throw new Error("private upstream detail");
        return found;
      },
    },
  };
}

describe("released bb project adapter", () => {
  test("ships enrolled-host discovery disabled and omits remote-only projects", async () => {
    expect(STUDIO_FEATURE_FLAGS.enrolledHostDiscovery).toBe(false);

    const inventory = await loadProjectInventory(
      sdk([
        project({
          sources: [source({ hostId: "enrolled-host" })],
        }),
      ]),
    );

    expect(inventory).toMatchObject({
      state: "ready",
      inventoryState: "complete",
      catalog: { state: "ready", truncated: false, items: [] },
      sources: [],
    });
    expect(JSON.stringify(inventory)).not.toContain("enrolled-host");
    await expect(
      resolveProjectSource(
        sdk([project({ sources: [source({ hostId: "enrolled-host" })] })]),
        "project-1",
      ),
    ).rejects.toThrow("Project source unavailable");
  });

  test("returns path-free rows beside server-private source identities", async () => {
    const inventory = await loadProjectInventory(sdk());
    expect(inventory.catalog.items).toEqual([
      {
        id: "project-1",
        label: "Example",
        activity: { active: false, lastThreadUpdatedAt: null },
        scan: { state: "not_scanned", items: [] },
      },
    ]);
    expect(inventory.sources).toEqual([
      {
        projectId: "project-1",
        sourceId: "source-1",
        updatedAt: 2,
        hostId: "host-1",
        path: "/Users/test/project",
      },
    ]);
    expect(JSON.stringify(inventory.catalog)).not.toContain("/Users/test");
  });

  test("keeps eligible projects with browser-unsafe names using deterministic path-free labels", async () => {
    const projects = [
      project({
        id: "project-slash",
        name: "Client / API",
        sources: [
          source({ projectId: "project-slash", path: "/Users/test/slash" }),
        ],
      }),
      project({
        id: "project-control",
        name: "Client\u0000API",
        sources: [
          source({
            id: "source-control",
            projectId: "project-control",
            path: "/Users/test/control",
          }),
        ],
      }),
      project({
        id: "project-long",
        name: "A".repeat(257),
        sources: [
          source({
            id: "source-long",
            projectId: "project-long",
            path: "/Users/test/long",
          }),
        ],
      }),
      project({
        id: "project-safe",
        name: "Safe Project",
        sources: [
          source({
            id: "source-safe",
            projectId: "project-safe",
            path: "/Users/test/safe",
          }),
        ],
      }),
    ];

    const inventory = await loadProjectInventory(sdk(projects));
    expect(
      inventory.catalog.items.map(({ id, label }) => ({ id, label })),
    ).toEqual([
      { id: "project-slash", label: "Project project-slash" },
      { id: "project-control", label: "Project project-control" },
      { id: "project-long", label: "Project project-long" },
      { id: "project-safe", label: "Safe Project" },
    ]);
    expect(inventory.sources).toHaveLength(4);
    expect(JSON.stringify(inventory.catalog)).not.toContain("/Users/test");
  });

  test("admits exactly one same-project source on the primary host without requiring default", async () => {
    const api = sdk();
    expect(await listProjectOptions(api)).toEqual({
      state: "ready",
      truncated: false,
      items: [
        {
          id: "project-1",
          label: "Example",
          activity: { active: false, lastThreadUpdatedAt: null },
          scan: { state: "not_scanned", items: [] },
        },
      ],
    });
    expect(api.listInputs).toEqual([{ include: "threads" }]);
    expect(await resolveProjectSource(api, "project-1")).toMatchObject({
      projectId: "project-1",
      sourceId: "source-1",
      path: "/Users/test/project",
    });
  });

  test("fails closed for zero, foreign-project, malformed, or ambiguous sources", async () => {
    const variants = [
      [],
      [source({ projectId: "other" })],
      [source(), source({ id: "source-2" })],
      [source(), source({ id: "source-2", hostId: "host-2" })],
      [source({ path: "../relative" })],
      [source({ type: "remote_clone" })],
    ];
    for (const sources of variants) {
      const api = sdk([project({ sources })]);
      expect(await listProjectOptions(api)).toEqual({
        state: "partial",
        truncated: true,
        items: [],
      });
      await expect(resolveProjectSource(api, "project-1")).rejects.toThrow(
        "Project source unavailable",
      );
    }
  });

  test("sorts and bounds the path-free project projection", async () => {
    const api = sdk([
      project({ id: "project-b", name: "Zulu", sources: [] }),
      project({ id: "project-a", name: "Alpha", sources: [] }),
      project({ id: "../private", name: "Leaky", sources: [] }),
      project({ id: "project-path", name: "folder/project", sources: [] }),
    ]);
    expect(await listProjectOptions(api)).toEqual({
      state: "partial",
      truncated: true,
      items: [],
    });
  });

  test("marks omitted ineligible projects partial without crowding out an eligible Zulu project", async () => {
    const ineligible = Array.from({ length: 128 }, (_, index) =>
      project({
        id: `project-${String(index).padStart(3, "0")}`,
        name: `Alpha ${String(index).padStart(3, "0")}`,
        sources: [],
      }),
    );
    const eligible = project({
      id: "project-zulu",
      name: "Zulu",
      sources: [
        source({
          id: "source-zulu",
          projectId: "project-zulu",
          path: "/Users/test/zulu",
        }),
      ],
    });
    const result = await listProjectOptions(sdk([...ineligible, eligible]));
    expect(result).toEqual({
      state: "partial",
      truncated: true,
      items: [
        {
          id: "project-zulu",
          label: "Zulu",
          activity: { active: false, lastThreadUpdatedAt: null },
          scan: { state: "not_scanned", items: [] },
        },
      ],
    });
  });

  test("sorts and bounds eligible projects at the exact 128-item boundary", async () => {
    const projects = Array.from({ length: 129 }, (_, index) =>
      project({
        id: `project-${String(index).padStart(3, "0")}`,
        name: `Project ${String(index).padStart(3, "0")}`,
        sources: [
          source({
            id: `source-${index}`,
            projectId: `project-${String(index).padStart(3, "0")}`,
            path: `/Users/test/project-${index}`,
          }),
        ],
      }),
    );
    const inventory = await loadProjectInventory(sdk(projects));
    expect(inventory.state).toBe("ready");
    if (inventory.state !== "ready") throw new Error("Expected inventory");
    expect(inventory.inventoryState).toBe("partial");
    const result = inventory.catalog;
    expect(result.state).toBe("partial");
    expect(result.truncated).toBe(true);
    expect(result.items).toHaveLength(128);
    expect(result.items[0]?.id).toBe("project-000");
    expect(result.items.at(-1)?.id).toBe("project-127");
    expect(result.items.some(({ id }) => id === "project-128")).toBe(false);
    expect(new Set(result.items.map(({ id }) => id)).size).toBe(128);
  });

  test("orders active and recently used projects without filtering idle projects", async () => {
    const thread = (overrides: Record<string, unknown> = {}) => ({
      visibility: "visible" as const,
      deletedAt: null,
      updatedAt: 10,
      status: "idle" as const,
      runtime: { displayStatus: "idle" as const },
      activity: {
        activeWorkflowCount: 0,
        activeBackgroundAgentCount: 0,
        activeBackgroundCommandCount: 0,
        activePlanModeCount: 0,
        activeGoalCount: 0,
      },
      hasPendingInteraction: false,
      ...overrides,
    });
    const projects = [
      project({
        id: "project-idle",
        name: "Idle",
        sources: [
          source({
            id: "source-idle",
            projectId: "project-idle",
            path: "/Users/test/idle",
          }),
        ],
      }),
      project({
        id: "project-recent",
        name: "Recent",
        sources: [
          source({
            id: "source-recent",
            projectId: "project-recent",
            path: "/Users/test/recent",
          }),
        ],
        threads: [thread({ updatedAt: 20 })],
      }),
      project({
        id: "project-active",
        name: "Active",
        sources: [
          source({
            id: "source-active",
            projectId: "project-active",
            path: "/Users/test/active",
          }),
        ],
        threads: [thread({ updatedAt: 5, status: "active" })],
      }),
      project({
        id: "project-hidden",
        name: "Hidden activity",
        sources: [
          source({
            id: "source-hidden",
            projectId: "project-hidden",
            path: "/Users/test/hidden",
          }),
        ],
        threads: [
          thread({ visibility: "hidden", updatedAt: 100, status: "active" }),
          thread({ deletedAt: 99, updatedAt: 101, status: "active" }),
        ],
      }),
    ];

    const result = await listProjectOptions(sdk(projects));
    expect(result.items.map(({ id }) => id)).toEqual([
      "project-active",
      "project-recent",
      "project-idle",
      "project-hidden",
    ]);
    expect(result.items[0]?.activity).toEqual({
      active: true,
      lastThreadUpdatedAt: 5,
    });
    expect(result.items[3]?.activity).toEqual({
      active: false,
      lastThreadUpdatedAt: null,
    });
  });

  test("recognizes every released visible-thread activity signal", async () => {
    const baseThread = {
      visibility: "visible" as const,
      deletedAt: null,
      updatedAt: 10,
      status: "idle" as const,
      runtime: { displayStatus: "idle" as const },
      activity: {
        activeWorkflowCount: 0,
        activeBackgroundAgentCount: 0,
        activeBackgroundCommandCount: 0,
        activePlanModeCount: 0,
        activeGoalCount: 0,
      },
      hasPendingInteraction: false,
    };
    const signals = [
      { status: "starting" },
      { status: "active" },
      { status: "stopping" },
      { runtime: { displayStatus: "waiting-for-host" } },
      { hasPendingInteraction: true },
      { activity: { ...baseThread.activity, activeWorkflowCount: 1 } },
      { activity: { ...baseThread.activity, activeBackgroundAgentCount: 1 } },
      {
        activity: { ...baseThread.activity, activeBackgroundCommandCount: 1 },
      },
      { activity: { ...baseThread.activity, activePlanModeCount: 1 } },
      { activity: { ...baseThread.activity, activeGoalCount: 1 } },
    ];
    for (const [index, signal] of signals.entries()) {
      const id = `project-signal-${index}`;
      const result = await listProjectOptions(
        sdk([
          project({
            id,
            sources: [
              source({
                id: `source-signal-${index}`,
                projectId: id,
                path: `/Users/test/signal-${index}`,
              }),
            ],
            threads: [{ ...baseThread, ...signal }],
          }),
        ]),
      );
      expect(result.items[0]?.activity.active).toBe(true);
    }
  });

  test("derives only the fixed runtime leaf from a canonical bb data directory", async () => {
    const parent = await fs.mkdtemp(
      path.join(os.tmpdir(), "studio-project-adapter-"),
    );
    const dataDir = path.join(parent, "bb-data");
    await fs.mkdir(dataDir);
    expect(await deriveRuntimeDataRoot(dataDir)).toBe(
      path.join(await fs.realpath(dataDir), "plugins/studio/runtime"),
    );
    for (const value of ["", ".", "/", "/tmp/../private", "/tmp/", "/tmp\0x"])
      await expect(deriveRuntimeDataRoot(value)).rejects.toThrow(
        "Runtime data directory unavailable",
      );
    const alias = path.join(parent, "alias");
    await fs.symlink(dataDir, alias);
    await expect(deriveRuntimeDataRoot(alias)).resolves.toBe(
      path.join(await fs.realpath(dataDir), "plugins/studio/runtime"),
    );
    const unsafeDataDir = path.join(parent, "unsafe-data");
    const outside = path.join(parent, "outside");
    await fs.mkdir(unsafeDataDir);
    await fs.mkdir(outside);
    await fs.symlink(outside, path.join(unsafeDataDir, "plugins"));
    await expect(deriveRuntimeDataRoot(unsafeDataDir)).rejects.toThrow(
      "Runtime data directory unavailable",
    );
    await fs.rm(parent, { recursive: true, force: true });
  });
});
