"use strict";

/**
 * KVAdapter.js
 *
 * Adapter family for key-value and wide-column stores:
 *   Redis, DynamoDB, Cassandra, HBase
 *
 * ─── IMPORTANT LIMITATION ────────────────────────────────────────────────────
 *
 * Key-value stores have severely limited query capabilities.
 * OrionAI Data Mode can only answer questions that these stores can answer
 * without full table scans. The capability manifest reflects this honestly.
 *
 * ─── REDIS ───────────────────────────────────────────────────────────────────
 *   npm install ioredis
 *   Redis has no schema — OrionAI discovers keys by pattern.
 *   Only supports: KEYS pattern, GET key, HGETALL key, LRANGE, ZRANGE.
 *   Questions like "how many X" → DBSIZE or pattern-count.
 *   Complex queries (WHERE x > y AND z = z) are NOT possible.
 *
 * ─── DYNAMODB ────────────────────────────────────────────────────────────────
 *   npm install @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb
 *   DynamoDB has tables with a partition key + optional sort key.
 *   Supports: exact PK lookup, range on sort key, basic filter expressions.
 *   Complex joins and aggregations require DynamoDB Streams or Athena.
 *
 * ─── CASSANDRA ───────────────────────────────────────────────────────────────
 *   npm install cassandra-driver
 *   Cassandra uses CQL (Cassandra Query Language) — similar to SQL.
 *   Supports: SELECT with partition key filter, LIMIT, ORDER BY (within partition).
 *   Does NOT support: joins, arbitrary WHERE without partition key.
 */

const { BaseAdapter } = require("./baseAdapter");

const MAX_RESULT_ROWS = 200;

class KVAdapter extends BaseAdapter {
  constructor(config) {
    super(config);
    if (!["redis", "dynamodb", "cassandra"].includes(config.vendor)) {
      throw new Error(`KVAdapter does not support vendor: ${config.vendor}`);
    }
  }

  detectCapabilities() {
    const base = {
      supportsJoins: false,
      supportsLookupJoin: false,
      supportsAggregation: false,
      supportsNestedPaths: false,
      supportsWindowFunctions: false,
      supportsILIKE: false,
      supportsCaseInsensitiveLike: false,
      supportsExplain: false,
      supportsGroupBy: false,
      supportsCTE: false,
      supportsFullTextSearch: false,
      supportsGraphTraversal: false,
      supportsSchemaIntrospection: false, // KV stores often have no schema
      isReadOnly: false,
      queryLanguage: "custom",
      family: "kv",
    };

    if (this._vendor === "cassandra") {
      // Cassandra is more capable — CQL supports basic SELECT
      base.supportsAggregation = true; // COUNT, SUM etc. within a partition
      base.supportsGroupBy = false; // limited
      base.queryLanguage = "cql";
      base.supportsSchemaIntrospection = true; // system_schema keyspace
    }

    if (this._vendor === "dynamodb") {
      base.queryLanguage = "dynamodb";
      base.supportsSchemaIntrospection = true; // ListTables + DescribeTable
    }

    return base;
  }

  // ─── Schema introspection ─────────────────────────────────────────────────────

  async introspectSchema() {
    if (this._vendor === "redis") {
      return this._introspectRedis();
    }
    if (this._vendor === "dynamodb") {
      return this._introspectDynamoDB();
    }
    if (this._vendor === "cassandra") {
      return this._introspectCassandra();
    }
    throw new Error(`Schema introspection not implemented for ${this._vendor}`);
  }

  async _introspectRedis() {
    // Redis has no schema. We scan for key patterns to discover "objects".
    // Users must provide key pattern hints in config:
    //   config.keyPatterns = ["user:*", "order:*", "invoice:*"]
    const patterns = this._config.keyPatterns || ["*"];
    const objects = patterns.map((pattern) => ({
      name: pattern.replace(":*", "").replace("*", "keys"),
      type: "collection",
      fields: [
        { name: "key", type: "string", is_primary_key: true },
        { name: "value", type: "string" },
      ],
      primary_keys: ["key"],
      estimated_rows: null,
    }));
    return { vendor: "redis", objects };
  }

  async _introspectDynamoDB() {
    // const { DynamoDBClient, ListTablesCommand, DescribeTableCommand } = require("@aws-sdk/client-dynamodb");
    // const client = new DynamoDBClient({ region: this._config.region, credentials: { ... } });
    // const { TableNames } = await client.send(new ListTablesCommand({}));
    // const objects = await Promise.all(TableNames.map(async (name) => {
    //   const { Table } = await client.send(new DescribeTableCommand({ TableName: name }));
    //   const fields = Table.AttributeDefinitions.map(a => ({
    //     name: a.AttributeName, type: a.AttributeType === "N" ? "number" : "string", is_primary_key: true
    //   }));
    //   return { name, type: "table", fields, primary_keys: [Table.KeySchema[0].AttributeName], estimated_rows: Table.ItemCount };
    // }));
    // return { vendor: "dynamodb", objects };
    throw new Error(
      "DynamoDB: install @aws-sdk/client-dynamodb and uncomment _introspectDynamoDB()"
    );
  }

  async _introspectCassandra() {
    // const cassandra = require("cassandra-driver");
    // const client = new cassandra.Client({ contactPoints: [this._config.host], localDataCenter: this._config.dataCenter });
    // await client.connect();
    // const result = await client.execute("SELECT table_name, column_name, type FROM system_schema.columns WHERE keyspace_name = ?", [this._config.keyspace]);
    // ... group rows into objects ...
    // await client.shutdown();
    throw new Error(
      "Cassandra: install cassandra-driver and uncomment _introspectCassandra()"
    );
  }

  // ─── Profiling ────────────────────────────────────────────────────────────────

  async profileObjects(objects, options = {}) {
    // KV stores have very limited profiling capability
    return Object.fromEntries(
      objects.map((o) => [o.name, { samples: {}, topValues: {} }])
    );
  }

  // ─── Plan execution ───────────────────────────────────────────────────────────

  async executePlan(physicalPlan) {
    if (this._vendor === "cassandra" && physicalPlan.kind === "sql") {
      return this._executeCQL(physicalPlan);
    }
    if (this._vendor === "redis") {
      return this._executeRedis(physicalPlan);
    }
    if (this._vendor === "dynamodb") {
      return this._executeDynamoDB(physicalPlan);
    }
    throw new Error(`executePlan not implemented for ${this._vendor}`);
  }

  async _executeCQL(plan) {
    // Cassandra CQL is similar to SQL — same plan shape as SQL
    // const cassandra = require("cassandra-driver");
    // const client = new cassandra.Client({ ... });
    // const result = await client.execute(plan.sql, plan.params, { prepare: true });
    // return { rows: result.rows.slice(0, MAX_RESULT_ROWS), rowCount: result.rows.length };
    throw new Error(
      "Cassandra CQL execution: uncomment _executeCQL() after installing cassandra-driver"
    );
  }

  async _executeRedis(plan) {
    // Redis execution is very limited — only key lookups and scans
    throw new Error(
      "Redis execution not yet implemented. Redis Data Mode supports key-pattern browsing only."
    );
  }

  async _executeDynamoDB(plan) {
    throw new Error(
      "DynamoDB execution: uncomment _executeDynamoDB() after installing @aws-sdk/client-dynamodb"
    );
  }
}

module.exports = { KVAdapter };
