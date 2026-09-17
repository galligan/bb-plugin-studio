import {
  definePluginApp,
  experimental_useSidebarThreadActions,
  experimental_useSidebarThreads,
  useBbNavigate,
  useRpc,
  type PluginNavPanelProps,
} from "@get-bb/plugin-sdk/app";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { rpcContract } from "../../server";
import "./workbench-panel.css";
import { PluginWorkbenchBoundary } from "./workbench-boundary";
import {
  PluginWorkbenchMissingTarget,
  PluginWorkbenchTargetDetail,
  PluginWorkbenchView,
  type WorkbenchProjectThreads,
} from "./workbench-panel";
import {
  parsePluginWorkbenchSnapshot,
  type PluginWorkbenchSnapshot,
} from "./workbench-snapshot";

const listChangedMessage = "The plugin list changed.";
const loadFailedMessage = "Plugin Studio reload failed safely. Try again.";
const targetRoute = /^projects\/([^/]+)\/targets\/([^/]+)$/u;

function parseTargetRoute(subPath: string) {
  const match = targetRoute.exec(subPath);
  if (!match) return null;
  try {
    return {
      projectId: decodeURIComponent(match[1] ?? ""),
      targetId: decodeURIComponent(match[2] ?? ""),
    };
  } catch {
    return null;
  }
}

function catalogFingerprint(snapshot: PluginWorkbenchSnapshot) {
  if (
    snapshot.projects.state === "unavailable" ||
    snapshot.projects.items.some(
      ({ scan }) =>
        scan.state === "not_scanned" || scan.state === "unavailable",
    )
  ) {
    return null;
  }
  return JSON.stringify(
    snapshot.projects.items
      .map((project) => [
        project.id,
        ...project.scan.items.map((target) => target.id).sort(),
      ])
      .sort(([left], [right]) => String(left).localeCompare(String(right))),
  );
}

function missingTargetReason(
  snapshot: PluginWorkbenchSnapshot,
  project: PluginWorkbenchSnapshot["projects"]["items"][number] | undefined,
) {
  if (snapshot.projects.state === "unavailable") return "catalog_unavailable";
  if (project === undefined) {
    return snapshot.projects.truncated ? "scan_incomplete" : "removed";
  }
  if (project.scan.state === "ready") return "removed";
  if (project.scan.state === "partial") return "scan_incomplete";
  if (project.scan.state === "not_scanned") return "not_scanned";
  if (project.scan.state === "unavailable") return project.scan.reason;
  return "scan_incomplete";
}

export function PluginWorkbenchPanel({ subPath }: PluginNavPanelProps) {
  const rpc = useRpc<typeof rpcContract>();
  const navigate = useBbNavigate();
  const sidebar = experimental_useSidebarThreads();
  const threadActions = experimental_useSidebarThreadActions();
  const generation = useRef(0);
  const recoveredSubPath = useRef<string | null>(null);
  const refreshSubPath = useRef<string | null>(null);
  const [snapshot, setSnapshot] = useState<PluginWorkbenchSnapshot | null>(
    null,
  );
  const [statusFailed, setStatusFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [catalogMessage, setCatalogMessage] = useState<string | null>(null);

  const acceptSnapshot = useCallback(
    (value: unknown, previous: PluginWorkbenchSnapshot | null) => {
      const next = parsePluginWorkbenchSnapshot(value);
      const previousFingerprint =
        previous === null ? null : catalogFingerprint(previous);
      const nextFingerprint = catalogFingerprint(next);
      setSnapshot(next);
      setCatalogMessage(
        previousFingerprint !== null &&
          nextFingerprint !== null &&
          previousFingerprint !== nextFingerprint
          ? listChangedMessage
          : null,
      );
      return next;
    },
    [],
  );

  const initialLoad = useCallback(() => {
    const request = ++generation.current;
    setStatusFailed(false);
    setRefreshing(false);
    setCatalogMessage(null);
    void rpc.call("status", {}).then(
      (statusValue) => {
        if (request !== generation.current) return;
        let statusSnapshot: PluginWorkbenchSnapshot;
        try {
          statusSnapshot = parsePluginWorkbenchSnapshot(statusValue);
          setSnapshot(statusSnapshot);
        } catch {
          setStatusFailed(true);
          return;
        }
        setRefreshing(true);
        void rpc.call("refresh", {}).then(
          (refreshValue) => {
            if (request !== generation.current) return;
            try {
              acceptSnapshot(refreshValue, null);
            } catch {
              setCatalogMessage(loadFailedMessage);
            } finally {
              if (request === generation.current) setRefreshing(false);
            }
          },
          () => {
            if (request !== generation.current) return;
            setRefreshing(false);
            setCatalogMessage(loadFailedMessage);
          },
        );
      },
      () => {
        if (request !== generation.current) return;
        setStatusFailed(true);
      },
    );
  }, [acceptSnapshot, rpc]);

  const refresh = useCallback(() => {
    const request = ++generation.current;
    const previous = snapshot;
    refreshSubPath.current = subPath;
    setStatusFailed(false);
    setRefreshing(true);
    setCatalogMessage(null);
    void rpc.call("refresh", {}).then(
      (value) => {
        if (request !== generation.current) return;
        try {
          acceptSnapshot(value, previous);
        } catch {
          setCatalogMessage(loadFailedMessage);
        } finally {
          if (request === generation.current) {
            refreshSubPath.current = null;
            setRefreshing(false);
          }
        }
      },
      () => {
        if (request !== generation.current) return;
        refreshSubPath.current = null;
        setRefreshing(false);
        setCatalogMessage(loadFailedMessage);
      },
    );
  }, [acceptSnapshot, rpc, snapshot, subPath]);

  useEffect(() => {
    initialLoad();
    return () => {
      generation.current += 1;
    };
    // Initial status and the one bounded refresh run only on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const route = useMemo(() => parseTargetRoute(subPath), [subPath]);
  useEffect(() => {
    if (
      refreshSubPath.current !== null &&
      refreshSubPath.current !== "" &&
      refreshSubPath.current !== subPath
    ) {
      generation.current += 1;
      refreshSubPath.current = null;
      setRefreshing(false);
    }
    if (subPath === "" || route !== null) {
      recoveredSubPath.current = null;
      return;
    }
    if (recoveredSubPath.current === subPath) return;
    recoveredSubPath.current = subPath;
    navigate.toPluginPanel("workbench", { replace: true });
  }, [navigate, route, subPath]);
  const project =
    route !== null && snapshot?.projects.state !== "unavailable"
      ? snapshot?.projects.items.find(({ id }) => id === route.projectId)
      : undefined;
  const target =
    route !== null &&
    project !== undefined &&
    (project.scan.state === "ready" || project.scan.state === "partial")
      ? project.scan.items.find(({ id }) => id === route.targetId)
      : undefined;

  const threads = useMemo<WorkbenchProjectThreads>(() => {
    if (route === null || sidebar.status === "loading") {
      return { state: "loading", items: [] };
    }
    if (sidebar.status === "error") {
      return { state: "unavailable", items: [] };
    }
    return {
      state: "ready",
      items: sidebar.threads
        .filter(
          (thread) =>
            thread.projectId === route.projectId && thread.isArchived === false,
        )
        .sort((left, right) => right.updatedAt - left.updatedAt)
        .map((thread) => ({
          id: thread.id,
          title: thread.title ?? thread.titleFallback ?? "Untitled task",
          updatedAt: thread.updatedAt,
        })),
    };
  }, [route, sidebar]);

  if (statusFailed) {
    return <PluginWorkbenchBoundary state="failed" onRetry={initialLoad} />;
  }
  if (snapshot === null) {
    return <PluginWorkbenchBoundary state="pending" onRetry={initialLoad} />;
  }
  if (route !== null && target && project) {
    return (
      <PluginWorkbenchTargetDetail
        snapshot={snapshot}
        projectLabel={project.label}
        target={target}
        threads={threads}
        refreshing={refreshing}
        catalogMessage={catalogMessage}
        onBack={() => navigate.toPluginPanel("workbench")}
        onOpenThread={(threadId) => threadActions.open(threadId)}
        onNewThread={() =>
          threadActions.openNewThread({
            projectId: project.id,
            focusPrompt: true,
          })
        }
        onRefresh={refresh}
      />
    );
  }
  if (route !== null) {
    if (refreshing) {
      return <PluginWorkbenchBoundary state="pending" onRetry={initialLoad} />;
    }
    return (
      <PluginWorkbenchMissingTarget
        snapshot={snapshot}
        refreshing={refreshing}
        catalogMessage={catalogMessage}
        reason={missingTargetReason(snapshot, project)}
        onBack={() => navigate.toPluginPanel("workbench")}
        onRefresh={refresh}
      />
    );
  }
  return (
    <PluginWorkbenchView
      snapshot={snapshot}
      refreshing={refreshing}
      catalogMessage={catalogMessage}
      onOpenTarget={(projectId, targetId) =>
        navigate.toPluginPanel("workbench", {
          subPath: `projects/${encodeURIComponent(projectId)}/targets/${encodeURIComponent(targetId)}`,
        })
      }
      onRefresh={refresh}
    />
  );
}

export default definePluginApp((app) => {
  app.slots.navPanel({
    id: "plugin-studio",
    title: "Plugin Studio",
    icon: "Toolbox",
    path: "workbench",
    component: PluginWorkbenchPanel,
  });
});
