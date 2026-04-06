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
  return Object.fromEntries(
    tables.map((t) => [t.name, t.estimatedRows ?? null])
  );
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
  const integration = await getDatabaseIntegration(userId);
  if (!integration)
    throw new Error("No database integration is connected yet.");
  const config = requireDatabaseConfig(integration.database || {});
  const result = await orchestrator.previewTable(userId, config, input);
  return {
    vendor: config.vendor,
    integrationName: getDatabaseDisplayName(integration),
    rows: result.rows || [],
    hasNext: false,
    page: 1,
    pageSize: result.rows?.length || 0,
    table: result.table || null,
    canWrite: false,
    permissions: { insert: false, update: false, delete: false },
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
};
