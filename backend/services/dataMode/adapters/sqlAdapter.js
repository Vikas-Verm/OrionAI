"use strict";

const SqliteDatabase = require("better-sqlite3");
const mysql = require("mysql2/promise");
const { enrichReferences } = require("../schema/referenceInference");
const { Client: PgClient } = require("pg");

const MAX_RESULT_ROWS = 200;
const SCHEMA_META_LIMIT = 5000;
const PROFILE_SAMPLE_N = 12;

/**
 * SQLAdapter
 *
 * Adapter for relational SQL databases: PostgreSQL, MySQL, SQLite.
 * Dialect-specific logic is isolated in the _dialect() helper.
 */
class SQLAdapter {
  constructor(config) {
    this._config = config;
    this._vendor = config.vendor;
  }

  detectCapabilities() {
    const base = {
      supportsJoins: true,
      supportsLookupJoin: false,
      supportsAggregation: true,
      supportsNestedPaths: false,
      supportsWindowFunctions: this._vendor === "postgres",
      supportsILIKE: this._vendor === "postgres",
      supportsCaseInsensitiveLike: true,
      supportsExplain: this._vendor !== "sqlite",
      supportsGroupBy: true,
      supportsCTE: this._vendor !== "sqlite",
      supportsFullTextSearch:
        this._vendor === "postgres" || this._vendor === "mysql",
    };
    return base;
  }

  async introspectSchema() {
    return this._withConnection(async (handle) => {
      const rows = await this._fetchSchemaRows(handle);
      const objects = enrichReferences(this._groupToObjects(rows));
      return { vendor: this._vendor, objects };
    });
  }

  async profileObjects(objects, options = {}) {
    console.log(
      "Profiling objects:",
      objects.map((o) => o.name)
    );

    return this._withConnection(async (handle) => {
      const result = {};

      const sampleSize = Math.min(
        Number(options.sampleSize) || PROFILE_SAMPLE_N,
        100
      );

      const page = Math.max(Number(options.page) || 1, 1);

      const rawOffset =
        options.offset !== undefined
          ? Number(options.offset)
          : (page - 1) * sampleSize;

      const offset = Math.max(Number.isFinite(rawOffset) ? rawOffset : 0, 0);
      const fieldSampleLimit = Math.min(sampleSize, 5);

      for (const obj of objects) {
        try {
          const previewRows = await this._fetchSampleRows(
            handle,
            obj.name,
            sampleSize,
            offset
          );

          const totalCount = await this._countRows(handle, obj.name);

          const fieldSamples = {};
          for (const row of previewRows) {
            for (const [k, v] of Object.entries(row)) {
              if (!fieldSamples[k]) fieldSamples[k] = [];
              if (
                v !== null &&
                v !== undefined &&
                fieldSamples[k].length < fieldSampleLimit
              ) {
                fieldSamples[k].push(v instanceof Date ? v.toISOString() : v);
              }
            }
          }

          result[obj.name] = {
            samples: fieldSamples,
            previewRows: previewRows.map((row) =>
              Object.fromEntries(
                Object.entries(row).map(([k, v]) => [
                  k,
                  v instanceof Date ? v.toISOString() : v,
                ])
              )
            ),
            row_estimate: totalCount,
            totalCount,
            page,
            pageSize: sampleSize,
            topValues: {},
          };
        } catch (err) {
          console.error(`Failed profiling ${obj.name}:`, err);
          result[obj.name] = {
            samples: {},
            previewRows: [],
            topValues: {},
            totalCount: 0,
            page,
            pageSize: sampleSize,
          };
        }
      }

      return result;
    });
  }

  async executePlan(physicalPlan) {
    return this._withConnection(async (handle) => {
      const sql = String(physicalPlan.sql || "").trim();
      const params = physicalPlan.params || [];
      this._assertReadOnly(sql);
      return this._runQuery(handle, sql, params);
    });
  }

  async _runSql(handle, sql, params = []) {
    // PostgreSQL
    if (typeof handle?.query === "function") {
      const result = await handle.query(sql, params);

      // pg => { rows: [...] }
      if (result && Array.isArray(result.rows)) {
        return result.rows;
      }

      // mysql2/promise => [rows, fields]
      if (Array.isArray(result)) {
        return Array.isArray(result[0]) ? result[0] : result;
      }

      // fallback
      return Array.isArray(result) ? result : [];
    }

    // better-sqlite3 style
    if (typeof handle?.prepare === "function") {
      const stmt = handle.prepare(sql);
      return stmt.all(...params);
    }

    // sqlite3 callback style
    if (typeof handle?.all === "function") {
      return await new Promise((resolve, reject) => {
        handle.all(sql, params, (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        });
      });
    }

    throw new Error(
      "Unsupported SQL handle: no query/prepare/all method found."
    );
  }

  async _countRows(handle, tableName) {
    const vendor = this._getVendorName();
    const quotedTable = this._quoteQualifiedName(tableName);

    let sql;
    let params = [];

    if (vendor === "postgres" || vendor === "postgresql") {
      sql = `SELECT COUNT(*)::bigint AS total_count FROM ${quotedTable}`;
    } else {
      sql = `SELECT COUNT(*) AS total_count FROM ${quotedTable}`;
    }

    const rows = await this._runSql(handle, sql, params);
    const firstRow = Array.isArray(rows) ? rows[0] : null;

    if (!firstRow) return 0;

    const rawValue =
      firstRow.total_count ??
      firstRow.TOTAL_COUNT ??
      firstRow.count ??
      Object.values(firstRow)[0];

    return Number(rawValue) || 0;
  }
  // ─── Schema introspection ───────────────────────────────────────────────────

  async _fetchSchemaRows(handle) {
    if (this._vendor === "postgres") {
      const schema =
        this._config.defaultSchema && this._config.defaultSchema !== "*"
          ? this._config.defaultSchema
          : null;
      const params = schema ? [schema] : [];
      const where = schema ? "AND c.table_schema = $1" : "";
      const result = await handle.query(
        `SELECT c.table_schema, c.table_name, c.column_name, c.data_type,
           c.is_nullable = 'YES' AS is_nullable,
           EXISTS (
             SELECT 1 FROM information_schema.table_constraints tc
             JOIN information_schema.key_column_usage kcu
               ON tc.constraint_name = kcu.constraint_name
              AND tc.table_schema = kcu.table_schema
              AND tc.table_name = kcu.table_name
             WHERE tc.constraint_type = 'PRIMARY KEY'
               AND kcu.table_schema = c.table_schema
               AND kcu.table_name = c.table_name
               AND kcu.column_name = c.column_name
           ) AS is_pk
         FROM information_schema.columns c
         WHERE c.table_schema NOT IN ('pg_catalog','information_schema') ${where}
         ORDER BY c.table_schema, c.table_name, c.ordinal_position
         LIMIT ${SCHEMA_META_LIMIT}`,
        params
      );
      return result.rows;
    }

    if (this._vendor === "mysql") {
      const [[dbRow]] = await handle.query("SELECT DATABASE() AS db");
      const schema = dbRow?.db;
      const where = schema
        ? "WHERE c.table_schema = ?"
        : "WHERE c.table_schema NOT IN ('information_schema','mysql','performance_schema','sys')";
      const params = schema ? [schema] : [];
      const [rows] = await handle.query(
        `
        SELECT c.table_schema, c.table_name, c.column_name, c.data_type,
          c.is_nullable = 'YES' AS is_nullable,
          CASE WHEN k.constraint_name = 'PRIMARY' THEN 1 ELSE 0 END AS is_pk
        FROM information_schema.columns c
        LEFT JOIN information_schema.key_column_usage k
          ON c.table_schema = k.table_schema AND c.table_name = k.table_name
         AND c.column_name = k.column_name AND k.constraint_name = 'PRIMARY'
        ${where}
        ORDER BY c.table_schema, c.table_name, c.ordinal_position
        LIMIT ${SCHEMA_META_LIMIT}`,
        params
      );
      return rows;
    }

    // SQLite
    const tables = handle
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
      )
      .all();
    const rows = [];
    for (const t of tables) {
      const cols = handle.prepare(`PRAGMA table_info("${t.name}")`).all();
      for (const c of cols) {
        rows.push({
          table_name: t.name,
          column_name: c.name,
          data_type: c.type || "text",
          is_nullable: !c.notnull,
          is_pk: Boolean(c.pk),
        });
      }
    }
    return rows;
  }

  _groupToObjects(rows) {
    const map = new Map();
    for (const row of rows) {
      const tableKey = row.table_schema
        ? `${row.table_schema}.${row.table_name}`
        : row.table_name;
      if (!map.has(tableKey)) {
        map.set(tableKey, {
          name: tableKey,
          type: "table",
          fields: [],
          primary_keys: [],
        });
      }
      const obj = map.get(tableKey);
      obj.fields.push({
        name: row.column_name,
        type: row.data_type || "text",
        nullable: Boolean(row.is_nullable),
        is_primary_key: Boolean(row.is_pk),
        is_foreign_key: false,
      });
      if (row.is_pk) obj.primary_keys.push(row.column_name);
    }
    return [...map.values()];
  }

  // ─── Sample rows ────────────────────────────────────────────────────────────

  async _fetchSampleRows(
    handle,
    tableName,
    limit = PROFILE_SAMPLE_N,
    offset = 0
  ) {
    const safeLimit = Math.min(Number(limit) || PROFILE_SAMPLE_N, 100);
    const safeOffset = Math.max(Number(offset) || 0, 0);
    const vendor = this._getVendorName();
    const quotedTable = this._quoteQualifiedName(tableName);

    let sql;
    let params;

    if (vendor === "postgres" || vendor === "postgresql") {
      sql = `SELECT * FROM ${quotedTable} LIMIT $1 OFFSET $2`;
      params = [safeLimit, safeOffset];
    } else {
      sql = `SELECT * FROM ${quotedTable} LIMIT ? OFFSET ?`;
      params = [safeLimit, safeOffset];
    }

    return await this._runSql(handle, sql, params);
  }

  // ─── Query execution ────────────────────────────────────────────────────────

  async _runQuery(handle, sql, params) {
    if (this._vendor === "postgres") {
      const result = await handle.query(sql, params);
      return {
        rows: result.rows || [],
        rowCount: result.rowCount || result.rows.length,
        executedQuery: sql,
      };
    }
    if (this._vendor === "mysql") {
      const [rows] = await handle.query(sql, params);
      return {
        rows: Array.isArray(rows) ? rows : [],
        rowCount: Array.isArray(rows) ? rows.length : 0,
        executedQuery: sql,
      };
    }
    // SQLite — synchronous
    const rows = handle.prepare(sql).all(...params);
    return { rows, rowCount: rows.length, executedQuery: sql };
  }

  _assertReadOnly(sql) {
    const low = sql
      .trim()
      .toLowerCase()
      .replace(/;+\s*$/, "");
    if (!/^select\b|^with\b/.test(low))
      throw new Error("Only read-only SELECT queries are allowed.");
    if (
      /\b(insert|update|delete|drop|alter|truncate|create|grant|revoke|replace)\b/.test(
        low
      )
    ) {
      throw new Error("Generated SQL was not read-only.");
    }
    if (sql.includes(";"))
      throw new Error("Multiple SQL statements are not allowed.");
  }

  // ─── Connection management ──────────────────────────────────────────────────

  async _withConnection(fn) {
    if (this._vendor === "sqlite") {
      const db = new SqliteDatabase(this._config.filePath, {
        readonly: true,
        fileMustExist: true,
      });
      try {
        return await fn(db);
      } finally {
        db.close();
      }
    }

    if (this._vendor === "postgres") {
      const client = new PgClient({
        connectionString: this._config.connectionString,
        ssl: this._config.ssl ? { rejectUnauthorized: false } : undefined,
      });
      await client.connect();
      try {
        return await fn(client);
      } finally {
        await client.end().catch(() => {});
      }
    }

    if (this._vendor === "mysql") {
      const conn = await mysql.createConnection(this._config.connectionString);
      try {
        return await fn(conn);
      } finally {
        await conn.end().catch(() => {});
      }
    }

    throw new Error(`Unsupported SQL vendor: ${this._vendor}`);
  }

  _quoteName(name = "") {
    const parts = name.split(".");
    const q = (p) => (this._vendor === "mysql" ? `\`${p}\`` : `"${p}"`);
    return parts.map(q).join(".");
  }
  _quoteIdentifierPart(part) {
    const vendor = this._getVendorName();

    if (vendor === "mysql" || vendor === "mariadb") {
      return `\`${String(part).replace(/`/g, "``")}\``;
    }

    return `"${String(part).replace(/"/g, '""')}"`;
  }

  _quoteQualifiedName(name) {
    return String(name)
      .split(".")
      .map((part) => this._quoteIdentifierPart(part))
      .join(".");
  }
  _getVendorName() {
    return String(
      this.vendor ||
        this._vendor ||
        this.dbConfig?.vendor ||
        this.config?.vendor ||
        ""
    ).toLowerCase();
  }
}

module.exports = { SQLAdapter };
