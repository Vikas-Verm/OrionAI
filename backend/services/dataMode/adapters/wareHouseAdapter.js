"use strict";

/**
 * WarehouseAdapter.js
 *
 * Adapter family for cloud analytical data warehouses:
 *   BigQuery, Snowflake, Redshift, ClickHouse, Databricks
 *
 * ─── HOW TO ENABLE A SPECIFIC WAREHOUSE ──────────────────────────────────────
 *
 * Each warehouse has a different client library. Install the one you need:
 *
 *   BigQuery:   npm install @google-cloud/bigquery
 *   Snowflake:  npm install snowflake-sdk
 *   Redshift:   npm install pg  (Redshift is PostgreSQL-compatible)
 *   ClickHouse: npm install @clickhouse/client
 *   Databricks: npm install @databricks/sql
 *
 * Then uncomment the relevant section in _connect() below.
 *
 * ─── WHAT WAREHOUSES GIVE YOU ─────────────────────────────────────────────────
 *
 * Warehouses are optimised for analytical (OLAP) queries:
 *   - Massive table scans (billions of rows)
 *   - Complex aggregations across many columns
 *   - Window functions (OVER, PARTITION BY, RANK)
 *   - Columnar storage — COUNT(*) and SUM() are extremely fast
 *
 * Warehouses do NOT give you:
 *   - Row-level mutations (insert/update/delete are restricted or absent)
 *   - Consistent sub-millisecond latency
 *   - Nested document paths (mostly flat tables)
 *
 * ─── QUERY LANGUAGE ──────────────────────────────────────────────────────────
 *
 * All supported warehouses use SQL, so SQLCompiler works directly.
 * Dialect differences:
 *   - BigQuery:   backtick quoting, DATE() functions, project.dataset.table naming
 *   - Snowflake:  double-quote identifiers, ILIKE, schema.table naming
 *   - Redshift:   PostgreSQL dialect (use existing postgresDialect)
 *   - ClickHouse: toDate(), toDateTime(), arrayJoin() for nested arrays
 *
 * Add a warehouseDialect.js if you need warehouse-specific SQL transforms.
 */

const { BaseAdapter } = require("./baseAdapter");

const WAREHOUSE_VENDORS = [
  "bigquery",
  "snowflake",
  "redshift",
  "clickhouse",
  "databricks",
];
const MAX_RESULT_ROWS = 200;

class WarehouseAdapter extends BaseAdapter {
  constructor(config) {
    super(config);
    if (!WAREHOUSE_VENDORS.includes(config.vendor)) {
      throw new Error(
        `WarehouseAdapter does not support vendor: ${config.vendor}`
      );
    }
  }

  // ─── Capabilities ───────────────────────────────────────────────────────────

  detectCapabilities() {
    const base = {
      supportsJoins: true,
      supportsLookupJoin: false,
      supportsAggregation: true,
      supportsNestedPaths: false,
      supportsWindowFunctions: true, // warehouses excel at window functions
      supportsILIKE:
        this._vendor === "snowflake" || this._vendor === "redshift",
      supportsCaseInsensitiveLike: true,
      supportsExplain: true,
      supportsGroupBy: true,
      supportsCTE: true,
      supportsFullTextSearch: false,
      supportsGraphTraversal: false,
      supportsSchemaIntrospection: true,
      isReadOnly: true, // warehouses are used for analytics only
      queryLanguage: "sql",
      family: "warehouse",
    };

    // Warehouse-specific overrides
    if (this._vendor === "bigquery") {
      base.supportsNestedPaths = true; // BigQuery has STRUCT and ARRAY types
    }
    if (this._vendor === "clickhouse") {
      base.supportsWindowFunctions = true;
      base.supportsCTE = true;
    }

    return base;
  }

  // ─── Schema introspection ────────────────────────────────────────────────────

  async introspectSchema() {
    // Each warehouse uses information_schema but with different table names
    return this._withConnection(async (client) => {
      const rows = await this._fetchInformationSchema(client);
      return { vendor: this._vendor, objects: this._groupToObjects(rows) };
    });
  }

  async _fetchInformationSchema(client) {
    // All major warehouses expose INFORMATION_SCHEMA.COLUMNS
    // The exact database/schema qualifier differs
    const sql = this._buildSchemaQuery();
    const rows = await this._runQuery(client, sql, []);
    return rows.rows || rows;
  }

  _buildSchemaQuery() {
    switch (this._vendor) {
      case "bigquery":
        // BigQuery: project.dataset.INFORMATION_SCHEMA.COLUMNS
        return `
          SELECT table_schema, table_name, column_name, data_type,
                 is_nullable = 'YES' AS is_nullable
          FROM \`${this._config.project || "your_project"}.${
          this._config.dataset || "your_dataset"
        }.INFORMATION_SCHEMA.COLUMNS\`
          ORDER BY table_name, ordinal_position
          LIMIT 5000`;

      case "snowflake":
        return `
          SELECT table_schema, table_name, column_name, data_type,
                 is_nullable = 'YES' AS is_nullable
          FROM information_schema.columns
          WHERE table_schema = '${this._config.schema || "PUBLIC"}'
          ORDER BY table_name, ordinal_position
          LIMIT 5000`;

      case "redshift":
        // Redshift is PostgreSQL-compatible
        return `
          SELECT table_schema, table_name, column_name, data_type,
                 is_nullable = 'YES' AS is_nullable
          FROM information_schema.columns
          WHERE table_schema NOT IN ('pg_catalog','information_schema','pg_internal')
          ORDER BY table_schema, table_name, ordinal_position
          LIMIT 5000`;

      case "clickhouse":
        return `
          SELECT database AS table_schema, table AS table_name,
                 name AS column_name, type AS data_type, 0 AS is_nullable
          FROM system.columns
          WHERE database NOT IN ('system','information_schema','INFORMATION_SCHEMA')
          ORDER BY table, position
          LIMIT 5000`;

      default:
        throw new Error(`Schema query not implemented for ${this._vendor}`);
    }
  }

  _groupToObjects(rows) {
    const map = new Map();
    for (const row of rows) {
      const key = row.table_schema
        ? `${row.table_schema}.${row.table_name}`
        : row.table_name;
      if (!map.has(key)) {
        map.set(key, {
          name: key,
          type: "table",
          fields: [],
          primary_keys: [],
          estimated_rows: null,
        });
      }
      map.get(key).fields.push({
        name: row.column_name,
        type: row.data_type || "string",
        nullable: Boolean(row.is_nullable),
        is_primary_key: false, // warehouses often lack explicit PKs
        is_foreign_key: false,
      });
    }
    return [...map.values()];
  }

  // ─── Profiling ───────────────────────────────────────────────────────────────

  async profileObjects(objects, options = {}) {
    return this._withConnection(async (client) => {
      const result = {};
      for (const obj of objects.slice(0, 20)) {
        // limit profiles in warehouses
        try {
          const sql = `SELECT * FROM ${this._quoteName(obj.name)} LIMIT 12`;
          const data = await this._runQuery(client, sql, []);
          const fieldSamples = {};
          for (const row of data.rows || data) {
            for (const [k, v] of Object.entries(row || {})) {
              if (!fieldSamples[k]) fieldSamples[k] = [];
              if (v !== null && fieldSamples[k].length < 5) {
                fieldSamples[k].push(v instanceof Date ? v.toISOString() : v);
              }
            }
          }
          result[obj.name] = { samples: fieldSamples, topValues: {} };
        } catch {
          result[obj.name] = { samples: {}, topValues: {} };
        }
      }
      return result;
    });
  }

  // ─── Plan execution ──────────────────────────────────────────────────────────

  async executePlan(physicalPlan) {
    // Warehouses use SQL — the SQLCompiler already produced the SQL
    this._assertReadOnly(physicalPlan.sql || "");
    return this._withConnection(async (client) => {
      const data = await this._runQuery(
        client,
        physicalPlan.sql,
        physicalPlan.params || []
      );
      const rows = data.rows || (Array.isArray(data) ? data : []);
      return { rows: rows.slice(0, MAX_RESULT_ROWS), rowCount: rows.length };
    });
  }

  _assertReadOnly(sql) {
    const low = String(sql || "")
      .trim()
      .toLowerCase();
    if (!low.startsWith("select") && !low.startsWith("with")) {
      throw new Error(
        "Warehouse adapter is read-only. Only SELECT queries are allowed."
      );
    }
  }

  // ─── Connection management ────────────────────────────────────────────────────

  async _withConnection(fn) {
    const client = await this._connect();
    try {
      return await fn(client);
    } finally {
      await this._disconnect(client).catch(() => {});
    }
  }

  async _connect() {
    switch (this._vendor) {
      case "bigquery": {
        // const { BigQuery } = require("@google-cloud/bigquery");
        // return new BigQuery({ projectId: this._config.project, keyFilename: this._config.keyFile });
        throw new Error(
          "BigQuery: install @google-cloud/bigquery and uncomment the connection code in WarehouseAdapter._connect()"
        );
      }

      case "snowflake": {
        // const snowflake = require("snowflake-sdk");
        // const conn = await new Promise((resolve, reject) => {
        //   const c = snowflake.createConnection({ account: this._config.account, username: this._config.username, password: this._config.password, database: this._config.database, schema: this._config.schema });
        //   c.connect((err, conn) => err ? reject(err) : resolve(conn));
        // });
        // return conn;
        throw new Error(
          "Snowflake: install snowflake-sdk and uncomment the connection code in WarehouseAdapter._connect()"
        );
      }

      case "redshift": {
        // Redshift is PostgreSQL-compatible — use the pg library
        // const { Client } = require("pg");
        // const client = new Client({ connectionString: this._config.connectionString, ssl: { rejectUnauthorized: false } });
        // await client.connect();
        // return client;
        throw new Error(
          "Redshift: install pg and uncomment the connection code in WarehouseAdapter._connect()"
        );
      }

      case "clickhouse": {
        // const { createClient } = require("@clickhouse/client");
        // return createClient({ host: this._config.host, username: this._config.username, password: this._config.password, database: this._config.database });
        throw new Error(
          "ClickHouse: install @clickhouse/client and uncomment the connection code in WarehouseAdapter._connect()"
        );
      }

      default:
        throw new Error(
          `No connection method for warehouse vendor: ${this._vendor}`
        );
    }
  }

  async _disconnect(client) {
    if (!client) return;
    if (typeof client.destroy === "function") await client.destroy();
    else if (typeof client.end === "function") await client.end();
    else if (typeof client.close === "function") await client.close();
  }

  async _runQuery(client, sql, params) {
    // Each warehouse has a different query method — implement after _connect()
    throw new Error(
      "_runQuery must be implemented after connecting the client library."
    );
  }

  _quoteName(name = "") {
    const parts = name.split(".");
    const q = (p) => {
      if (this._vendor === "bigquery") return `\`${p}\``;
      return `"${p}"`;
    };
    return parts.map(q).join(".");
  }
}

module.exports = { WarehouseAdapter, WAREHOUSE_VENDORS };
