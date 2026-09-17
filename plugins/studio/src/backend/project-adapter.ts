import path from "node:path";
import { promises as fs } from "node:fs";
import {
  BatchProjectTargetAdmissionRequestSchema,
  TARGET_ADMISSION_MAX_PROJECTS,
} from "@bb-plugin-studio/runtime/supervision";

import {
  projectCatalogSchema,
  projectIdSchema,
  projectOptionSchema,
  type ProjectCatalog,
} from "./workbench-contract.ts";
import {
  STUDIO_FEATURE_FLAGS,
  type StudioFeatureFlags,
} from "./studio-feature-flags.ts";

interface ProjectSourceLike {
  readonly id?: unknown;
  readonly projectId?: unknown;
  readonly updatedAt?: unknown;
  readonly type?: unknown;
  readonly hostId?: unknown;
  readonly path?: unknown;
}

interface ProjectLike {
  readonly id: string;
  readonly name: string;
  readonly sources: readonly ProjectSourceLike[];
  readonly threads?: readonly ProjectThreadLike[];
}

interface ProjectThreadLike {
  readonly visibility?: unknown;
  readonly deletedAt?: unknown;
  readonly updatedAt?: unknown;
  readonly status?: unknown;
  readonly runtime?: { readonly displayStatus?: unknown } | null;
  readonly activity?: {
    readonly activeWorkflowCount?: unknown;
    readonly activeBackgroundAgentCount?: unknown;
    readonly activeBackgroundCommandCount?: unknown;
    readonly activePlanModeCount?: unknown;
    readonly activeGoalCount?: unknown;
  } | null;
  readonly hasPendingInteraction?: unknown;
}

export interface ReleasedProjectSdk {
  readonly system: {
    config(): Promise<{
      readonly primaryHostId: string | null;
      readonly dataDir: string;
    }>;
  };
  readonly projects: {
    list(input?: {
      readonly include?: "threads";
    }): Promise<readonly ProjectLike[]>;
    get(input: { readonly projectId: string }): Promise<ProjectLike>;
  };
}

export interface ResolvedProjectSource {
  readonly projectId: string;
  readonly sourceId: string;
  readonly updatedAt: number;
  readonly hostId: string;
  readonly path: string;
}

export type ProjectInventory =
  | {
      readonly state: "ready";
      readonly inventoryState: "complete" | "partial";
      readonly catalog: Extract<ProjectCatalog, { state: "ready" | "partial" }>;
      readonly sources: readonly ResolvedProjectSource[];
      readonly primaryHostId: string;
      readonly dataDir: string;
    }
  | {
      readonly state: "unavailable";
      readonly catalog: Extract<ProjectCatalog, { state: "unavailable" }>;
      readonly sources: readonly [];
    };

function sourceFor(project: ProjectLike, primaryHostId: string | null) {
  if (!primaryHostId) return null;
  // Mixed or multiple source declarations cannot prove which host-owned path
  // is authoritative, even when exactly one happens to name the primary host.
  if (project.sources.length !== 1) return null;
  const matches = project.sources.filter(
    (source) =>
      source.type === "local_path" &&
      source.projectId === project.id &&
      source.hostId === primaryHostId,
  );
  const source = matches.length === 1 ? matches[0]! : null;
  if (!(
    source &&
    typeof source.id === "string" &&
    typeof source.updatedAt === "number" &&
    Number.isSafeInteger(source.updatedAt) &&
    typeof source.path === "string"
  ))
    return null;
  const admission = BatchProjectTargetAdmissionRequestSchema.safeParse({
    schemaVersion: 2,
    inventoryState: "complete",
    projects: [{ projectKey: "p".repeat(32), sourcePath: source.path }],
  });
  return admission.success
    ? {
        id: source.id,
        updatedAt: source.updatedAt,
        hostId: primaryHostId,
        path: admission.data.projects[0]!.sourcePath,
      }
    : null;
}

function isDisabledEnrolledHostProject(
  project: ProjectLike,
  primaryHostId: string,
  featureFlags: StudioFeatureFlags,
) {
  if (featureFlags.enrolledHostDiscovery || project.sources.length !== 1) {
    return false;
  }
  const source = project.sources[0]!;
  return (
    source.type === "local_path" &&
    source.projectId === project.id &&
    typeof source.hostId === "string" &&
    source.hostId !== primaryHostId
  );
}

export async function listProjectOptions(
  sdk: ReleasedProjectSdk,
): Promise<ProjectCatalog> {
  return (await loadProjectInventory(sdk)).catalog;
}

export async function loadProjectInventory(
  sdk: ReleasedProjectSdk,
  featureFlags: StudioFeatureFlags = STUDIO_FEATURE_FLAGS,
): Promise<ProjectInventory> {
  try {
    const [{ primaryHostId, dataDir }, projects] = await Promise.all([
      sdk.system.config(),
      sdk.projects.list({ include: "threads" }),
    ]);
    if (!primaryHostId) throw new Error();
    const hasUnscannableProjects = projects.some(
      (project) =>
        projectIdSchema.safeParse(project.id).success &&
        !isDisabledEnrolledHostProject(project, primaryHostId, featureFlags) &&
        sourceFor(project, primaryHostId) === null,
    );
    const eligible = projects
      .flatMap((project, nativeOrder) => {
        if (!projectIdSchema.safeParse(project.id).success) return [];
        const source = sourceFor(project, primaryHostId);
        if (!source) return [];
        const input = {
          id: project.id,
          label: project.name,
          activity: projectActivity(project.threads ?? []),
          scan: { state: "not_scanned", items: [] },
        };
        let option = projectOptionSchema.safeParse(input);
        if (!option.success) {
          option = projectOptionSchema.safeParse({
            ...input,
            label: `Project ${project.id}`,
          });
        }
        return option.success
          ? [
              {
                option: option.data,
                nativeOrder,
                source: Object.freeze({
                  projectId: project.id,
                  sourceId: source.id,
                  updatedAt: source.updatedAt,
                  hostId: source.hostId,
                  path: source.path,
                }),
              },
            ]
          : [];
      })
      .sort(
        (left, right) =>
          Number(right.option.activity.active) -
            Number(left.option.activity.active) ||
          compareRecent(
            left.option.activity.lastThreadUpdatedAt,
            right.option.activity.lastThreadUpdatedAt,
          ) ||
          left.nativeOrder - right.nativeOrder ||
          left.option.label.localeCompare(right.option.label) ||
          left.option.id.localeCompare(right.option.id),
      );
    const admitted = eligible.slice(0, TARGET_ADMISSION_MAX_PROJECTS);
    const truncated =
      hasUnscannableProjects || eligible.length > TARGET_ADMISSION_MAX_PROJECTS;
    const catalog = projectCatalogSchema.parse({
      state: truncated ? "partial" : "ready",
      truncated,
      items: admitted.map(({ option }) => option),
    });
    if (catalog.state === "unavailable") throw new Error();
    return Object.freeze({
      state: "ready",
      inventoryState: truncated ? "partial" : "complete",
      catalog,
      sources: Object.freeze(admitted.map(({ source }) => source)),
      primaryHostId,
      dataDir,
    });
  } catch {
    return Object.freeze({
      state: "unavailable",
      catalog: { state: "unavailable" as const, items: [] as [] },
      sources: [] as [],
    });
  }
}

function projectActivity(threads: readonly ProjectThreadLike[]) {
  let active = false;
  let lastThreadUpdatedAt: number | null = null;
  for (const thread of threads) {
    if (thread.visibility !== "visible" || thread.deletedAt !== null) continue;
    if (
      typeof thread.updatedAt === "number" &&
      Number.isSafeInteger(thread.updatedAt) &&
      thread.updatedAt >= 0
    ) {
      lastThreadUpdatedAt = Math.max(
        lastThreadUpdatedAt ?? thread.updatedAt,
        thread.updatedAt,
      );
    }
    const counts = thread.activity
      ? [
          thread.activity.activeWorkflowCount,
          thread.activity.activeBackgroundAgentCount,
          thread.activity.activeBackgroundCommandCount,
          thread.activity.activePlanModeCount,
          thread.activity.activeGoalCount,
        ]
      : [];
    active ||=
      thread.status === "starting" ||
      thread.status === "active" ||
      thread.status === "stopping" ||
      (typeof thread.runtime?.displayStatus === "string" &&
        !["idle", "error"].includes(thread.runtime.displayStatus)) ||
      thread.hasPendingInteraction === true ||
      counts.some(
        (count) =>
          typeof count === "number" && Number.isSafeInteger(count) && count > 0,
      );
  }
  return { active, lastThreadUpdatedAt };
}

function compareRecent(left: number | null, right: number | null): number {
  if (left === right) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return right - left;
}

export async function resolveProjectSource(
  sdk: ReleasedProjectSdk,
  inputProjectId: unknown,
): Promise<ResolvedProjectSource> {
  try {
    const projectId = projectIdSchema.parse(inputProjectId);
    const [{ primaryHostId }, project] = await Promise.all([
      sdk.system.config(),
      sdk.projects.get({ projectId }),
    ]);
    if (project.id !== projectId) throw new Error();
    const source = sourceFor(project, primaryHostId);
    if (!source) throw new Error();
    return Object.freeze({
      projectId,
      sourceId: source.id,
      updatedAt: source.updatedAt,
      hostId: source.hostId,
      path: source.path,
    });
  } catch {
    throw new Error("Project source unavailable.");
  }
}

export function sameProjectSource(
  left: ResolvedProjectSource,
  right: ResolvedProjectSource,
): boolean {
  return (
    left.projectId === right.projectId &&
    left.sourceId === right.sourceId &&
    left.updatedAt === right.updatedAt &&
    left.hostId === right.hostId &&
    left.path === right.path
  );
}

export async function deriveRuntimeDataRoot(dataDir: unknown): Promise<string> {
  if (
    typeof dataDir !== "string" ||
    !path.isAbsolute(dataDir) ||
    path.normalize(dataDir) !== dataDir ||
    dataDir.endsWith(path.sep) ||
    dataDir === path.parse(dataDir).root ||
    Buffer.byteLength(dataDir, "utf8") > 4_096 ||
    /[\u0000-\u001f\u007f]/u.test(dataDir)
  )
    throw new Error("Runtime data directory unavailable.");
  let canonicalDataDir: string;
  try {
    canonicalDataDir = await fs.realpath(dataDir);
    const stat = await fs.lstat(canonicalDataDir);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error();
  } catch {
    throw new Error("Runtime data directory unavailable.");
  }
  const runtimeRoot = path.join(
    canonicalDataDir,
    "plugins",
    "studio",
    "runtime",
  );
  const relative = path.relative(canonicalDataDir, runtimeRoot);
  if (
    Buffer.byteLength(runtimeRoot, "utf8") > 1_024 ||
    relative === "" ||
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  )
    throw new Error("Runtime data directory unavailable.");
  for (const segment of ["plugins", "studio", "runtime"] as const) {
    const candidate =
      segment === "plugins"
        ? path.join(canonicalDataDir, segment)
        : segment === "studio"
          ? path.join(canonicalDataDir, "plugins", segment)
          : runtimeRoot;
    const stat = await fs.lstat(candidate).catch((error: unknown) => {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "ENOENT"
      )
        return null;
      throw error;
    });
    if (!stat) break;
    if (!stat.isDirectory() || stat.isSymbolicLink())
      throw new Error("Runtime data directory unavailable.");
    const physical = await fs.realpath(candidate);
    const physicalRelative = path.relative(canonicalDataDir, physical);
    if (
      physicalRelative === ".." ||
      physicalRelative.startsWith(`..${path.sep}`) ||
      path.isAbsolute(physicalRelative)
    )
      throw new Error("Runtime data directory unavailable.");
  }
  return runtimeRoot;
}
