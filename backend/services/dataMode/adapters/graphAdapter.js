"use strict";

/**
 * GraphAdapter.js
 *
 * Adapter for graph databases: Neo4j, Amazon Neptune, ArangoDB
 *
 * ─── HOW TO ENABLE NEO4J ─────────────────────────────────────────────────────
 *
 *   npm install neo4j-driver
 *
 * ─── WHAT GRAPH DATABASES GIVE YOU ──────────────────────────────────────────
 *
 *   - Relationship traversal: "who is connected to X via Y?"
 *   - Path queries: shortest path, all paths between nodes
 *   - Pattern matching across many hops efficiently
 *   - Node properties as fields
 *   - Relationship types as field-like role filters
 *
 * ─── HOW GRAPH CONCEPTS MAP TO ORIONAI SCHEMA ─────────────────────────────────
 *
 *   Neo4j concept    → OrionAI concept
 *   ───────────────────────────────────
 *   Node label       → collection/table name  (e.g. "User", "Invoice", "Seller")
 *   Node property    → field
 *   Relationship type → join / relation in RelationGraphBuilder
 *   (not used)       → primary key  (Neo4j uses internal IDs)
 *
 * ─── QUERY LANGUAGE ──────────────────────────────────────────────────────────
 *
 *   Neo4j uses Cypher. You would need a CypherCompiler to translate
 *   LogicalPlan → Cypher queries.
 *
 *   Example Cypher for "latest records associated with a related entity":
 *     MATCH (b:Bill)-[:SOLD_BY]->(s:Seller {name: "Dependent Why"})
 *     RETURN b ORDER BY b.created_at DESC LIMIT 1
 *
 *   The RelationGraphBuilder already infers relation structure.
 *   A CypherCompiler would use joins[] from LogicalPlan as MATCH patterns.
 */

const { BaseAdapter } = require("./baseAdapter");

const MAX_RESULT_ROWS = 200;

class GraphAdapter extends BaseAdapter {
  constructor(config) {
    super(config);
    if (!["neo4j", "neptune", "arangodb"].includes(config.vendor)) {
      throw new Error(`GraphAdapter does not support vendor: ${config.vendor}`);
    }
  }

  detectCapabilities() {
    return {
      supportsJoins: false, // no SQL joins — use relationship traversal
      supportsLookupJoin: false,
      supportsAggregation: true, // COUNT, SUM, AVG in Cypher
      supportsNestedPaths: false,
      supportsWindowFunctions: false,
      supportsILIKE: false,
      supportsCaseInsensitiveLike: true, // =~ regex in Cypher
      supportsExplain: true, // EXPLAIN / PROFILE in Neo4j
      supportsGroupBy: true, // WITH ... ORDER BY in Cypher
      supportsCTE: false,
      supportsFullTextSearch: false,
      supportsGraphTraversal: true, // first-class feature
      supportsGeoSearch: false,
      supportsVectorSearch: false,
      supportsSchemaIntrospection: true, // via CALL db.schema.nodeTypeProperties()
      isReadOnly: false,
      queryLanguage: "cypher",
      family: "graph",
    };
  }

  async introspectSchema() {
    return this._withDriver(async (session) => {
      // Get all node labels
      const labelsResult = await session.run("CALL db.labels()");
      const labels = labelsResult.records.map((r) => r.get("label"));
      const objects = [];

      for (const label of labels) {
        // Get property schema for this label
        const propResult = await session.run(
          `CALL db.schema.nodeTypeProperties() YIELD nodeLabels, propertyName, propertyTypes
           WHERE $label IN nodeLabels
           RETURN propertyName, propertyTypes`,
          { label }
        );
        const fields = propResult.records.map((r) => ({
          name: r.get("propertyName"),
          type: (r.get("propertyTypes") || ["String"])[0].toLowerCase(),
          nullable: true,
          is_primary_key: false, // Neo4j uses internal IDs
          is_foreign_key: false,
        }));

        // Add internal ID as a pseudo-field
        fields.unshift({
          name: "id",
          type: "integer",
          nullable: false,
          is_primary_key: true,
          is_foreign_key: false,
        });

        // Estimate count
        let estimatedRows = null;
        try {
          const countRes = await session.run(
            `MATCH (n:${label}) RETURN count(n) AS count`
          );
          estimatedRows = countRes.records[0]?.get("count").toNumber() || null;
        } catch {}

        objects.push({
          name: label,
          type: "collection",
          fields,
          primary_keys: ["id"],
          estimated_rows: estimatedRows,
        });
      }

      return { vendor: this._vendor, objects };
    });
  }

  async profileObjects(objects, options = {}) {
    return this._withDriver(async (session) => {
      const result = {};
      for (const obj of objects) {
        try {
          const res = await session.run(
            `MATCH (n:${obj.name}) RETURN n LIMIT 12`
          );
          const fieldSamples = {};
          for (const record of res.records) {
            const node = record.get("n");
            for (const [k, v] of Object.entries(node.properties || {})) {
              if (!fieldSamples[k]) fieldSamples[k] = [];
              if (fieldSamples[k].length < 5)
                fieldSamples[k].push(_safeValue(v));
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

  async executePlan(physicalPlan) {
    // physicalPlan.kind === "cypher" — produced by a future CypherCompiler
    if (physicalPlan.kind !== "cypher") {
      throw new Error(
        `GraphAdapter only executes Cypher plans. Got kind: ${physicalPlan.kind}`
      );
    }

    const cypher = String(physicalPlan.cypher || "").trim();
    if (!cypher) throw new Error("Cypher query is empty.");

    // Safety: only allow MATCH/RETURN queries
    if (!/^\s*MATCH\b|^\s*CALL\b|^\s*RETURN\b/i.test(cypher)) {
      throw new Error(
        "GraphAdapter is read-only. Only MATCH/RETURN Cypher is allowed."
      );
    }
    if (/\b(CREATE|MERGE|SET|DELETE|REMOVE|DROP)\b/i.test(cypher)) {
      throw new Error("Write operations are not allowed in Data Mode.");
    }

    return this._withDriver(async (session) => {
      const result = await session.run(cypher, physicalPlan.params || {});
      const rows = result.records.map((r) => {
        const obj = {};
        for (const key of r.keys) {
          const val = r.get(key);
          obj[key] = val?.properties ? { ...val.properties } : _safeValue(val);
        }
        return obj;
      });
      return { rows: rows.slice(0, MAX_RESULT_ROWS), rowCount: rows.length };
    });
  }

  async _withDriver(fn) {
    const { driver, session } = await this._connect();
    try {
      return await fn(session);
    } finally {
      await session.close().catch(() => {});
      await driver.close().catch(() => {});
    }
  }

  async _connect() {
    if (this._vendor === "neo4j") {
      // const neo4j = require("neo4j-driver");
      // const driver = neo4j.driver(
      //   this._config.uri || "bolt://localhost:7687",
      //   neo4j.auth.basic(this._config.username || "neo4j", this._config.password || "")
      // );
      // await driver.verifyConnectivity();
      // const session = driver.session({ database: this._config.database || "neo4j" });
      // return { driver, session };
      throw new Error(
        "Neo4j: install neo4j-driver and uncomment GraphAdapter._connect()"
      );
    }
    throw new Error(
      `Graph connection not implemented for vendor: ${this._vendor}`
    );
  }
}

function _safeValue(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === "object" && v !== null && typeof v.toNumber === "function")
    return v.toNumber();
  if (v instanceof Date) return v.toISOString();
  return v;
}

module.exports = { GraphAdapter };
