import { randomBytes } from "node:crypto";
import { defineRpcContract, type BbPluginApi } from "@get-bb/plugin-sdk";
import {
  createRequestContext,
  createProjectTargetController,
  type BatchProjectTargetAdmissionResponse,
  type DevelopmentTargetCatalog,
  type ProjectTargetController,
} from "@bb-plugin-studio/runtime/catalog";
import { z } from "zod";

import {
  loadProjectInventory,
  resolveProjectSource,
  sameProjectSource,
  type ProjectInventory,
  type ReleasedProjectSdk,
  type ResolvedProjectSource,
} from "./project-adapter.ts";
import {
  openStudioCatalog,
  STUDIO_CATALOG_CONTEXT_ID,
  STUDIO_CATALOG_PRINCIPAL_ID,
} from "./studio-catalog.ts";
import {
  projectCatalogSchema,
  targetSummarySchema,
  workbenchSnapshotSchema,
  type PluginWorkbenchSnapshotV4,
  type ProjectCatalog,
  type ProjectOption,
  type TargetSummary,
} from "./workbench-contract.ts";

export const rpcContract = defineRpcContract({
  status: { input: z.object({}).strict(), output: workbenchSnapshotSchema },
  refresh: { input: z.object({}).strict(), output: workbenchSnapshotSchema },
});

interface StudioPluginOptions {
  readonly createOpaqueKey?: () => string;
  readonly openCatalog?: typeof openStudioCatalog;
  readonly createController?: typeof createProjectTargetController;
}

const context = createRequestContext({
  id: STUDIO_CATALOG_PRINCIPAL_ID,
  kind: "supervisor",
  scopes: ["runtime:read", "targets:read", "targets:write"],
  revoked: false,
  bbContextId: STUDIO_CATALOG_CONTEXT_ID,
});

function snapshot(projects: ProjectCatalog): PluginWorkbenchSnapshotV4 {
  return Object.freeze(
    workbenchSnapshotSchema.parse({
      schemaVersion: 4,
      browserLaunch: "unavailable",
      projects,
    }),
  );
}

function sourceMap(inventory: Extract<ProjectInventory, { state: "ready" }>) {
  return new Map(inventory.sources.map((source) => [source.projectId, source]));
}

async function revalidateSources(
  sdk: ReleasedProjectSdk,
  before: Extract<ProjectInventory, { state: "ready" }>,
  signal: AbortSignal,
): Promise<readonly ResolvedProjectSource[]> {
  try {
    signal.throwIfAborted();
    const after = await loadProjectInventory(sdk);
    signal.throwIfAborted();
    if (
      after.state === "unavailable" ||
      after.primaryHostId !== before.primaryHostId ||
      after.sources.length !== before.sources.length
    ) {
      throw new SourceChangedError();
    }
    const listed = sourceMap(after);
    if (
      before.sources.some((source) => {
        const current = listed.get(source.projectId);
        return !current || !sameProjectSource(source, current);
      })
    ) {
      throw new SourceChangedError();
    }
    const resolved = await Promise.all(
      before.sources.map((source) =>
        resolveProjectSource(sdk, source.projectId),
      ),
    );
    signal.throwIfAborted();
    if (
      resolved.some(
        (source, index) => !sameProjectSource(before.sources[index]!, source),
      )
    ) {
      throw new SourceChangedError();
    }
    return resolved;
  } catch (error) {
    signal.throwIfAborted();
    if (error instanceof SourceChangedError) throw error;
    throw new SourceChangedError();
  }
}

class SourceChangedError extends Error {}

function unavailableCatalog(
  catalog: Extract<ProjectCatalog, { state: "ready" | "partial" }>,
  reason: "source_changed" | "scan_failed",
): ProjectCatalog {
  return projectCatalogSchema.parse({
    state: "partial",
    truncated: catalog.truncated,
    items: catalog.items.map((project) => ({
      ...project,
      scan: { state: "unavailable", reason, items: [] },
    })),
  });
}

function projectTargets(
  targets: BatchProjectTargetAdmissionResponse["projects"][number]["targets"],
): TargetSummary[] | null {
  const projected: TargetSummary[] = [];
  for (const target of targets) {
    const input = {
      id: target.id,
      label: target.displayName,
      pluginId: target.manifest.pluginId,
      revision: target.revision,
    };
    const preferred = targetSummarySchema.safeParse(input);
    const fallback = preferred.success
      ? preferred
      : targetSummarySchema.safeParse({
          ...input,
          label: target.manifest.pluginId,
        });
    if (!fallback.success) return null;
    projected.push(fallback.data);
  }
  return projected.sort(
    (left, right) =>
      left.label.localeCompare(right.label) || left.id.localeCompare(right.id),
  );
}

function scannedCatalog(
  catalog: Extract<ProjectCatalog, { state: "ready" | "partial" }>,
  admissions: BatchProjectTargetAdmissionResponse,
  projectIdsByKey: ReadonlyMap<string, string>,
): ProjectCatalog {
  const scans = new Map<string, ProjectOption["scan"]>();
  for (const group of admissions.projects) {
    const projectId = projectIdsByKey.get(group.projectKey);
    const targets = projectTargets(group.targets);
    if (projectId === undefined || targets === null) continue;
    scans.set(projectId, { state: group.state, items: targets });
  }
  const items = catalog.items.map((project) => ({
    ...project,
    scan: scans.get(project.id) ?? {
      state: "unavailable" as const,
      reason: "scan_failed" as const,
      items: [] as const,
    },
  }));
  return projectCatalogSchema.parse({
    state:
      catalog.truncated ||
      items.some(
        ({ scan }) => scan.state === "partial" || scan.state === "unavailable",
      )
        ? "partial"
        : "ready",
    truncated: catalog.truncated,
    items,
  });
}

function allocateKey(createOpaqueKey: () => string, used: Set<string>) {
  for (let attempt = 0; attempt < 128; attempt += 1) {
    const key = createOpaqueKey();
    if (/^[A-Za-z0-9_-]{32}$/u.test(key) && !used.has(key)) {
      used.add(key);
      return key;
    }
  }
  throw new Error("opaque key allocation failed");
}

export function createStudioPlugin(options: StudioPluginOptions = {}) {
  const createOpaqueKey =
    options.createOpaqueKey ?? (() => randomBytes(24).toString("base64url"));
  return function studioPlugin(bb: BbPluginApi): void {
    const lifecycle = new AbortController();
    let catalog: DevelopmentTargetCatalog | undefined;
    let controller: ProjectTargetController | undefined;
    let mutationCheck: ((signal?: AbortSignal) => Promise<void>) | undefined;
    let refreshing: Promise<PluginWorkbenchSnapshotV4> | undefined;
    let lastGood:
      Extract<ProjectCatalog, { state: "ready" | "partial" }> | undefined;

    const sdk: ReleasedProjectSdk = {
      system: {
        async config() {
          lifecycle.signal.throwIfAborted();
          const value = await bb.sdk.system.config();
          lifecycle.signal.throwIfAborted();
          return { primaryHostId: value.primaryHostId, dataDir: value.dataDir };
        },
      },
      projects: {
        async list(input) {
          lifecycle.signal.throwIfAborted();
          const value = await bb.sdk.projects.list(input);
          lifecycle.signal.throwIfAborted();
          return value;
        },
        async get({ projectId }) {
          lifecycle.signal.throwIfAborted();
          const value = await bb.sdk.projects.get({ projectId });
          lifecycle.signal.throwIfAborted();
          return value;
        },
      },
    };

    const ensureController = () => {
      lifecycle.signal.throwIfAborted();
      if (controller) return controller;
      catalog = (options.openCatalog ?? openStudioCatalog)(bb.storage);
      controller = (options.createController ?? createProjectTargetController)({
        catalog,
        principalId: STUDIO_CATALOG_PRINCIPAL_ID,
        bbContextId: STUDIO_CATALOG_CONTEXT_ID,
        beforeCatalogMutation: (signal) =>
          mutationCheck?.(signal) ?? Promise.resolve(),
      });
      return controller;
    };

    const status = async () => {
      const inventory = await loadProjectInventory(sdk);
      return snapshot(
        inventory.state === "ready"
          ? inventory.catalog
          : (lastGood ?? inventory.catalog),
      );
    };

    const executeRefresh = async (): Promise<PluginWorkbenchSnapshotV4> => {
      const signal = lifecycle.signal;
      signal.throwIfAborted();
      const before = await loadProjectInventory(sdk);
      if (before.state === "unavailable") {
        return snapshot(lastGood ?? before.catalog);
      }
      try {
        const stable = await revalidateSources(sdk, before, signal);
        const used = new Set<string>();
        const projects = stable.map((source) => ({
          projectId: source.projectId,
          projectKey: allocateKey(createOpaqueKey, used),
          sourcePath: source.path,
        }));
        mutationCheck = async (mutationSignal) => {
          mutationSignal?.throwIfAborted();
          await revalidateSources(sdk, before, signal);
          mutationSignal?.throwIfAborted();
        };
        const result = await ensureController().admit(
          context,
          {
            schemaVersion: 2,
            inventoryState: before.inventoryState,
            projects: projects.map(({ projectKey, sourcePath }) => ({
              projectKey,
              sourcePath,
            })),
          },
          signal,
        );
        signal.throwIfAborted();
        const projectsByKey = new Map(
          projects.map(({ projectId, projectKey }) => [projectKey, projectId]),
        );
        const refreshed = scannedCatalog(before.catalog, result, projectsByKey);
        if (refreshed.state !== "unavailable") lastGood = refreshed;
        return snapshot(refreshed);
      } catch (error) {
        signal.throwIfAborted();
        return snapshot(
          unavailableCatalog(
            lastGood ?? before.catalog,
            error instanceof SourceChangedError
              ? "source_changed"
              : "scan_failed",
          ),
        );
      } finally {
        mutationCheck = undefined;
      }
    };

    const refresh = () => {
      if (refreshing) return refreshing;
      const current = executeRefresh();
      refreshing = current;
      void current.then(
        () => {
          if (refreshing === current) refreshing = undefined;
        },
        () => {
          if (refreshing === current) refreshing = undefined;
        },
      );
      return current;
    };

    bb.rpc.register(rpcContract, { status, refresh });
    bb.onDispose(async () => {
      lifecycle.abort();
      await refreshing?.catch(() => undefined);
      catalog?.close();
    });
  };
}

export default createStudioPlugin();
