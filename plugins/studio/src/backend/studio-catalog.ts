import {
  adaptPreparedSqliteDatabase,
  BbContextIdSchema,
  createDevelopmentTargetCatalog,
  DEVELOPMENT_TARGET_CATALOG_MIGRATION_STATEMENTS,
  PrincipalIdSchema,
  RuntimeError,
  verifyDevelopmentTargetCatalogSchema,
  type DevelopmentTargetCatalog,
  type ObjectId,
} from "@bb-plugin-studio/runtime/catalog";
import type { PluginStorage } from "@get-bb/plugin-sdk";

export const STUDIO_CATALOG_PRINCIPAL_ID = PrincipalIdSchema.parse(
  "studio_catalog_principal".padEnd(32, "_"),
);
export const STUDIO_CATALOG_CONTEXT_ID = BbContextIdSchema.parse(
  "studio_catalog_context".padEnd(32, "_"),
);

export interface OpenStudioCatalogOptions {
  readonly clock?: () => number;
  readonly id?: () => ObjectId;
}

/**
 * Open the catalog on bb-owned storage without changing its connection mode or
 * taking ownership of the host-tracked handle.
 */
export function openStudioCatalog(
  storage: Pick<PluginStorage, "database" | "migrate">,
  options: OpenStudioCatalogOptions = {},
): DevelopmentTargetCatalog {
  const database = storage.database();
  database.pragma("foreign_keys = ON");
  if (database.pragma("foreign_keys", { simple: true }) !== 1) {
    throw new RuntimeError("corrupt_data");
  }
  storage.migrate(database, [
    ...DEVELOPMENT_TARGET_CATALOG_MIGRATION_STATEMENTS,
  ]);

  const catalogDatabase = adaptPreparedSqliteDatabase(database);
  verifyDevelopmentTargetCatalogSchema(catalogDatabase);

  return createDevelopmentTargetCatalog({
    database: catalogDatabase,
    clock: options.clock,
    id: options.id,
  });
}
