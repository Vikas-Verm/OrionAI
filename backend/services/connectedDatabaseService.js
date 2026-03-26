"use strict";

const mongoose = require("mongoose");
const SqliteDatabase = require("better-sqlite3");
const mysql = require("mysql2/promise");
const { Client: PgClient } = require("pg");
const Integration = require("../models/Integration");
const { chatCompleteNoSystem } = require("./llmService");

const SUPPORTED_DATABASE_VENDORS = ["mongodb", "postgres", "mysql", "sqlite"];
const MAX_RESULT_ROWS = 200;
const schemaCache = new Map();
const SCHEMA_METADATA_LIMIT = 5000;

function normalizeVendor(vendor) {
  const value = String(vendor || "")
    .trim()
    .toLowerCase();
  return SUPPORTED_DATABASE_VENDORS.includes(value) ? value : null;
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

async function getDatabaseIntegration(userId) {
  return Integration.findOne({
    userId,
    type: "database",
    enabled: true,
  });
}

function requireDatabaseConfig(database = {}) {
  const vendor = normalizeVendor(database.vendor);
  if (!vendor) {
    throw new Error(
      "Unsupported database vendor. Use MongoDB, PostgreSQL, MySQL, or SQLite."
    );
  }

  if (vendor === "sqlite") {
    if (!database.filePath) {
      throw new Error("SQLite requires a file path.");
    }
  } else if (!database.connectionString) {
    throw new Error("Connection string is required for this database.");
  }

  return {
    vendor,
    connectionString: database.connectionString || "",
    filePath: database.filePath || "",
    ssl: database.ssl === true,
    defaultSchema: database.defaultSchema || "public",
    readOnly: database.readOnly === true,
  };
}

function getSchemaCacheKey(config) {
  return JSON.stringify({
    vendor: config.vendor,
    connectionString: config.connectionString,
    filePath: config.filePath,
    defaultSchema: config.defaultSchema,
  });
}

function parseDatabaseNameFromConnectionString(connectionString = "") {
  try {
    const url = new URL(connectionString);
    const path = String(url.pathname || "")
      .replace(/^\/+/, "")
      .trim();
    return path || "";
  } catch {
    return "";
  }
}

function shouldSkipMongoDatabase(name = "") {
  return ["admin", "config", "local"].includes(String(name).toLowerCase());
}

function splitQualifiedName(name = "") {
  return String(name)
    .split(".")
    .map((part) => part.trim())
    .filter(Boolean);
}

function quoteIdentifierPart(vendor, value = "") {
  if (vendor === "mysql") {
    return `\`${String(value).replace(/`/g, "``")}\``;
  }
  return `"${String(value).replace(/"/g, '""')}"`;
}

function quoteQualifiedName(vendor, name = "") {
  const parts = splitQualifiedName(name);
  if (!parts.length) return "";
  return parts.map((part) => quoteIdentifierPart(vendor, part)).join(".");
}

function getTableFieldNames(table = {}) {
  if (Array.isArray(table.fields) && table.fields.length) {
    return table.fields.map((field) => field.name);
  }

  return (table.columns || []).map((column) => {
    const match = String(column).match(/^(.+?)\s+\(/);
    return match ? match[1] : String(column);
  });
}

function getTablePrimaryKeys(table = {}) {
  if (Array.isArray(table.primaryKeys)) {
    return table.primaryKeys;
  }

  if (Array.isArray(table.fields)) {
    return table.fields
      .filter((field) => field.primaryKey)
      .map((field) => field.name);
  }

  return [];
}

async function openDatabaseConnection(config) {
  switch (config.vendor) {
    case "mongodb": {
      const connection = mongoose.createConnection(config.connectionString, {
        serverSelectionTimeoutMS: 8000,
        maxPoolSize: 3,
        autoIndex: false,
      });
      await connection.asPromise();
      return { vendor: "mongodb", connection, db: connection.db };
    }

    case "postgres": {
      const client = new PgClient({
        connectionString: config.connectionString,
        ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
      });
      await client.connect();
      return { vendor: "postgres", client };
    }

    case "mysql": {
      const client = await mysql.createConnection(config.connectionString);
      return { vendor: "mysql", client };
    }

    case "sqlite": {
      const db = new SqliteDatabase(config.filePath, {
        readonly: config.readOnly === true,
        fileMustExist: true,
      });
      return { vendor: "sqlite", db };
    }

    default:
      throw new Error("Unsupported database vendor");
  }
}

async function closeDatabaseConnection(handle) {
  if (!handle) return;
  if (handle.vendor === "mongodb") {
    await handle.connection.close();
    return;
  }
  if (handle.vendor === "postgres") {
    await handle.client.end();
    return;
  }
  if (handle.vendor === "mysql") {
    await handle.client.end();
    return;
  }
  if (handle.vendor === "sqlite") {
    handle.db.close();
  }
}

async function withDatabaseConnection(config, fn) {
  const handle = await openDatabaseConnection(config);
  try {
    return await fn(handle);
  } finally {
    await closeDatabaseConnection(handle).catch(() => {});
  }
}

function pickObjectKeys(doc = {}) {
  return Object.keys(doc || {}).slice(0, 48);
}

async function describeMongoCollection(
  db,
  collectionName,
  { includeDbPrefix = false } = {}
) {
  const coll = db.collection(collectionName);
  const sample = await coll.findOne({});
  let estimatedRows = 0;
  try {
    estimatedRows = await coll.estimatedDocumentCount();
  } catch {}

  return {
    name: includeDbPrefix
      ? `${db.databaseName}.${collectionName}`
      : collectionName,
    columns: pickObjectKeys(sample || {}).map((key) => `${key} (mixed)`),
    fields: Object.keys(sample || {})
      .slice(0, 48)
      .map((key) => ({
        name: key,
        type: key === "_id" ? "objectId" : typeof sample[key],
        primaryKey: key === "_id",
      })),
    primaryKeys: ["_id"],
    estimatedRows,
  };
}

async function loadMongoCollectionsForDb(db, { includeDbPrefix = false } = {}) {
  const tables = [];
  let collections = [];

  try {
    collections = await db.listCollections().toArray();
  } catch {
    return tables;
  }

  for (const collection of collections) {
    try {
      tables.push(
        await describeMongoCollection(db, collection.name, { includeDbPrefix })
      );
    } catch {}
  }

  return tables;
}

async function loadMongoSchema(config) {
  return withDatabaseConnection(config, async ({ connection, db }) => {
    const primaryDbName =
      db?.databaseName ||
      connection?.name ||
      parseDatabaseNameFromConnectionString(config.connectionString);
    let tables = await loadMongoCollectionsForDb(db);

    if (!tables.length) {
      const admin = connection.getClient().db("admin");
      let databases = [];
      try {
        const result = await admin.admin().listDatabases();
        databases = Array.isArray(result.databases) ? result.databases : [];
      } catch {}

      for (const database of databases) {
        const dbName = database?.name;
        if (!dbName || shouldSkipMongoDatabase(dbName)) continue;
        if (primaryDbName && dbName === primaryDbName) continue;

        const candidateTables = await loadMongoCollectionsForDb(
          connection.getClient().db(dbName),
          { includeDbPrefix: true }
        );
        if (candidateTables.length) {
          tables.push(...candidateTables);
        }
      }
    }

    return { vendor: "mongodb", tables };
  });
}

async function loadPostgresSchema(config) {
  return withDatabaseConnection(config, async ({ client }) => {
    const params = [];
    const schemaFilter =
      config.defaultSchema && config.defaultSchema !== "*"
        ? "AND c.table_schema = $1"
        : "";
    if (schemaFilter) params.push(config.defaultSchema);

    let result = await client.query(
      `
        SELECT
          c.table_schema,
          c.table_name,
          c.column_name,
          c.data_type,
          EXISTS (
            SELECT 1
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu
              ON tc.constraint_name = kcu.constraint_name
             AND tc.table_schema = kcu.table_schema
             AND tc.table_name = kcu.table_name
            WHERE tc.constraint_type = 'PRIMARY KEY'
              AND kcu.table_schema = c.table_schema
              AND kcu.table_name = c.table_name
              AND kcu.column_name = c.column_name
          ) AS is_primary_key
        FROM information_schema.columns c
        WHERE c.table_schema NOT IN ('pg_catalog', 'information_schema')
        ${schemaFilter}
        ORDER BY c.table_schema, c.table_name, c.ordinal_position
        LIMIT ${SCHEMA_METADATA_LIMIT}
      `,
      params
    );

    if (!result.rows.length && schemaFilter) {
      result = await client.query(`
        SELECT
          c.table_schema,
          c.table_name,
          c.column_name,
          c.data_type,
          EXISTS (
            SELECT 1
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu
              ON tc.constraint_name = kcu.constraint_name
             AND tc.table_schema = kcu.table_schema
             AND tc.table_name = kcu.table_name
            WHERE tc.constraint_type = 'PRIMARY KEY'
              AND kcu.table_schema = c.table_schema
              AND kcu.table_name = c.table_name
              AND kcu.column_name = c.column_name
          ) AS is_primary_key
        FROM information_schema.columns c
        WHERE c.table_schema NOT IN ('pg_catalog', 'information_schema')
        ORDER BY c.table_schema, c.table_name, c.ordinal_position
        LIMIT ${SCHEMA_METADATA_LIMIT}
      `);
    }

    const grouped = new Map();

    for (const row of result.rows) {
      const tableKey = `${row.table_schema}.${row.table_name}`;
      if (!grouped.has(tableKey)) {
        grouped.set(tableKey, {
          name: tableKey,
          columns: [],
          fields: [],
          primaryKeys: [],
        });
      }
      const table = grouped.get(tableKey);
      table.columns.push(`${row.column_name} (${row.data_type})`);
      table.fields.push({
        name: row.column_name,
        type: row.data_type,
        primaryKey: row.is_primary_key === true,
      });
      if (row.is_primary_key === true) {
        table.primaryKeys.push(row.column_name);
      }
    }

    return { vendor: "postgres", tables: [...grouped.values()] };
  });
}

async function loadMySqlSchema(config) {
  return withDatabaseConnection(config, async ({ client }) => {
    const [[dbMeta = {}] = []] = await client.query(
      "SELECT DATABASE() AS currentDatabase"
    );
    let schemaName =
      dbMeta.currentDatabase ||
      parseDatabaseNameFromConnectionString(config.connectionString);
    let rows = [];

    if (schemaName) {
      const [scopedRows] = await client.query(
        `
          SELECT
            c.table_name,
            c.column_name,
            c.data_type,
            CASE WHEN k.constraint_name = 'PRIMARY' THEN 1 ELSE 0 END AS is_primary_key
          FROM information_schema.columns c
          LEFT JOIN information_schema.key_column_usage k
            ON c.table_schema = k.table_schema
           AND c.table_name = k.table_name
           AND c.column_name = k.column_name
           AND k.constraint_name = 'PRIMARY'
          WHERE c.table_schema = ?
          ORDER BY c.table_name, c.ordinal_position
          LIMIT ${SCHEMA_METADATA_LIMIT}
        `,
        [schemaName]
      );
      rows = scopedRows;
    }

    if (!rows.length) {
      const [allRows] = await client.query(`
        SELECT
          c.table_schema,
          c.table_name,
          c.column_name,
          c.data_type,
          CASE WHEN k.constraint_name = 'PRIMARY' THEN 1 ELSE 0 END AS is_primary_key
        FROM information_schema.columns c
        LEFT JOIN information_schema.key_column_usage k
          ON c.table_schema = k.table_schema
         AND c.table_name = k.table_name
         AND c.column_name = k.column_name
         AND k.constraint_name = 'PRIMARY'
        WHERE c.table_schema NOT IN ('information_schema', 'mysql', 'performance_schema', 'sys')
        ORDER BY c.table_schema, c.table_name, c.ordinal_position
        LIMIT ${SCHEMA_METADATA_LIMIT}
      `);
      rows = allRows;
    }

    const grouped = new Map();

    for (const row of rows) {
      const tableName = row.table_schema
        ? `${row.table_schema}.${row.table_name}`
        : row.table_name;
      if (!grouped.has(tableName)) {
        grouped.set(tableName, {
          name: tableName,
          columns: [],
          fields: [],
          primaryKeys: [],
        });
      }
      const table = grouped.get(tableName);
      table.columns.push(`${row.column_name} (${row.data_type})`);
      table.fields.push({
        name: row.column_name,
        type: row.data_type,
        primaryKey: Boolean(row.is_primary_key),
      });
      if (row.is_primary_key) {
        table.primaryKeys.push(row.column_name);
      }
    }

    return { vendor: "mysql", tables: [...grouped.values()] };
  });
}

async function loadSqliteSchema(config) {
  return withDatabaseConnection(config, async ({ db }) => {
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
      )
      .all();

    return {
      vendor: "sqlite",
      tables: tables.map((table) => {
        const columns = db
          .prepare(`PRAGMA table_info(${JSON.stringify(table.name)})`)
          .all();
        return {
          name: table.name,
          columns: columns.map(
            (column) => `${column.name} (${column.type || "text"})`
          ),
          fields: columns.map((column) => ({
            name: column.name,
            type: column.type || "text",
            primaryKey: Boolean(column.pk),
          })),
          primaryKeys: columns
            .filter((column) => Boolean(column.pk))
            .map((column) => column.name),
        };
      }),
    };
  });
}

async function loadDatabaseSchema(config, { force = false } = {}) {
  const cacheKey = getSchemaCacheKey(config);
  const cached = schemaCache.get(cacheKey);
  if (!force && cached && Date.now() - cached.cachedAt < 5 * 60 * 1000) {
    return cached.schema;
  }

  let schema;
  switch (config.vendor) {
    case "mongodb":
      schema = await loadMongoSchema(config);
      break;
    case "postgres":
      schema = await loadPostgresSchema(config);
      break;
    case "mysql":
      schema = await loadMySqlSchema(config);
      break;
    case "sqlite":
      schema = await loadSqliteSchema(config);
      break;
    default:
      throw new Error("Unsupported database vendor");
  }

  schemaCache.set(cacheKey, { schema, cachedAt: Date.now() });
  return schema;
}

async function getSchemaTableCounts(
  config,
  schema,
  { limit = 60 } = {}
) {
  const tables = Array.isArray(schema?.tables) ? schema.tables : [];
  if (!tables.length) return {};

  if (config.vendor === "mongodb") {
    return Object.fromEntries(
      tables.map((table) => [table.name, table.estimatedRows ?? null])
    );
  }

  return withDatabaseConnection(config, async (handle) => {
    const entries = [];

    for (const table of tables.slice(0, limit)) {
      const quotedTarget = quoteQualifiedName(config.vendor, table.name);
      if (!quotedTarget) {
        entries.push([table.name, null]);
        continue;
      }

      try {
        if (config.vendor === "postgres") {
          const result = await handle.client.query(
            `SELECT COUNT(*)::bigint AS count FROM ${quotedTarget}`
          );
          entries.push([table.name, Number(result.rows?.[0]?.count ?? 0)]);
          continue;
        }

        if (config.vendor === "mysql") {
          const [rows] = await handle.client.query(
            `SELECT COUNT(*) AS count FROM ${quotedTarget}`
          );
          entries.push([table.name, Number(rows?.[0]?.count ?? 0)]);
          continue;
        }

        if (config.vendor === "sqlite") {
          const row = handle.db
            .prepare(`SELECT COUNT(*) AS count FROM ${quotedTarget}`)
            .get();
          entries.push([table.name, Number(row?.count ?? 0)]);
          continue;
        }
      } catch {
        entries.push([table.name, null]);
      }
    }

    return Object.fromEntries(entries);
  });
}

function schemaToPrompt(schema) {
  const tables = (schema.tables || []).slice(0, 30);
  if (!tables.length) {
    return "No tables or collections were discovered.";
  }

  return tables
    .map((table) => {
      const columns = (table.columns || []).slice(0, 15).join(", ");
      const rowHint =
        table.estimatedRows !== undefined
          ? ` | approx rows: ${table.estimatedRows}`
          : "";
      return `- ${table.name}: ${columns || "no sampled columns"}${rowHint}`;
    })
    .join("\n");
}

function extractJson(raw = "") {
  const clean = String(raw)
    .replace(/```json/g, "")
    .replace(/```/g, "")
    .trim();
  const match = clean.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Model did not return JSON");
  return JSON.parse(match[0]);
}

function buildMongoPrompt(question, schema) {
  return [
    "You convert natural language into read-only MongoDB query plans.",
    "Return only valid JSON.",
    "Allowed operations: find, aggregate, count.",
    `Schema:\n${schemaToPrompt(schema)}`,
    "",
    `User question: "${question}"`,
    "",
    "Return this shape:",
    "{",
    '  "kind": "mongo",',
    '  "operation": "find" | "aggregate" | "count",',
    '  "collection": "exact_collection_name",',
    '  "query": {},',
    '  "projection": {},',
    '  "sort": {},',
    '  "limit": 20,',
    '  "pipeline": [],',
    '  "explanation": "short explanation"',
    "}",
    "",
    "Rules:",
    "- Use only collections shown in the schema.",
    "- Keep limit between 1 and 200.",
    "- Never write, update, delete, drop, or rename anything.",
  ].join("\n");
}

function buildSqlPrompt(question, schema, vendor) {
  return [
    `You convert natural language into safe read-only ${vendor} SQL.`,
    "Return only valid JSON.",
    `Schema:\n${schemaToPrompt(schema)}`,
    "",
    `User question: "${question}"`,
    "",
    "Return this shape:",
    "{",
    '  "kind": "sql",',
    '  "sql": "SELECT ... LIMIT 20",',
    '  "explanation": "short explanation"',
    "}",
    "",
    "Rules:",
    "- Only use SELECT queries or WITH ... SELECT queries.",
    "- Never write, update, delete, drop, alter, truncate, create, grant, or revoke.",
    "- Always cap results with LIMIT 200 or less.",
    "- Use exact table and column names from the schema.",
  ].join("\n");
}

function assertReadOnlySql(sql) {
  const statement = String(sql || "")
    .trim()
    .replace(/;+\s*$/, "");
  const lowered = statement.toLowerCase();
  if (!statement) throw new Error("Generated SQL is empty.");
  if (statement.includes(";")) {
    throw new Error("Multiple SQL statements are not allowed.");
  }
  if (!/^select\b|^with\b/.test(lowered)) {
    throw new Error("Only read-only SELECT queries are allowed.");
  }
  if (
    /\b(insert|update|delete|drop|alter|truncate|create|grant|revoke|replace)\b/.test(
      lowered
    )
  ) {
    throw new Error("Generated SQL was not read-only.");
  }
}

function ensureSqlLimit(sql) {
  const statement = String(sql || "")
    .trim()
    .replace(/;+\s*$/, "");
  if (/\blimit\s+\d+/i.test(statement)) return statement;
  return `${statement} LIMIT ${MAX_RESULT_ROWS}`;
}

async function buildDatabasePlan(question, config, schema) {
  const prompt =
    config.vendor === "mongodb"
      ? buildMongoPrompt(question, schema)
      : buildSqlPrompt(question, schema, config.vendor);
  const raw = await chatCompleteNoSystem(prompt, 900, 0.1);
  return extractJson(raw);
}

function resolveMongoCollectionTarget(handle, collectionRef = "") {
  const ref = String(collectionRef || "").trim();
  if (!ref) {
    throw new Error("Collection name is required.");
  }

  const separatorIndex = ref.indexOf(".");
  if (separatorIndex === -1) {
    return {
      db: handle.db,
      collectionName: ref,
      collection: handle.db.collection(ref),
    };
  }

  const dbName = ref.slice(0, separatorIndex).trim();
  const collectionName = ref.slice(separatorIndex + 1).trim();

  if (!dbName || !collectionName) {
    return {
      db: handle.db,
      collectionName: ref,
      collection: handle.db.collection(ref),
    };
  }

  const db = handle.connection.getClient().db(dbName);
  return {
    db,
    collectionName,
    collection: db.collection(collectionName),
  };
}

async function executeMongoPlan(handle, plan) {
  const target = resolveMongoCollectionTarget(handle, plan.collection);
  const collection = target.collection;
  const limit = Math.max(
    1,
    Math.min(Number(plan.limit) || 20, MAX_RESULT_ROWS)
  );

  if (plan.operation === "aggregate") {
    const rows = await collection
      .aggregate(Array.isArray(plan.pipeline) ? plan.pipeline : [])
      .limit(limit)
      .toArray();
    return { rows, rowCount: rows.length };
  }

  if (plan.operation === "count") {
    const count = await collection.countDocuments(plan.query || {});
    return { rows: [{ count }], rowCount: 1 };
  }

  const cursor = collection.find(plan.query || {}, {
    projection: plan.projection || undefined,
    sort: plan.sort || undefined,
    limit,
  });
  const rows = await cursor.toArray();
  return { rows, rowCount: rows.length };
}

async function executeSqlPlan(handle, vendor, plan) {
  assertReadOnlySql(plan.sql);
  const safeSql = ensureSqlLimit(plan.sql);

  if (vendor === "postgres") {
    const result = await handle.client.query(safeSql);
    return {
      rows: result.rows || [],
      rowCount: result.rowCount || result.rows.length,
      executedQuery: safeSql,
    };
  }

  if (vendor === "mysql") {
    const [rows] = await handle.client.query(safeSql);
    return {
      rows: Array.isArray(rows) ? rows : [],
      rowCount: Array.isArray(rows) ? rows.length : 0,
      executedQuery: safeSql,
    };
  }

  if (vendor === "sqlite") {
    const rows = handle.db.prepare(safeSql).all();
    return { rows, rowCount: rows.length, executedQuery: safeSql };
  }

  throw new Error("Unsupported SQL vendor");
}

async function executeDatabasePlan(config, plan) {
  return withDatabaseConnection(config, async (handle) => {
    if (config.vendor === "mongodb") {
      return executeMongoPlan(handle, plan);
    }
    return executeSqlPlan(handle, config.vendor, plan);
  });
}

async function executeRawMongoPlan(handle, input = {}) {
  const collectionName = String(input.collection || "").trim();
  if (!collectionName) {
    throw new Error("Choose a collection before running a raw Mongo query.");
  }

  const source = String(input.query || "").trim();
  if (!source) {
    throw new Error("Raw Mongo query is empty.");
  }

  let parsed;
  try {
    parsed = JSON.parse(source);
  } catch {
    throw new Error("Raw Mongo query must be valid JSON.");
  }

  const target = resolveMongoCollectionTarget(handle, collectionName);
  const collection = target.collection;

  if (Array.isArray(parsed)) {
    const rows = await collection
      .aggregate(parsed)
      .limit(MAX_RESULT_ROWS)
      .toArray();
    return {
      rows,
      rowCount: rows.length,
      executedQuery: `${collectionName}.aggregate(${source})`,
    };
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error(
      "Raw Mongo query must be a JSON object or aggregation array."
    );
  }

  const query =
    parsed.query && typeof parsed.query === "object" ? parsed.query : parsed;
  const projection =
    parsed.projection && typeof parsed.projection === "object"
      ? parsed.projection
      : undefined;
  const sort =
    parsed.sort && typeof parsed.sort === "object" ? parsed.sort : undefined;
  const limit = Math.max(
    1,
    Math.min(Number(parsed.limit) || 20, MAX_RESULT_ROWS)
  );

  const rows = await collection
    .find(query, { projection, sort, limit })
    .toArray();

  return {
    rows,
    rowCount: rows.length,
    executedQuery: `${collectionName}.find(${JSON.stringify(query)})`,
  };
}

async function executeRawDatabasePlan(config, input = {}) {
  return withDatabaseConnection(config, async (handle) => {
    if (config.vendor === "mongodb") {
      return executeRawMongoPlan(handle, input);
    }

    const sql = String(input.query || "").trim();
    if (!sql) {
      throw new Error("Raw SQL query is empty.");
    }

    return executeSqlPlan(handle, config.vendor, { sql });
  });
}

function resolveSchemaTable(schema, targetName = "") {
  return (
    (schema.tables || []).find((table) => table.name === targetName) || null
  );
}

function normalizePage(page) {
  return Math.max(1, Number(page) || 1);
}

function normalizePageSize(pageSize) {
  return Math.max(1, Math.min(Number(pageSize) || 20, 100));
}

function normalizeMongoId(value) {
  if (!value) return value;
  if (typeof value === "object" && value.$oid) {
    value = value.$oid;
  }
  if (mongoose.Types.ObjectId.isValid(value)) {
    return new mongoose.Types.ObjectId(value);
  }
  return value;
}

function escapeRegex(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getSearchableFieldNames(table = {}) {
  return [...new Set(getTableFieldNames(table))]
    .map((name) => String(name || "").trim())
    .filter((name) => name && name !== "__v")
    .slice(0, 48);
}

function getSearchableSqlFields(table = {}) {
  const fields = Array.isArray(table.fields) ? table.fields : [];
  if (!fields.length) {
    return getSearchableFieldNames(table).map((name) => ({ name, type: "" }));
  }

  return fields
    .filter((field) => {
      const type = String(field?.type || "").toLowerCase();
      return !/(blob|binary|bytea|varbinary)/.test(type);
    })
    .map((field) => ({
      name: String(field?.name || "").trim(),
      type: String(field?.type || ""),
    }))
    .filter((field) => field.name)
    .slice(0, 48);
}

function buildMongoSearchFilter(table, searchTerm) {
  const value = String(searchTerm || "").trim();
  if (!value) return {};

  const regex = { $regex: escapeRegex(value), $options: "i" };
  const fields = getSearchableFieldNames(table);
  const or = [];

  if (mongoose.Types.ObjectId.isValid(value)) {
    or.push({ _id: new mongoose.Types.ObjectId(value) });
  }

  for (const fieldName of fields) {
    if (fieldName === "_id") continue;
    or.push({ [fieldName]: regex });
  }

  return or.length ? { $or: or } : {};
}

function buildSqlSearchClause(vendor, table, searchTerm, startIndex = 1) {
  const value = String(searchTerm || "").trim();
  if (!value) return { clause: "", params: [] };

  const fields = getSearchableSqlFields(table);
  if (!fields.length) {
    return { clause: "", params: [] };
  }

  const needle = `%${value.toLowerCase()}%`;
  const params = [];
  const clause = fields
    .map((field, index) => {
      params.push(needle);
      const column = quoteIdentifierPart(vendor, field.name);
      if (vendor === "postgres") {
        return `LOWER(CAST(${column} AS TEXT)) LIKE $${startIndex + index}`;
      }
      if (vendor === "mysql") {
        return `LOWER(CAST(${column} AS CHAR)) LIKE ?`;
      }
      return `LOWER(CAST(${column} AS TEXT)) LIKE ?`;
    })
    .join(" OR ");

  return {
    clause: clause ? `(${clause})` : "",
    params,
  };
}

function defaultWritePermissions(allowed = false) {
  return {
    insert: allowed,
    update: allowed,
    delete: allowed,
  };
}

function parseMongoTargetName(targetName = "") {
  const ref = String(targetName || "").trim();
  const separatorIndex = ref.indexOf(".");
  if (separatorIndex === -1) {
    return { dbName: "", collectionName: ref };
  }
  return {
    dbName: ref.slice(0, separatorIndex).trim(),
    collectionName: ref.slice(separatorIndex + 1).trim(),
  };
}

function hasMongoAction(
  privileges = [],
  dbName = "",
  collectionName = "",
  action = ""
) {
  return privileges.some((privilege) => {
    const resource = privilege?.resource || {};
    const resourceDb = resource.db || "";
    const resourceCollection = resource.collection || "";
    const dbMatches = !resourceDb || resourceDb === dbName;
    const collectionMatches =
      !resourceCollection || resourceCollection === collectionName;
    return (
      dbMatches &&
      collectionMatches &&
      Array.isArray(privilege.actions) &&
      (privilege.actions.includes(action) ||
        privilege.actions.includes("anyAction"))
    );
  });
}

async function detectMongoWritePermissions(handle, targetName) {
  try {
    const status = await handle.connection
      .getClient()
      .db("admin")
      .command({ connectionStatus: 1, showPrivileges: true });
    const privileges = status?.authInfo?.authenticatedUserPrivileges || [];
    const target = parseMongoTargetName(targetName);
    return {
      insert: hasMongoAction(
        privileges,
        target.dbName,
        target.collectionName,
        "insert"
      ),
      update: hasMongoAction(
        privileges,
        target.dbName,
        target.collectionName,
        "update"
      ),
      delete: hasMongoAction(
        privileges,
        target.dbName,
        target.collectionName,
        "remove"
      ),
    };
  } catch {
    return defaultWritePermissions(true);
  }
}

function parseShowGrantRows(rows = []) {
  return rows
    .flatMap((row) => Object.values(row || {}))
    .map((value) => String(value || "").toUpperCase());
}

function grantMatchesTarget(grant, targetName) {
  const parts = splitQualifiedName(targetName);
  const schemaName = parts.length > 1 ? parts[0]?.toUpperCase() : "";
  const tableName =
    parts.length > 1 ? parts[1]?.toUpperCase() : parts[0]?.toUpperCase();
  if (grant.includes(" ON *.* ")) return true;
  if (schemaName && grant.includes(` ON \`${schemaName}\`.* `)) return true;
  if (
    schemaName &&
    tableName &&
    grant.includes(` ON \`${schemaName}\`.\`${tableName}\` `)
  )
    return true;
  return false;
}

async function detectSqlWritePermissions(handle, vendor, targetName) {
  try {
    if (vendor === "postgres") {
      const result = await handle.client.query(
        `
          SELECT
            has_table_privilege(current_user, $1, 'INSERT') AS can_insert,
            has_table_privilege(current_user, $1, 'UPDATE') AS can_update,
            has_table_privilege(current_user, $1, 'DELETE') AS can_delete
        `,
        [targetName]
      );
      const row = result.rows?.[0] || {};
      return {
        insert: row.can_insert === true,
        update: row.can_update === true,
        delete: row.can_delete === true,
      };
    }

    if (vendor === "mysql") {
      const [rows] = await handle.client.query(
        "SHOW GRANTS FOR CURRENT_USER()"
      );
      const grants = parseShowGrantRows(rows).filter((grant) =>
        grantMatchesTarget(grant, targetName)
      );
      const allows = (keyword) =>
        grants.some(
          (grant) =>
            grant.includes("ALL PRIVILEGES") ||
            grant.includes(`${keyword},`) ||
            grant.includes(`, ${keyword}`) ||
            grant.includes(` ${keyword} `)
        );
      return {
        insert: allows("INSERT"),
        update: allows("UPDATE"),
        delete: allows("DELETE"),
      };
    }

    if (vendor === "sqlite") {
      return defaultWritePermissions(true);
    }
  } catch {
    return defaultWritePermissions(true);
  }

  return defaultWritePermissions(true);
}

async function detectWritePermissions(config, handle, targetName) {
  if (config.vendor === "mongodb") {
    return detectMongoWritePermissions(handle, targetName);
  }
  return detectSqlWritePermissions(handle, config.vendor, targetName);
}

async function previewMongoTarget(
  handle,
  table,
  { page = 1, pageSize = 20, searchTerm = "" } = {}
) {
  const targetName = table?.name || table;
  const target = resolveMongoCollectionTarget(handle, targetName);
  const offset = (normalizePage(page) - 1) * normalizePageSize(pageSize);
  const limit = normalizePageSize(pageSize);
  const filter = buildMongoSearchFilter(table, searchTerm);
  const rows = await target.collection
    .find(filter)
    .sort({ _id: -1 })
    .skip(offset)
    .limit(limit + 1)
    .toArray();
  const hasNext = rows.length > limit;

  return {
    rows: hasNext ? rows.slice(0, limit) : rows,
    hasNext,
    page: normalizePage(page),
    pageSize: limit,
    executedQuery: `${targetName}.find(${JSON.stringify(
      filter
    )}).sort({"_id":-1}).skip(${offset}).limit(${limit})`,
  };
}

async function previewSqlTarget(
  handle,
  vendor,
  table,
  { page = 1, pageSize = 20, searchTerm = "" } = {}
) {
  const targetName = table?.name || table;
  const limit = normalizePageSize(pageSize);
  const currentPage = normalizePage(page);
  const offset = (currentPage - 1) * limit;
  const quotedTarget = quoteQualifiedName(vendor, targetName);
  const search = buildSqlSearchClause(vendor, table, searchTerm);
  const whereClause = search.clause ? ` WHERE ${search.clause}` : "";
  const queryBase = `SELECT * FROM ${quotedTarget}${whereClause}`;

  if (!quotedTarget) {
    throw new Error("Table name is required.");
  }

  if (vendor === "postgres") {
    const dataResult = await handle.client.query(
      `${queryBase} LIMIT $${search.params.length + 1} OFFSET $${
        search.params.length + 2
      }`,
      [...search.params, limit + 1, offset]
    );
    const rows = dataResult.rows || [];
    return {
      rows: rows.length > limit ? rows.slice(0, limit) : rows,
      hasNext: rows.length > limit,
      page: currentPage,
      pageSize: limit,
      executedQuery: `${queryBase} LIMIT ${limit} OFFSET ${offset}`,
    };
  }

  if (vendor === "mysql") {
    const [rows] = await handle.client.query(`${queryBase} LIMIT ? OFFSET ?`, [
      ...search.params,
      limit + 1,
      offset,
    ]);
    const safeRows = Array.isArray(rows) ? rows : [];
    return {
      rows: safeRows.length > limit ? safeRows.slice(0, limit) : safeRows,
      hasNext: safeRows.length > limit,
      page: currentPage,
      pageSize: limit,
      executedQuery: `${queryBase} LIMIT ${limit} OFFSET ${offset}`,
    };
  }

  if (vendor === "sqlite") {
    const rows = handle.db
      .prepare(`${queryBase} LIMIT ? OFFSET ?`)
      .all(...search.params, limit + 1, offset);
    return {
      rows: rows.length > limit ? rows.slice(0, limit) : rows,
      hasNext: rows.length > limit,
      page: currentPage,
      pageSize: limit,
      executedQuery: `${queryBase} LIMIT ${limit} OFFSET ${offset}`,
    };
  }

  throw new Error("Unsupported SQL vendor");
}

async function previewConnectedTable(config, table, options = {}) {
  return withDatabaseConnection(config, async (handle) => {
    const targetName = table?.name || table;
    const permissions = await detectWritePermissions(
      config,
      handle,
      targetName
    );
    if (config.vendor === "mongodb") {
      return {
        ...(await previewMongoTarget(handle, table, options)),
        permissions,
      };
    }
    return {
      ...(await previewSqlTarget(handle, config.vendor, table, options)),
      permissions,
    };
  });
}

function buildSqlWhereClause(
  vendor,
  primaryKeys = [],
  row = {},
  startIndex = 1
) {
  if (!primaryKeys.length) {
    throw new Error(
      "This table needs a primary key before OrionAI can edit or delete rows."
    );
  }

  const params = [];
  const clauses = primaryKeys.map((key, index) => {
    if (!(key in row)) {
      throw new Error(`Primary key "${key}" is missing from the selected row.`);
    }
    params.push(row[key]);
    if (vendor === "postgres") {
      return `${quoteIdentifierPart(vendor, key)} = $${startIndex + index}`;
    }
    return `${quoteIdentifierPart(vendor, key)} = ?`;
  });

  return {
    clause: clauses.join(" AND "),
    params,
  };
}

async function insertSqlRow(handle, vendor, targetName, payload = {}) {
  const keys = Object.keys(payload || {});
  if (!keys.length) {
    throw new Error("New row data is empty.");
  }

  const columns = keys
    .map((key) => quoteIdentifierPart(vendor, key))
    .join(", ");
  const placeholders =
    vendor === "postgres"
      ? keys.map((_, index) => `$${index + 1}`).join(", ")
      : keys.map(() => "?").join(", ");
  const values = keys.map((key) => payload[key]);
  const sql = `INSERT INTO ${quoteQualifiedName(
    vendor,
    targetName
  )} (${columns}) VALUES (${placeholders})`;

  if (vendor === "postgres") {
    await handle.client.query(sql, values);
    return sql;
  }
  if (vendor === "mysql") {
    await handle.client.query(sql, values);
    return sql;
  }
  handle.db.prepare(sql).run(...values);
  return sql;
}

async function updateSqlRow(
  handle,
  vendor,
  targetName,
  table,
  originalRow = {},
  nextRow = {}
) {
  const primaryKeys = getTablePrimaryKeys(table);
  const keys = Object.keys(nextRow || {}).filter(
    (key) => !primaryKeys.includes(key)
  );
  if (!keys.length) {
    throw new Error("There are no editable fields in this row.");
  }

  if (vendor === "postgres") {
    const setClause = keys
      .map(
        (key, index) => `${quoteIdentifierPart(vendor, key)} = $${index + 1}`
      )
      .join(", ");
    const where = buildSqlWhereClause(
      vendor,
      primaryKeys,
      originalRow,
      keys.length + 1
    );
    const sql = `UPDATE ${quoteQualifiedName(
      vendor,
      targetName
    )} SET ${setClause} WHERE ${where.clause}`;
    await handle.client.query(sql, [
      ...keys.map((key) => nextRow[key]),
      ...where.params,
    ]);
    return sql;
  }

  const setClause = keys
    .map((key) => `${quoteIdentifierPart(vendor, key)} = ?`)
    .join(", ");
  const where = buildSqlWhereClause(vendor, primaryKeys, originalRow);
  const sql = `UPDATE ${quoteQualifiedName(
    vendor,
    targetName
  )} SET ${setClause} WHERE ${where.clause}`;
  const values = [...keys.map((key) => nextRow[key]), ...where.params];

  if (vendor === "mysql") {
    await handle.client.query(sql, values);
    return sql;
  }

  handle.db.prepare(sql).run(...values);
  return sql;
}

async function deleteSqlRow(handle, vendor, targetName, table, row = {}) {
  const where = buildSqlWhereClause(vendor, getTablePrimaryKeys(table), row);
  const sql = `DELETE FROM ${quoteQualifiedName(vendor, targetName)} WHERE ${
    where.clause
  }`;

  if (vendor === "postgres") {
    await handle.client.query(sql, where.params);
    return sql;
  }
  if (vendor === "mysql") {
    await handle.client.query(sql, where.params);
    return sql;
  }
  handle.db.prepare(sql).run(...where.params);
  return sql;
}

async function mutateConnectedTable(config, table, payload = {}) {
  const targetName = String(payload.target || table?.name || "").trim();
  if (!targetName) {
    throw new Error("Target table or collection is required.");
  }

  return withDatabaseConnection(config, async (handle) => {
    const permissions = await detectWritePermissions(
      config,
      handle,
      targetName
    );
    if (payload.action === "insert" && !permissions.insert) {
      throw new Error(
        "This connection cannot insert rows for the selected table or collection."
      );
    }
    if (payload.action === "update" && !permissions.update) {
      throw new Error(
        "This connection cannot update rows for the selected table or collection."
      );
    }
    if (payload.action === "delete" && !permissions.delete) {
      throw new Error(
        "This connection cannot delete rows for the selected table or collection."
      );
    }

    if (config.vendor === "mongodb") {
      const target = resolveMongoCollectionTarget(handle, targetName);
      const collection = target.collection;

      if (payload.action === "insert") {
        const result = await collection.insertOne(payload.nextRow || {});
        return {
          action: "insert",
          affectedRows: result.acknowledged ? 1 : 0,
          executedQuery: `${targetName}.insertOne(...)`,
        };
      }

      const idValue = normalizeMongoId(
        payload.originalRow?._id ?? payload.nextRow?._id
      );
      if (!idValue) {
        throw new Error("Mongo edits require an _id field.");
      }

      if (payload.action === "update") {
        const nextRow = { ...(payload.nextRow || {}) };
        delete nextRow._id;
        const result = await collection.updateOne(
          { _id: idValue },
          { $set: nextRow }
        );
        return {
          action: "update",
          affectedRows: result.modifiedCount || 0,
          executedQuery: `${targetName}.updateOne({_id: ...}, {$set: ...})`,
        };
      }

      if (payload.action === "delete") {
        const result = await collection.deleteOne({ _id: idValue });
        return {
          action: "delete",
          affectedRows: result.deletedCount || 0,
          executedQuery: `${targetName}.deleteOne({_id: ...})`,
        };
      }

      throw new Error("Unsupported mutation action.");
    }

    if (payload.action === "insert") {
      const executedQuery = await insertSqlRow(
        handle,
        config.vendor,
        targetName,
        payload.nextRow || {}
      );
      return { action: "insert", affectedRows: 1, executedQuery };
    }

    if (payload.action === "update") {
      const executedQuery = await updateSqlRow(
        handle,
        config.vendor,
        targetName,
        table,
        payload.originalRow || {},
        payload.nextRow || {}
      );
      return { action: "update", affectedRows: 1, executedQuery };
    }

    if (payload.action === "delete") {
      const executedQuery = await deleteSqlRow(
        handle,
        config.vendor,
        targetName,
        table,
        payload.originalRow || {}
      );
      return { action: "delete", affectedRows: 1, executedQuery };
    }

    throw new Error("Unsupported mutation action.");
  });
}

function safePreviewRows(rows = []) {
  return rows.slice(0, 8).map((row) => {
    const copy = { ...row };
    for (const key of Object.keys(copy)) {
      const value = copy[key];
      if (value instanceof Date) copy[key] = value.toISOString();
      if (typeof value === "object" && value !== null) {
        copy[key] = JSON.stringify(value).slice(0, 300);
      }
    }
    return copy;
  });
}

async function formatDatabaseAnswer(question, result) {
  const prompt = [
    "You are OrionAI answering from a connected business database.",
    "Keep the answer concise, trustworthy, and practical.",
    `User question: "${question}"`,
    `Database vendor: ${result.vendor}`,
    `Executed query: ${result.executedQuery}`,
    `Row count: ${result.rowCount}`,
    `Query explanation: ${result.queryPlan.explanation || "N/A"}`,
    `Rows JSON: ${JSON.stringify(safePreviewRows(result.rows))}`,
    "",
    "Answer with:",
    "- A direct answer first",
    "- Then the most relevant details from the rows if helpful",
    "- Mention if the result set is empty",
  ].join("\n");

  return chatCompleteNoSystem(prompt, 700, 0.2);
}

async function queryConnectedDatabase(userId, question) {
  const integration = await getDatabaseIntegration(userId);
  if (!integration) {
    throw new Error("No database integration is connected yet.");
  }

  const config = requireDatabaseConfig(integration.database || {});
  const schema = await loadDatabaseSchema(config);
  const queryPlan = await buildDatabasePlan(question, config, schema);
  const execution = await executeDatabasePlan(config, queryPlan);
  const executedQuery =
    config.vendor === "mongodb"
      ? `${queryPlan.collection}.${queryPlan.operation}`
      : execution.executedQuery || queryPlan.sql;

  const result = {
    vendor: config.vendor,
    integrationName: getDatabaseDisplayName(integration),
    queryPlan,
    executedQuery,
    rows: execution.rows || [],
    rowCount: execution.rowCount || 0,
    schema,
  };

  result.reply = await formatDatabaseAnswer(question, result);
  return result;
}

async function runRawConnectedDatabaseQuery(userId, input = {}) {
  const integration = await getDatabaseIntegration(userId);
  if (!integration) {
    throw new Error("No database integration is connected yet.");
  }

  const config = requireDatabaseConfig(integration.database || {});
  const execution = await executeRawDatabasePlan(config, input);

  return {
    vendor: config.vendor,
    integrationName: getDatabaseDisplayName(integration),
    rows: execution.rows || [],
    rowCount: execution.rowCount || 0,
    executedQuery: execution.executedQuery || String(input.query || ""),
  };
}

async function previewConnectedDatabase(userId, input = {}) {
  const integration = await getDatabaseIntegration(userId);
  if (!integration) {
    throw new Error("No database integration is connected yet.");
  }

  const config = requireDatabaseConfig(integration.database || {});
  const schema = await loadDatabaseSchema(config, { force: true });
  const targetName = String(input.target || "").trim();
  const table = resolveSchemaTable(schema, targetName);

  if (!table) {
    throw new Error(
      "Selected table or collection was not found in the schema."
    );
  }

  const preview = await previewConnectedTable(config, table, input);
  return {
    vendor: config.vendor,
    integrationName: getDatabaseDisplayName(integration),
    canWrite: Boolean(
      preview.permissions?.insert ||
        preview.permissions?.update ||
        preview.permissions?.delete
    ),
    permissions: preview.permissions || defaultWritePermissions(false),
    table,
    ...preview,
  };
}

async function mutateConnectedDatabase(userId, input = {}) {
  const integration = await getDatabaseIntegration(userId);
  if (!integration) {
    throw new Error("No database integration is connected yet.");
  }

  const config = requireDatabaseConfig(integration.database || {});
  const schema = await loadDatabaseSchema(config, { force: true });
  const targetName = String(input.target || "").trim();
  const table = resolveSchemaTable(schema, targetName);

  if (!table && config.vendor !== "mongodb") {
    throw new Error("Selected table was not found in the schema.");
  }

  const mutation = await mutateConnectedTable(config, table, input);
  return {
    vendor: config.vendor,
    integrationName: getDatabaseDisplayName(integration),
    ...mutation,
  };
}

async function testDatabaseConnection(databaseConfig) {
  const config = requireDatabaseConfig(databaseConfig);
  const schema = await loadDatabaseSchema(config, { force: true });
  return {
    vendor: config.vendor,
    tableCount: (schema.tables || []).length,
    message:
      schema.tables?.length > 0
        ? `Connected successfully. Found ${schema.tables.length} table(s) or collection(s).`
        : "Connected successfully, but no tables or collections were found.",
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
