import assert from "node:assert/strict";
import { mkdtemp, mkdir, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  createInspectionDevelopmentTargetCandidateBridge,
  inspectDevelopmentSourceIdentity,
  ObjectIdSchema,
  OpaqueIdSchema,
  RuntimeError,
  type InspectionSourceCandidateFacts,
} from "@bb-plugin-studio/runtime/catalog";
import type { PluginStorage } from "@get-bb/plugin-sdk";
import Database from "better-sqlite3";

import {
  openStudioCatalog,
  STUDIO_CATALOG_CONTEXT_ID,
  STUDIO_CATALOG_PRINCIPAL_ID,
} from "./studio-catalog.ts";

function storageFor(database: Database.Database) {
  let appliedCount = 0;
  const storage: Pick<PluginStorage, "database" | "migrate"> = {
    database: () => database,
    migrate(db, statements) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS _bb_migrations (
          id INTEGER PRIMARY KEY,
          applied_at INTEGER NOT NULL
        ) STRICT
      `);
      const applied = db.prepare("SELECT 1 FROM _bb_migrations WHERE id = ?");
      const record = db.prepare(
        "INSERT INTO _bb_migrations (id, applied_at) VALUES (?, ?)",
      );
      db.transaction(() => {
        statements.forEach((statement, index) => {
          if (applied.get(index)) return;
          db.exec(statement);
          record.run(index, index + 1);
          appliedCount += 1;
        });
      })();
    },
  };
  return { appliedCount: () => appliedCount, storage };
}

function inspectionHarness() {
  const issued = new WeakMap<object, InspectionSourceCandidateFacts>();
  const active = new WeakMap<object, unknown>();
  const bridge = createInspectionDevelopmentTargetCandidateBridge({
    clock: () => 1_000,
    async consumeIssuedSourceCandidate(candidate, consumer) {
      if (typeof candidate !== "object" || candidate === null) {
        throw new RuntimeError("invalid_request");
      }
      const facts = issued.get(candidate);
      if (!facts) throw new RuntimeError("invalid_request");
      issued.delete(candidate);
      const identity = await inspectDevelopmentSourceIdentity(
        facts.canonicalRoot,
      );
      const transition = Object.freeze({ transition: true });
      active.set(transition, {
        ...facts,
        directoryIdentity: {
          canonicalRoot: identity.canonicalRoot,
          device: identity.device,
          inode: identity.inode,
        },
        manifestIdentity: identity.manifest,
      });
      try {
        return await consumer(transition);
      } finally {
        active.delete(transition);
      }
    },
    readSourceCandidateTransition(transition) {
      if (typeof transition !== "object" || transition === null) {
        throw new RuntimeError("invalid_request");
      }
      const facts = active.get(transition);
      if (!facts) throw new RuntimeError("invalid_request");
      return facts;
    },
  });
  return {
    issue(facts: InspectionSourceCandidateFacts) {
      const candidate = Object.freeze({ ...facts });
      issued.set(candidate, candidate);
      return bridge.issue(candidate);
    },
  };
}

const root = await mkdtemp(
  path.join(await realpath(os.tmpdir()), "studio-better-sqlite3-"),
);
try {
  const pluginRoot = path.join(root, "plugin");
  await mkdir(pluginRoot);
  await writeFile(
    path.join(pluginRoot, "package.json"),
    JSON.stringify({ name: "bb-plugin-notes", version: "1.2.3" }),
  );
  const facts = {
    rootKey: OpaqueIdSchema.parse("r".repeat(32)),
    rootKind: "current-project" as const,
    canonicalRoot: await realpath(pluginRoot),
    displayName: "Notes",
    displayPath: "plugins/notes",
    packageName: "bb-plugin-notes",
    version: "1.2.3",
    pluginId: "notes",
    hasServer: true,
    hasApp: true,
  };
  const databasePath = path.join(root, "data.db");
  const firstDatabase = new Database(databasePath);
  firstDatabase.pragma("journal_mode = WAL");
  firstDatabase.pragma("foreign_keys = OFF");
  const firstStorage = storageFor(firstDatabase);
  const firstCatalog = openStudioCatalog(firstStorage.storage, {
    id: () => ObjectIdSchema.parse("t".repeat(32)),
    clock: () => 1_000,
  });
  assert.equal(firstStorage.appliedCount(), 9);
  assert.equal(firstDatabase.pragma("journal_mode", { simple: true }), "wal");
  assert.equal(firstDatabase.pragma("foreign_keys", { simple: true }), 1);

  const first = await firstCatalog.refresh({
    principalId: STUDIO_CATALOG_PRINCIPAL_ID,
    bbContextId: STUDIO_CATALOG_CONTEXT_ID,
    candidate: await inspectionHarness().issue(facts),
  });
  const second = await firstCatalog.refresh({
    principalId: STUDIO_CATALOG_PRINCIPAL_ID,
    bbContextId: STUDIO_CATALOG_CONTEXT_ID,
    candidate: await inspectionHarness().issue(facts),
  });
  assert.equal(second.id, first.id);
  assert.equal(second.revision, 2);

  firstCatalog.close();
  assert.deepEqual(firstDatabase.prepare("SELECT 1 AS value").get(), {
    value: 1,
  });
  firstDatabase.close();
  assert.throws(() => firstDatabase.prepare("SELECT 1").get());

  const secondDatabase = new Database(databasePath);
  const secondStorage = storageFor(secondDatabase);
  const secondCatalog = openStudioCatalog(secondStorage.storage);
  assert.equal(secondStorage.appliedCount(), 0);
  assert.deepEqual(
    secondCatalog.list({
      principalId: STUDIO_CATALOG_PRINCIPAL_ID,
      bbContextId: STUDIO_CATALOG_CONTEXT_ID,
    }),
    [second],
  );
  assert.deepEqual(
    secondDatabase
      .prepare(
        "SELECT COUNT(*) AS count FROM runtime_events WHERE object_id = ?",
      )
      .get(first.id),
    { count: 2 },
  );
  secondCatalog.close();
  secondDatabase.close();
} finally {
  await rm(root, { force: true, recursive: true });
}
