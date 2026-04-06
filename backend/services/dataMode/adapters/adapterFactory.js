"use strict";

/**
 * AdapterFactory.js
 *
 * Central registry that maps vendor strings to adapter instances.
 *
 * ─── HOW TO ADD A NEW DATABASE ────────────────────────────────────────────────
 *
 * STEP 1 — Create your adapter file:
 *
 *   If it's a new family:    create adapters/YourAdapter.js (extend BaseAdapter)
 *   If it fits an existing:  add a case to the right existing adapter
 *
 * STEP 2 — Add the case here in createAdapter():
 *
 *   case "yourdb":
 *     return new YourAdapter(config);
 *
 * STEP 3 — If your query language is not SQL or MongoDB, create a compiler:
 *
 *   compiler/CypherCompiler.js   (for Neo4j)
 *   compiler/ESQueryCompiler.js  (for Elasticsearch)
 *   compiler/CQLCompiler.js      (for Cassandra)
 *
 * STEP 4 — Wire the compiler in DataModeOrchestrator._compile():
 *
 *   if (vendor === "neo4j") return new CypherCompiler(capabilities).compile(plan);
 *
 * STEP 5 — Add test cases in tests/golden/golden.test.js
 *
 * That's it. The entire semantic pipeline (parser → grounding → planning →
 * verification → answering) works unchanged for any adapter that implements
 * the BaseAdapter interface.
 *
 * ─── CURRENTLY SUPPORTED ────────────────────────────────────────────────────
 *
 *   READY NOW:
 *     mongodb    → MongoAdapter    (document family)
 *     postgres   → SQLAdapter      (relational family)
 *     mysql      → SQLAdapter      (relational family)
 *     sqlite     → SQLAdapter      (relational family)
 *
 *   SKELETON READY — needs client library + uncomment connection code:
 *     bigquery   → WarehouseAdapter  (warehouse family)
 *     snowflake  → WarehouseAdapter  (warehouse family)
 *     redshift   → WarehouseAdapter  (warehouse family)
 *     clickhouse → WarehouseAdapter  (warehouse family)
 *     elasticsearch → SearchAdapter  (search family)
 *     opensearch    → SearchAdapter  (search family)
 *     neo4j      → GraphAdapter    (graph family)
 *     dynamodb   → KVAdapter       (key-value family)
 *     cassandra  → KVAdapter       (key-value family)
 *     redis      → KVAdapter       (key-value family)
 *
 *   FUTURE (not started — create adapter + compiler):
 *     sqlserver  → SQLAdapter (add dialect) or new MSSQLAdapter
 *     oracle     → new OracleAdapter
 *     mariadb    → SQLAdapter (mysql-compatible)
 *     databricks → WarehouseAdapter
 *     neptune    → GraphAdapter
 *     arangodb   → GraphAdapter
 *     hbase      → KVAdapter
 */

const { MongoAdapter } = require("./mongoAdapter");
const { SQLAdapter } = require("./sqlAdapter");
const { WarehouseAdapter } = require("./wareHouseAdapter");
const { SearchAdapter } = require("./searchAdapter");
const { GraphAdapter } = require("./graphAdapter");
const { KVAdapter } = require("./kvAdapter");

const { getFlag } = require("../featureFlags");

/**
 * Create an adapter for the given database config.
 *
 * @param {Object} config   { vendor, connectionString, filePath, ssl, ... }
 * @returns {BaseAdapter}
 *
 * @throws {Error} If the vendor is not supported or the feature flag is off
 */
function createAdapter(config) {
  const vendor = String(config.vendor || "")
    .toLowerCase()
    .trim();

  switch (vendor) {
    // ── Relational family (fully implemented) ────────────────────────────────
    case "postgres":
    case "mysql":
    case "sqlite":
      return new SQLAdapter(config);

    // ── SQL-compatible additions (use SQLAdapter + dialect) ──────────────────
    case "mariadb":
      // MariaDB is MySQL-compatible — use MySQL adapter
      return new SQLAdapter({ ...config, vendor: "mysql" });

    case "redshift":
      // Redshift is PostgreSQL-compatible at the protocol level
      if (!getFlag("DATA_MODE_ENABLE_WAREHOUSE_FAMILY")) {
        throw new Error(
          `Redshift (warehouse family) is not enabled. Set DATA_MODE_ENABLE_WAREHOUSE_FAMILY=true`
        );
      }
      return new WarehouseAdapter(config);

    // ── Document family (fully implemented) ──────────────────────────────────
    case "mongodb":
      return new MongoAdapter(config);

    // ── Warehouse family (skeleton — needs client library) ───────────────────
    case "bigquery":
    case "snowflake":
    case "clickhouse":
    case "databricks":
      if (!getFlag("DATA_MODE_ENABLE_WAREHOUSE_FAMILY")) {
        throw new Error(
          `Warehouse databases (${vendor}) require DATA_MODE_ENABLE_WAREHOUSE_FAMILY=true. ` +
            `Install the client library and uncomment the connection code in WarehouseAdapter.js.`
        );
      }
      return new WarehouseAdapter(config);

    // ── Search family (skeleton — needs client library) ──────────────────────
    case "elasticsearch":
    case "opensearch":
      if (!getFlag("DATA_MODE_ENABLE_SEARCH_FAMILY")) {
        throw new Error(
          `Search databases (${vendor}) require DATA_MODE_ENABLE_SEARCH_FAMILY=true. ` +
            `Install the client library and uncomment the connection code in SearchAdapter.js.`
        );
      }
      return new SearchAdapter(config);

    // ── Graph family (skeleton — needs client library) ───────────────────────
    case "neo4j":
    case "neptune":
    case "arangodb":
      if (!getFlag("DATA_MODE_ENABLE_GRAPH_FAMILY")) {
        throw new Error(
          `Graph databases (${vendor}) require DATA_MODE_ENABLE_GRAPH_FAMILY=true. ` +
            `Install the client library and uncomment the connection code in GraphAdapter.js.`
        );
      }
      return new GraphAdapter(config);

    // ── Key-value family (skeleton — needs client library) ───────────────────
    case "redis":
    case "dynamodb":
    case "cassandra":
    case "hbase": {
      if (!getFlag("DATA_MODE_ENABLE_KV_FAMILY")) {
        throw new Error(
          `Key-value databases (${vendor}) require DATA_MODE_ENABLE_KV_FAMILY=true. ` +
            `Note: KV stores have limited query capabilities. ` +
            `Install the client library and uncomment the connection code in KVAdapter.js.`
        );
      }
      // Cassandra → KVAdapter (has CQL so more capable)
      if (vendor === "cassandra") return new KVAdapter(config);
      // Redis, DynamoDB → KVAdapter
      return new KVAdapter(config);
    }

    // ── Unknown ──────────────────────────────────────────────────────────────
    default:
      throw new Error(
        `Unsupported database vendor: "${vendor}". ` +
          `Supported vendors: mongodb, postgres, mysql, sqlite, mariadb, ` +
          `bigquery, snowflake, redshift, clickhouse, databricks (warehouse flag), ` +
          `elasticsearch, opensearch (search flag), ` +
          `neo4j (graph flag), ` +
          `redis, dynamodb, cassandra (kv flag).`
      );
  }
}

/**
 * List all vendors and their current status.
 * Useful for the Settings → Integrations page.
 */
function listSupportedVendors() {
  return [
    // Ready now
    {
      vendor: "mongodb",
      family: "document",
      status: "ready",
      displayName: "MongoDB",
    },
    {
      vendor: "postgres",
      family: "relational",
      status: "ready",
      displayName: "PostgreSQL",
    },
    {
      vendor: "mysql",
      family: "relational",
      status: "ready",
      displayName: "MySQL",
    },
    {
      vendor: "sqlite",
      family: "relational",
      status: "ready",
      displayName: "SQLite",
    },
    {
      vendor: "mariadb",
      family: "relational",
      status: "ready",
      displayName: "MariaDB",
    },
    // Warehouse (flag + library needed)
    {
      vendor: "bigquery",
      family: "warehouse",
      status: "skeleton",
      displayName: "BigQuery",
      flag: "DATA_MODE_ENABLE_WAREHOUSE_FAMILY",
      library: "@google-cloud/bigquery",
    },
    {
      vendor: "snowflake",
      family: "warehouse",
      status: "skeleton",
      displayName: "Snowflake",
      flag: "DATA_MODE_ENABLE_WAREHOUSE_FAMILY",
      library: "snowflake-sdk",
    },
    {
      vendor: "redshift",
      family: "warehouse",
      status: "skeleton",
      displayName: "Redshift",
      flag: "DATA_MODE_ENABLE_WAREHOUSE_FAMILY",
      library: "pg",
    },
    {
      vendor: "clickhouse",
      family: "warehouse",
      status: "skeleton",
      displayName: "ClickHouse",
      flag: "DATA_MODE_ENABLE_WAREHOUSE_FAMILY",
      library: "@clickhouse/client",
    },
    {
      vendor: "databricks",
      family: "warehouse",
      status: "skeleton",
      displayName: "Databricks",
      flag: "DATA_MODE_ENABLE_WAREHOUSE_FAMILY",
      library: "@databricks/sql",
    },
    // Search (flag + library needed)
    {
      vendor: "elasticsearch",
      family: "search",
      status: "skeleton",
      displayName: "Elasticsearch",
      flag: "DATA_MODE_ENABLE_SEARCH_FAMILY",
      library: "@elastic/elasticsearch",
    },
    {
      vendor: "opensearch",
      family: "search",
      status: "skeleton",
      displayName: "OpenSearch",
      flag: "DATA_MODE_ENABLE_SEARCH_FAMILY",
      library: "@opensearch-project/opensearch",
    },
    // Graph (flag + library needed)
    {
      vendor: "neo4j",
      family: "graph",
      status: "skeleton",
      displayName: "Neo4j",
      flag: "DATA_MODE_ENABLE_GRAPH_FAMILY",
      library: "neo4j-driver",
    },
    // KV (flag + library needed)
    {
      vendor: "redis",
      family: "kv",
      status: "skeleton",
      displayName: "Redis",
      flag: "DATA_MODE_ENABLE_KV_FAMILY",
      library: "ioredis",
    },
    {
      vendor: "dynamodb",
      family: "kv",
      status: "skeleton",
      displayName: "DynamoDB",
      flag: "DATA_MODE_ENABLE_KV_FAMILY",
      library: "@aws-sdk/client-dynamodb",
    },
    {
      vendor: "cassandra",
      family: "kv",
      status: "skeleton",
      displayName: "Cassandra",
      flag: "DATA_MODE_ENABLE_KV_FAMILY",
      library: "cassandra-driver",
    },
  ];
}

module.exports = { createAdapter, listSupportedVendors };
