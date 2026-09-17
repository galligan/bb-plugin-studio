import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import type {
  PluginWorkbenchSnapshot,
  ProjectOption,
} from "./workbench-snapshot";

GlobalRegistrator.register();
(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const targetA = "abcdefghijklmnopqrstuvwxzy012345";
const targetB = "0123456789abcdefghijklmnopqrstuv";

function project(
  id: string,
  label: string,
  scan: ProjectOption["scan"] = { state: "not_scanned", items: [] },
): ProjectOption {
  return {
    id,
    label,
    activity: { active: false, lastThreadUpdatedAt: null },
    scan,
  };
}

function snapshot(
  projects: ProjectOption[] = [
    project("project_01", "bb Plugin Studio"),
    project("project_02", "Remote"),
  ],
  state: "ready" | "partial" = projects.some(
    ({ scan }) => scan.state === "partial" || scan.state === "unavailable",
  )
    ? "partial"
    : "ready",
): PluginWorkbenchSnapshot {
  return {
    schemaVersion: 4,
    browserLaunch: "unavailable",
    projects: { state, truncated: false, items: projects },
  };
}

const mateTarget = {
  id: targetA,
  label: "Studio",
  pluginId: "studio",
  revision: 1,
} as const;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

let rpcImplementation: (
  method: string,
  input: unknown,
) => Promise<unknown> = () => Promise.resolve(snapshot());
const rpcCall = mock((method: string, input: unknown) =>
  rpcImplementation(method, input),
);
const navigateToPluginPanel = mock(() => {});
const openThread = mock(() => {});
const openNewThread = mock(() => {});
let sidebarState: {
  status: "loading" | "ready" | "error";
  threads: Array<Record<string, unknown>>;
  projects: Array<Record<string, unknown>>;
} = { status: "ready", threads: [], projects: [] };

mock.module("@get-bb/plugin-sdk/app", () => ({
  definePluginApp: (setup: unknown) => ({ __bbPluginApp: true, setup }),
  useRpc: () => ({ call: rpcCall }),
  useBbNavigate: () => ({
    toPluginPanel: navigateToPluginPanel,
    toThread: () => {},
    toProject: () => {},
    toCompose: () => {},
    openThreadPanel: () => false,
  }),
  experimental_useSidebarThreads: () => sidebarState,
  experimental_useSidebarThreadActions: () => ({
    open: openThread,
    openNewThread,
    setPinned: async () => {},
    setRead: async () => {},
    rename: async () => {},
    archive: () => {},
    requestDelete: () => {},
  }),
}));

let root: Root | undefined;

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function renderPanel(subPath = "") {
  const { PluginWorkbenchPanel } = await import("./plugin-app");
  const container = document.querySelector("#root");
  if (!(container instanceof HTMLElement)) throw new Error("Missing root.");
  root = createRoot(container);
  await act(async () =>
    root?.render(<PluginWorkbenchPanel subPath={subPath} />),
  );
  await flush();
}

function button(label: string) {
  return Array.from(document.querySelectorAll("button")).find(
    (candidate) => candidate.textContent === label,
  );
}

beforeEach(() => {
  rpcCall.mockClear();
  navigateToPluginPanel.mockClear();
  openThread.mockClear();
  openNewThread.mockClear();
  rpcImplementation = () => Promise.resolve(snapshot());
  sidebarState = { status: "ready", threads: [], projects: [] };
  document.body.innerHTML = '<div id="root"></div>';
});

afterEach(async () => {
  if (root) await act(() => root?.unmount());
  root = undefined;
  document.body.replaceChildren();
});

describe("Plugin Studio app registration", () => {
  test("registers one native nav panel with a supported Toolbox icon", async () => {
    const definition = (await import("./plugin-app")).default;
    const registrations: unknown[] = [];
    definition.setup({
      slots: {
        navPanel: (registration: unknown) => registrations.push(registration),
      },
    } as never);
    expect(registrations).toHaveLength(1);
    expect(registrations[0]).toMatchObject({
      id: "plugin-studio",
      title: "Plugin Studio",
      icon: "Toolbox",
      path: "workbench",
      component: expect.any(Function),
    });
  });

  test("reads status then performs one automatic batch refresh", async () => {
    const refreshed = snapshot([
      project("project_01", "bb Plugin Studio", {
        state: "ready",
        items: [mateTarget],
      }),
      project("project_02", "Remote", { state: "ready", items: [] }),
    ]);
    rpcImplementation = (method) =>
      Promise.resolve(method === "status" ? snapshot() : refreshed);
    await renderPanel();

    expect(rpcCall).toHaveBeenNthCalledWith(1, "status", {});
    expect(rpcCall).toHaveBeenNthCalledWith(2, "refresh", {});
    expect(rpcCall).toHaveBeenCalledTimes(2);
    expect(document.body.textContent).toContain("bb Plugin Studio");
    expect(document.body.textContent).toContain("Remote");
    expect(document.body.textContent).toContain("Studio");
    expect(document.body.textContent).toContain("No development plugins found");
    expect(button("Open")).toBeUndefined();
  });

  test("opens a plugin through panel-internal history without a project action", async () => {
    const refreshed = snapshot([
      project("project_01", "bb Plugin Studio", {
        state: "ready",
        items: [mateTarget],
      }),
    ]);
    rpcImplementation = (method) =>
      Promise.resolve(method === "status" ? snapshot() : refreshed);
    await renderPanel();
    await act(async () => {
      const target = document.querySelector(
        '[aria-label="Open Studio in bb Plugin Studio"]',
      );
      if (!(target instanceof HTMLButtonElement))
        throw new Error("Missing target.");
      target.click();
    });
    expect(navigateToPluginPanel).toHaveBeenCalledWith("workbench", {
      subPath: `projects/project_01/targets/${targetA}`,
    });
    expect(rpcCall.mock.calls.some(([method]) => method === "admit")).toBe(
      false,
    );
  });

  test("preserves a pending root catalog reload when opening a plugin", async () => {
    const ready = snapshot([
      project("project_01", "bb Plugin Studio", {
        state: "ready",
        items: [mateTarget],
      }),
    ]);
    const pending = deferred<unknown>();
    let calls = 0;
    rpcImplementation = () => {
      calls += 1;
      if (calls <= 2) return Promise.resolve(calls === 1 ? snapshot() : ready);
      return pending.promise;
    };
    await renderPanel();
    await act(async () => {
      document
        .querySelector('[aria-label="Reload Plugin Studio data"]')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const { PluginWorkbenchPanel } = await import("./plugin-app");
    await act(async () =>
      root?.render(
        <PluginWorkbenchPanel
          subPath={`projects/project_01/targets/${targetA}`}
        />,
      ),
    );
    const updated = {
      ...mateTarget,
      label: "Studio updated",
    };
    pending.resolve(
      snapshot([
        project("project_01", "bb Plugin Studio", {
          state: "ready",
          items: [updated],
        }),
      ]),
    );
    await flush();

    expect(document.body.textContent).toContain("Studio updated");
    expect(
      document.querySelector('[aria-label="Reloading Plugin Studio data"]'),
    ).toBeNull();
  });

  test("replaces a malformed nonempty route with the Workbench root once", async () => {
    await renderPanel("not-a-plugin-detail");

    expect(navigateToPluginPanel).toHaveBeenCalledTimes(1);
    expect(navigateToPluginPanel).toHaveBeenCalledWith("workbench", {
      replace: true,
    });

    const { PluginWorkbenchPanel } = await import("./plugin-app");
    await act(async () => {
      root?.render(<PluginWorkbenchPanel subPath="not-a-plugin-detail" />);
    });
    expect(navigateToPluginPanel).toHaveBeenCalledTimes(1);
  });

  test("replaces an undecodable target route instead of treating it as missing", async () => {
    await renderPanel(`projects/%E0%A4%A/targets/${targetA}`);

    expect(navigateToPluginPanel).toHaveBeenCalledTimes(1);
    expect(navigateToPluginPanel).toHaveBeenCalledWith("workbench", {
      replace: true,
    });
    expect(document.body.textContent).not.toContain(
      "Plugin no longer available",
    );
  });

  test("shows project tasks on detail and uses host task actions", async () => {
    const targetSnapshot = snapshot([
      project("project_01", "bb Plugin Studio", {
        state: "ready",
        items: [mateTarget],
      }),
    ]);
    rpcImplementation = () => Promise.resolve(targetSnapshot);
    sidebarState = {
      status: "ready",
      projects: [],
      threads: [
        {
          id: "thread_active",
          projectId: "project_01",
          title: "Native design pass",
          titleFallback: null,
          isArchived: false,
          updatedAt: 3,
        },
        {
          id: "thread_archived",
          projectId: "project_01",
          title: "Archived work",
          titleFallback: null,
          isArchived: true,
          updatedAt: 4,
        },
      ],
    };
    await renderPanel(`projects/project_01/targets/${targetA}`);

    expect(document.body.textContent).toContain("Native design pass");
    expect(document.body.textContent).not.toContain("Archived work");
    await act(async () => button("Native design pass")?.click());
    expect(openThread).toHaveBeenCalledWith("thread_active");
    await act(async () => button("New task")?.click());
    expect(openNewThread).toHaveBeenCalledWith({
      projectId: "project_01",
      focusPrompt: true,
    });
    await act(async () => button("Back to projects")?.click());
    expect(navigateToPluginPanel).toHaveBeenCalledWith("workbench");
  });

  test("keeps every unarchived project task reachable from detail", async () => {
    const targetSnapshot = snapshot([
      project("project_01", "bb Plugin Studio", {
        state: "ready",
        items: [mateTarget],
      }),
    ]);
    rpcImplementation = () => Promise.resolve(targetSnapshot);
    sidebarState = {
      status: "ready",
      projects: [],
      threads: Array.from({ length: 9 }, (_, index) => ({
        id: `thread_${index}`,
        projectId: "project_01",
        title: `Project task ${index + 1}`,
        titleFallback: null,
        isArchived: false,
        updatedAt: index,
      })),
    };

    await renderPanel(`projects/project_01/targets/${targetA}`);

    expect(document.body.textContent).toContain("Project task 1");
    expect(document.body.textContent).toContain("Project task 9");
  });

  test("distinguishes task loading, unavailable, and ready-empty states", async () => {
    const targetSnapshot = snapshot([
      project("project_01", "bb Plugin Studio", {
        state: "ready",
        items: [mateTarget],
      }),
    ]);
    rpcImplementation = () => Promise.resolve(targetSnapshot);
    sidebarState = { status: "loading", projects: [], threads: [] };
    await renderPanel(`projects/project_01/targets/${targetA}`);
    expect(document.body.textContent).toContain("Loading project tasks");
    expect(
      document.querySelector('[aria-live="polite"][aria-busy="true"]'),
    ).toBeInstanceOf(HTMLElement);
    const { PluginWorkbenchPanel } = await import("./plugin-app");
    await act(async () => {
      sidebarState = { status: "error", projects: [], threads: [] };
      root?.render(
        <PluginWorkbenchPanel
          subPath={`projects/project_01/targets/${targetA}`}
        />,
      );
    });
    expect(document.body.textContent).toContain("Project tasks unavailable");
    expect(
      document.querySelector('[aria-live="polite"][aria-busy="false"]'),
    ).toBeInstanceOf(HTMLElement);
  });

  test("keeps reload failure visible at the root and retains old data", async () => {
    const ready = snapshot([
      project("project_01", "bb Plugin Studio", {
        state: "ready",
        items: [mateTarget],
      }),
    ]);
    let calls = 0;
    rpcImplementation = () => {
      calls += 1;
      if (calls <= 2) return Promise.resolve(calls === 1 ? snapshot() : ready);
      return Promise.reject(new Error("offline"));
    };
    await renderPanel();
    await act(async () => {
      document
        .querySelector('[aria-label="Reload Plugin Studio data"]')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();
    expect(document.body.textContent).toContain("Studio");
    expect(document.body.textContent).toContain(
      "Plugin Studio reload failed safely. Try again.",
    );
  });

  test("reports catalog changes per batch without cross-project selection state", async () => {
    const first = snapshot([
      project("project_01", "bb Plugin Studio", {
        state: "ready",
        items: [mateTarget],
      }),
      project("project_02", "Remote", { state: "ready", items: [] }),
    ]);
    const second = snapshot([
      project("project_01", "bb Plugin Studio", {
        state: "ready",
        items: [
          { id: targetB, label: "Linear", pluginId: "linear", revision: 2 },
        ],
      }),
      project("project_02", "Remote", { state: "ready", items: [] }),
    ]);
    let calls = 0;
    rpcImplementation = () =>
      Promise.resolve(
        calls++ === 0 ? snapshot() : calls === 2 ? first : second,
      );
    await renderPanel();
    await act(async () => {
      document
        .querySelector('[aria-label="Reload Plugin Studio data"]')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();
    expect(document.body.textContent).toContain("The plugin list changed.");
    expect(document.body.textContent).toContain("Linear");
    expect(document.body.textContent).not.toContain("studio · revision 1");
  });

  test("does not report a plugin change for activity, scan-state, or revision changes", async () => {
    const first = snapshot([
      {
        ...project("project_01", "bb Plugin Studio", {
          state: "ready",
          items: [mateTarget],
        }),
        activity: { active: true, lastThreadUpdatedAt: 20 },
      },
      project("project_02", "Remote", { state: "ready", items: [] }),
    ]);
    const reordered = snapshot([
      {
        ...project("project_02", "Remote", { state: "ready", items: [] }),
        activity: { active: true, lastThreadUpdatedAt: 30 },
      },
      {
        ...project("project_01", "bb Plugin Studio", {
          state: "ready",
          items: [mateTarget],
        }),
        activity: { active: false, lastThreadUpdatedAt: 20 },
      },
    ]);
    const stateChanged = snapshot(
      [
        project("project_01", "bb Plugin Studio", {
          state: "partial",
          items: [mateTarget],
        }),
        project("project_02", "Remote", { state: "ready", items: [] }),
      ],
      "partial",
    );
    const revisionChanged = snapshot([
      project("project_01", "bb Plugin Studio", {
        state: "ready",
        items: [{ ...mateTarget, revision: mateTarget.revision + 1 }],
      }),
      project("project_02", "Remote", { state: "ready", items: [] }),
    ]);
    let calls = 0;
    rpcImplementation = () => {
      calls += 1;
      return Promise.resolve(
        calls === 1
          ? snapshot()
          : calls === 2
            ? first
            : calls === 3
              ? reordered
              : calls === 4
                ? stateChanged
                : revisionChanged,
      );
    };
    await renderPanel();
    const reload = () =>
      document
        .querySelector('[aria-label="Reload Plugin Studio data"]')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await act(async () => reload());
    await flush();
    expect(document.body.textContent).not.toContain("The plugin list changed.");
    await act(async () => reload());
    await flush();
    expect(document.body.textContent).not.toContain("The plugin list changed.");
    await act(async () => reload());
    await flush();
    expect(document.body.textContent).not.toContain("The plugin list changed.");
  });

  test("ignores superseded explicit refreshes while retaining the catalog", async () => {
    const ready = snapshot([
      project("project_01", "bb Plugin Studio", {
        state: "ready",
        items: [mateTarget],
      }),
    ]);
    const older = deferred<unknown>();
    const newer = deferred<unknown>();
    let calls = 0;
    rpcImplementation = () => {
      calls += 1;
      if (calls === 1) return Promise.resolve(snapshot());
      if (calls === 2) return Promise.resolve(ready);
      return calls === 3 ? older.promise : newer.promise;
    };
    await renderPanel();
    const reload = document.querySelector(
      '[aria-label="Reload Plugin Studio data"]',
    );
    await act(async () => {
      reload?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      reload?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(document.body.textContent).toContain("Studio");

    newer.resolve(ready);
    await flush();
    older.resolve(snapshot([]));
    await flush();
    expect(document.body.textContent).toContain("Studio");
    expect(document.body.textContent).not.toContain("No local projects found");
  });

  test("shows finite stale-route recovery after automatic refresh", async () => {
    rpcImplementation = () => Promise.resolve(snapshot([]));
    await renderPanel(`projects/project_01/targets/${targetA}`);
    expect(document.body.textContent).toContain("Plugin no longer available");
    expect(button("Back to projects")).toBeInstanceOf(HTMLButtonElement);
    expect(button("Reload Plugin Studio data")).toBeInstanceOf(
      HTMLButtonElement,
    );
    expect(navigateToPluginPanel).not.toHaveBeenCalled();
  });

  test("does not claim removal when a deep-linked project scan is partial", async () => {
    const partial = snapshot(
      [
        project("project_01", "bb Plugin Studio", {
          state: "partial",
          items: [],
        }),
      ],
      "partial",
    );
    rpcImplementation = () => Promise.resolve(partial);
    await renderPanel(`projects/project_01/targets/${targetA}`);
    expect(document.body.textContent).toContain("Plugin unavailable");
    expect(document.body.textContent).toContain("project scan was incomplete");
    expect(document.body.textContent).not.toContain("no longer available");
  });

  test("claims authoritative removal for an absent project despite unrelated partial scans", async () => {
    const partial = snapshot(
      [
        project("visible_project", "Visible", {
          state: "partial",
          items: [],
        }),
      ],
      "partial",
    );
    rpcImplementation = () => Promise.resolve(partial);
    await renderPanel(`projects/project_01/targets/${targetA}`);
    expect(document.body.textContent).toContain("Plugin no longer available");
    expect(document.body.textContent).not.toContain("could not verify");
  });

  test("does not claim removal when a deep-linked project is omitted from a truncated catalog", async () => {
    const truncated = {
      ...snapshot(
        [
          project("visible_project", "Visible", {
            state: "partial",
            items: [],
          }),
        ],
        "partial",
      ),
      projects: {
        state: "partial" as const,
        truncated: true,
        items: [
          project("visible_project", "Visible", {
            state: "partial",
            items: [],
          }),
        ],
      },
    };
    rpcImplementation = () => Promise.resolve(truncated);
    await renderPanel(`projects/project_01/targets/${targetA}`);
    expect(document.body.textContent).toContain("Plugin unavailable");
    expect(document.body.textContent).toContain("could not verify");
    expect(document.body.textContent).not.toContain("no longer available");
  });

  test("does not claim removal when a deep-linked project scan is unavailable", async () => {
    const unavailable = snapshot(
      [
        project("project_01", "bb Plugin Studio", {
          state: "unavailable",
          reason: "source_changed",
          items: [],
        }),
      ],
      "partial",
    );
    rpcImplementation = () => Promise.resolve(unavailable);
    await renderPanel(`projects/project_01/targets/${targetA}`);
    expect(document.body.textContent).toContain("Plugin unavailable");
    expect(document.body.textContent).toContain(
      "project changed during scanning",
    );
    expect(document.body.textContent).not.toContain("no longer available");
  });

  test("does not claim removal when the project catalog is unavailable", async () => {
    const unavailable: PluginWorkbenchSnapshot = {
      ...snapshot(),
      projects: { state: "unavailable", items: [] },
    };
    rpcImplementation = () => Promise.resolve(unavailable);
    await renderPanel(`projects/project_01/targets/${targetA}`);
    expect(document.body.textContent).toContain("Plugin unavailable");
    expect(document.body.textContent).toContain("Project data is unavailable");
    expect(document.body.textContent).not.toContain("no longer available");
  });

  test("shows detail refresh as busy while retaining the target", async () => {
    const ready = snapshot([
      project("project_01", "bb Plugin Studio", {
        state: "ready",
        items: [mateTarget],
      }),
    ]);
    const pending = deferred<unknown>();
    let calls = 0;
    rpcImplementation = () => {
      calls += 1;
      if (calls <= 2) return Promise.resolve(calls === 1 ? snapshot() : ready);
      return pending.promise;
    };
    await renderPanel(`projects/project_01/targets/${targetA}`);
    await act(async () => {
      document
        .querySelector('[aria-label="Reload Plugin Studio data"]')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(
      document.querySelector('[aria-label="Reloading Plugin Studio data"]'),
    ).toBeInstanceOf(HTMLButtonElement);
    expect(document.body.textContent).toContain("Studio");
    pending.resolve(ready);
    await flush();
  });

  test("supersedes a pending detail refresh after returning to projects", async () => {
    const ready = snapshot([
      project("project_01", "bb Plugin Studio", {
        state: "ready",
        items: [mateTarget],
      }),
    ]);
    const pending = deferred<unknown>();
    let calls = 0;
    rpcImplementation = () => {
      calls += 1;
      if (calls <= 2) return Promise.resolve(calls === 1 ? snapshot() : ready);
      return pending.promise;
    };
    await renderPanel(`projects/project_01/targets/${targetA}`);
    await act(async () => {
      document
        .querySelector('[aria-label="Reload Plugin Studio data"]')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await act(async () => button("Back to projects")?.click());
    const { PluginWorkbenchPanel } = await import("./plugin-app");
    await act(async () => root?.render(<PluginWorkbenchPanel subPath="" />));
    await flush();

    expect(
      document.querySelector('[aria-label="Reloading Plugin Studio data"]'),
    ).toBeNull();

    pending.resolve(
      snapshot([
        project("project_late", "Late project", {
          state: "ready",
          items: [],
        }),
      ]),
    );
    await flush();

    expect(document.body.textContent).not.toContain("Late project");
    expect(rpcCall).toHaveBeenCalledTimes(3);
  });

  test("does not show a late detail reload failure after returning to projects", async () => {
    const ready = snapshot([
      project("project_01", "bb Plugin Studio", {
        state: "ready",
        items: [mateTarget],
      }),
    ]);
    const pending = deferred<unknown>();
    let calls = 0;
    rpcImplementation = () => {
      calls += 1;
      if (calls <= 2) return Promise.resolve(calls === 1 ? snapshot() : ready);
      return pending.promise;
    };
    await renderPanel(`projects/project_01/targets/${targetA}`);
    await act(async () => {
      document
        .querySelector('[aria-label="Reload Plugin Studio data"]')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    const { PluginWorkbenchPanel } = await import("./plugin-app");
    await act(async () => root?.render(<PluginWorkbenchPanel subPath="" />));

    pending.reject(new Error("offline"));
    await flush();

    expect(document.body.textContent).toContain("Studio");
    expect(document.body.textContent).not.toContain(
      "Plugin Studio reload failed safely",
    );
  });

  test("keeps an explicit detail reload failure visible", async () => {
    const ready = snapshot([
      project("project_01", "bb Plugin Studio", {
        state: "ready",
        items: [mateTarget],
      }),
    ]);
    let calls = 0;
    rpcImplementation = () => {
      calls += 1;
      if (calls <= 2) return Promise.resolve(calls === 1 ? snapshot() : ready);
      return Promise.reject(new Error("offline"));
    };
    await renderPanel(`projects/project_01/targets/${targetA}`);
    await act(async () => {
      document
        .querySelector('[aria-label="Reload Plugin Studio data"]')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();
    expect(document.body.textContent).toContain("Studio");
    expect(document.body.textContent).toContain(
      "Plugin Studio reload failed safely. Try again.",
    );
  });
});
