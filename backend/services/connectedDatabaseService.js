"use strict";

/**
 * connectedDatabaseService.js  — Compatibility Wrapper
 *
 * Preserves the exact public API the controller uses:
 *   queryConnectedDatabase, previewConnectedDatabase, mutateConnectedDatabase,
 *   runRawConnectedDatabaseQuery, getDatabaseIntegration, getDatabaseDisplayName,
 *   requireDatabaseConfig, loadDatabaseSchema, getSchemaTableCounts,
 *   testDatabaseConnection
 *
 * Routes through DataModeOrchestrator when DATA_MODE_V2_ENABLED = true.
 */

const Integration = require("../models/Integration");
const { chatCompleteNoSystem } = require("./llmService");
const { getFlag } = require("./dataMode/featureFlags");
const { DataModeOrchestrator } = require("./dataMode/index");
const { createAdapter } = require("./dataMode/adapters/adapterFactory");
const {
  SchemaSnapshotService,
} = require("./dataMode/schema/schemaSnapshotService");

const orchestrator = new DataModeOrchestrator(chatCompleteNoSystem);
const snapshotService = new SchemaSnapshotService();

const SUPPORTED_DATABASE_VENDORS = ["mongodb", "postgres", "mysql", "sqlite"];
const EXACT_SCHEMA_COUNT_TABLE_LIMIT = 20;

// ─── Integration helpers ───────────────────────────────────────────────────────

async function getDatabaseIntegration(userId) {
  return Integration.findOne({ userId, type: "database", enabled: true });
}

function getDatabaseDisplayName(integration) {
  const vendor = integration?.database?.vendor || "database";
  const names = {
    mongodb: "MongoDB",
    postgres: "PostgreSQL",
    mysql: "MySQL",
    sqlite: "SQLite",
  };

  return integration?.name || names[vendor] || "Database";
}

function requireDatabaseConfig(database = {}) {
  const vendor = String(database.vendor || "")
    .trim()
    .toLowerCase();
  if (!SUPPORTED_DATABASE_VENDORS.includes(vendor)) {
    throw new Error(
      `Unsupported database vendor. Use MongoDB, PostgreSQL, MySQL, or SQLite.`
    );
  }
  if (vendor === "sqlite" && !database.filePath) {
    throw new Error("SQLite requires a file path.");
  }
  if (vendor !== "sqlite" && !database.connectionString) {
    throw new Error("Connection string is required for this database.");
  }
  // console.log(database);
  return {
    vendor,
    connectionString: database.connectionString || "",
    filePath: database.filePath || "",
    ssl: database.ssl === true,
    defaultSchema: database.defaultSchema || "public",
    readOnly: database.readOnly !== false,
  };
}

// ─── Schema ───────────────────────────────────────────────────────────────────

async function loadDatabaseSchema(config, options = {}) {
  const adapter = createAdapter(config);
  const cacheId = `${config.vendor}:${
    config.connectionString || config.filePath
  }`;
  const snapshot = await snapshotService.getSnapshot(cacheId, adapter, options);
  return _snapshotToLegacy(snapshot);
}

async function getSchemaTableCounts(config, schema) {
  const tables = Array.isArray(schema?.tables) ? schema.tables : [];
  const fallbackCounts = Object.fromEntries(
    tables.map((table) => [table.name, _normalizeCount(table?.estimatedRows)])
  );

  if (!tables.length) {
    return fallbackCounts;
  }

  const vendor = String(config?.vendor || "")
    .trim()
    .toLowerCase();

  try {
    if (vendor === "postgres") {
      return {
        ...fallbackCounts,
        ...(await loadPostgresTableCounts(config, tables)),
      };
    }

    if (vendor === "mysql" || vendor === "sqlite") {
      return {
        ...fallbackCounts,
        ...(await loadRelationalTableCounts(config, tables)),
      };
    }
  } catch {}

  return fallbackCounts;
}

// ─── Natural language query ────────────────────────────────────────────────────

async function queryConnectedDatabase(userId, question, options = {}) {
  const integration = await getDatabaseIntegration(userId);
  if (!integration)
    throw new Error("No database integration is connected yet.");

  const config = requireDatabaseConfig(integration.database || {});
  const result = await orchestrator.query(userId, question, config, {
    debugMode: options.debugMode || false,
    useLlmAnswer: true,
    now: options.now,
  });
  // Return in legacy shape expected by dbQueryController
  return {
    vendor: config.vendor,
    integrationName: getDatabaseDisplayName(integration),
    reply: result.reply,
    rows: result.rows || [],
    rowCount: result.rowCount || 0,
    executedQuery: result.executedQuery || "",
    queryPlan: {
      kind: result.queryMeta?.intent || "unknown",
      operation: result.queryMeta?.intent || "unknown",
      collection: result.queryMeta?.source || "",
      target: result.queryMeta?.source || "",
      explanation: result.queryMeta?.explanation || "",
      queryAnalysis: {
        target: result.queryMeta?.source,
        questionType: result.queryMeta?.intent,
        relativeRange: result.queryMeta?.timeRange
          ? {
              kind: result.queryMeta.timeRange.kind || "custom",
              startDateOnly: (result.queryMeta.timeRange.start_iso || "").slice(
                0,
                10
              ),
              startDateTime: result.queryMeta.timeRange.start_iso || "",
              endDateOnly: (result.queryMeta.timeRange.end_iso || "").slice(
                0,
                10
              ),
              endDateTime: result.queryMeta.timeRange.end_iso || "",
            }
          : null,
        temporalField: result.queryMeta?.temporalField
          ? { name: result.queryMeta.temporalField }
          : null,
        confidence: result.queryMeta?.confidence,
      },
    },
    schema: null,
  };
}

// ─── Preview ──────────────────────────────────────────────────────────────────

async function previewConnectedDatabase(userId, input = {}) {
  // console.log("Previewing connected database with input:", input);
  const integration = await getDatabaseIntegration(userId);
  if (!integration)
    throw new Error("No database integration is connected yet.");
  const config = requireDatabaseConfig(integration.database || {});
  // console.log(config);
  // console.log("Using database config for preview:", config);
  const result = await orchestrator.previewTable(userId, config, input);
  // console.log("Preview result:", result.rows);
  return {
    vendor: config.vendor,
    integrationName: getDatabaseDisplayName(integration),
    rows: result.rows || [],
    hasNext: result.hasNext === true,
    page: result.page || input.page || 1,
    pageSize: result.pageSize || result.rows?.length || 0,
    totalCount:
      Number.isFinite(Number(result.totalCount)) &&
      Number(result.totalCount) >= 0
        ? Number(result.totalCount)
        : null,
    table: result.table || null,
    canWrite: true,
    permissions: { insert: true, update: true, delete: true },
    executedQuery: "",
  };
}

// ─── Mutation ────────────────────────────────────────────────────────────────

async function mutateConnectedDatabase(userId, input = {}) {
  throw new Error(
    "Data mutations are handled by the Table Browser, not Data Mode."
  );
}

// ─── Raw query ────────────────────────────────────────────────────────────────

async function runRawConnectedDatabaseQuery(userId, input = {}) {
  const integration = await getDatabaseIntegration(userId);
  if (!integration)
    throw new Error("No database integration is connected yet.");
  const config = requireDatabaseConfig(integration.database || {});
  const result = await orchestrator.rawQuery(userId, config, input);
  return {
    vendor: config.vendor,
    integrationName: getDatabaseDisplayName(integration),
    rows: result.rows || [],
    rowCount: result.rowCount || 0,
    executedQuery: result.executedQuery || String(input.query || ""),
  };
}

// ─── Connection test ─────────────────────────────────────────────────────────

async function testDatabaseConnection(databaseConfig) {
  const config = requireDatabaseConfig(databaseConfig);
  const adapter = createAdapter(config);
  const cacheId = `test:${config.vendor}:${
    config.connectionString || config.filePath
  }`;
  const snapshot = await snapshotService.getSnapshot(cacheId, adapter, {
    force: true,
  });
  const count = (snapshot.objects || []).length;
  return {
    vendor: config.vendor,
    tableCount: count,
    message:
      count > 0
        ? `Connected successfully. Found ${count} table(s) or collection(s).`
        : "Connected successfully, but no tables or collections were found.",
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function _snapshotToLegacy(snapshot) {
  return {
    vendor: snapshot.vendor,
    tables: (snapshot.objects || []).map((obj) => ({
      name: obj.name,
      fields: (obj.fields || []).map((f) => ({
        name: f.name,
        type: f.type,
        primaryKey: f.is_primary_key,
      })),
      columns: (obj.fields || []).map((f) => `${f.name} (${f.type})`),
      primaryKeys: obj.primary_keys || [],
      estimatedRows: obj.estimated_rows ?? null,
    })),
  };
}

async function loadRelationalTableCounts(config, tables) {
  if (!_shouldProbeExactSchemaCounts(tables)) {
    return {};
  }

  const adapter = createAdapter(config);
  if (
    typeof adapter?._withConnection !== "function" ||
    typeof adapter?._countRows !== "function"
  ) {
    return {};
  }

  return adapter._withConnection(async (handle) => {
    const counts = {};
    for (const table of tables) {
      try {
        counts[table.name] = _normalizeCount(
          await adapter._countRows(handle, table.name)
        );
      } catch {
        counts[table.name] = _normalizeCount(table?.estimatedRows);
      }
    }
    return counts;
  });
}

async function loadPostgresTableCounts(configOrHandle, tablesOrConfig, maybeTables) {
  if (Array.isArray(maybeTables)) {
    return _loadPostgresTableCountsWithHandle(
      configOrHandle,
      tablesOrConfig,
      maybeTables
    );
  }

  const config = configOrHandle;
  const tables = Array.isArray(tablesOrConfig) ? tablesOrConfig : [];
  const adapter = createAdapter(config);

  if (typeof adapter?._withConnection !== "function") {
    return {};
  }

  return adapter._withConnection((handle) =>
    _loadPostgresTableCountsWithHandle(handle, config, tables, adapter)
  );
}

async function _loadPostgresTableCountsWithHandle(
  handle,
  config,
  tables,
  adapter = createAdapter({ ...(config || {}), vendor: "postgres" })
) {
  const counts = {};
  const schemaName = _inferSchemaName(config, tables);
  const params = schemaName ? [schemaName] : [];
  const where = schemaName ? "AND ns.nspname = $1" : "";

  const result = await handle.query(
    `SELECT ns.nspname AS schema_name,
            cls.relname AS table_name,
            GREATEST(COALESCE(cls.reltuples, 0), 0)::bigint AS row_count
       FROM pg_class cls
       JOIN pg_namespace ns
         ON ns.oid = cls.relnamespace
      WHERE cls.relkind IN ('r', 'p')
        AND ns.nspname NOT IN ('pg_catalog', 'information_schema')
        ${where}
      ORDER BY ns.nspname, cls.relname`,
    params
  );

  const estimateMap = new Map();
  for (const row of result?.rows || []) {
    const shortName = String(row?.table_name || "").trim();
    const fullName = row?.schema_name
      ? `${row.schema_name}.${shortName}`
      : shortName;
    const normalized = _normalizeCount(row?.row_count);
    if (shortName) {
      estimateMap.set(shortName, normalized);
    }
    if (fullName) {
      estimateMap.set(fullName, normalized);
    }
  }

  for (const table of tables) {
    counts[table.name] =
      estimateMap.get(table.name) ??
      estimateMap.get(_qualifiedNameParts(table.name).table) ??
      _normalizeCount(table?.estimatedRows);
  }

  if (!_shouldProbeExactSchemaCounts(tables)) {
    return counts;
  }

  for (const table of tables) {
    try {
      counts[table.name] = _normalizeCount(
        await adapter._countRows(handle, table.name)
      );
    } catch {
      counts[table.name] =
        counts[table.name] ?? _normalizeCount(table?.estimatedRows);
    }
  }

  return counts;
}

function _normalizeCount(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return null;
  }

  return numeric;
}

function _inferSchemaName(config, tables) {
  const configuredSchema = String(config?.defaultSchema || "").trim();
  if (configuredSchema && configuredSchema !== "*") {
    return configuredSchema;
  }

  for (const table of tables || []) {
    const parts = _qualifiedNameParts(table?.name);
    if (parts.schema) {
      return parts.schema;
    }
  }

  return "";
}

function _qualifiedNameParts(name = "") {
  const parts = String(name)
    .split(".")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length > 1) {
    return {
      schema: parts.slice(0, -1).join("."),
      table: parts.at(-1),
    };
  }

  return {
    schema: "",
    table: parts[0] || "",
  };
}

function _shouldProbeExactSchemaCounts(tables) {
  return (
    Array.isArray(tables) &&
    tables.length > 0 &&
    tables.length <= EXACT_SCHEMA_COUNT_TABLE_LIMIT
  );
}

module.exports = {
  SUPPORTED_DATABASE_VENDORS,
  getDatabaseIntegration,
  getDatabaseDisplayName,
  requireDatabaseConfig,
  loadDatabaseSchema,
  getSchemaTableCounts,
  queryConnectedDatabase,
  previewConnectedDatabase,
  mutateConnectedDatabase,
  runRawConnectedDatabaseQuery,
  testDatabaseConnection,
  __test: {
    loadPostgresTableCounts,
  },
};
