"use strict";

/**
 * SearchAdapter.js
 *
 * Adapter family for search/index stores:
 *   Elasticsearch, OpenSearch
 *
 * ─── HOW TO ENABLE ────────────────────────────────────────────────────────────
 *
 *   npm install @elastic/elasticsearch          (Elasticsearch 8.x)
 *   npm install @opensearch-project/opensearch  (OpenSearch)
 *
 * ─── WHAT SEARCH STORES GIVE YOU ─────────────────────────────────────────────
 *
 *   - Full-text search across all fields simultaneously
 *   - Fuzzy matching and phonetic similarity
 *   - Aggregations (terms, histogram, date_histogram, avg, sum)
 *   - Geo-distance search
 *   - Vector similarity (kNN) in Elasticsearch 8+
 *   - Nested documents (different from MongoDB — explicit nested type)
 *
 * ─── WHAT SEARCH STORES DON'T GIVE YOU ──────────────────────────────────────
 *
 *   - SQL JOINs (no foreign key concept)
 *   - ACID transactions
 *   - Guaranteed row ordering without a sort field
 *
 * ─── QUERY LANGUAGE ──────────────────────────────────────────────────────────
 *
 * Elasticsearch uses its own JSON query DSL (not SQL).
 * A future ElasticsearchCompiler would translate LogicalPlan → ES Query DSL.
 *
 * Elasticsearch also supports SQL via X-Pack:
 *   POST /_sql  { "query": "SELECT * FROM index WHERE ..." }
 * This lets you reuse SQLCompiler if X-Pack is available.
 *
 * ─── MAPPING CONCEPTS ────────────────────────────────────────────────────────
 *
 *   ES Index     → "table/collection" in OrionAI schema
 *   ES Mapping   → "fields" in OrionAI schema
 *   ES Document  → "row" in OrionAI schema
 *   ES Shard     → no equivalent (transparent to OrionAI)
 */

const { BaseAdapter } = require("./baseAdapter");

const MAX_RESULT_ROWS = 200;

class SearchAdapter extends BaseAdapter {
  constructor(config) {
    super(config);
    if (!["elasticsearch", "opensearch"].includes(config.vendor)) {
      throw new Error(
        `SearchAdapter does not support vendor: ${config.vendor}`
      );
    }
  }

  // ─── Capabilities ────────────────────────────────────────────────────────────

  detectCapabilities() {
    return {
      supportsJoins: false, // no SQL joins; nested docs via nested queries
      supportsLookupJoin: false,
      supportsAggregation: true, // terms, histogram, stats aggregations
      supportsNestedPaths: true, // ES nested type + dot-path fields
      supportsWindowFunctions: false,
      supportsILIKE: false,
      supportsCaseInsensitiveLike: true, // match query is case-insensitive by default
      supportsExplain: true, // _explain API
      supportsGroupBy: true, // terms aggregation
      supportsCTE: false,
      supportsFullTextSearch: true, // first-class feature
      supportsGraphTraversal: false,
      supportsGeoSearch: true,
      supportsVectorSearch: this._vendor === "elasticsearch", // kNN in ES 8+
      supportsSchemaIntrospection: true, // via _mapping API
      isReadOnly: false,
      queryLanguage: "esquery", // custom — needs ElasticsearchCompiler
      family: "search",
    };
  }

  // ─── Schema introspection via _mapping API ────────────────────────────────────

  async introspectSchema() {
    return this._withClient(async (client) => {
      // GET /_mapping returns all index mappings
      const response = await client.indices.getMapping({ index: "*" });
      const indices = response.body || response;
      const objects = [];

      for (const [indexName, indexData] of Object.entries(indices)) {
        if (indexName.startsWith(".")) continue; // skip system indices

        const mappings = indexData.mappings || {};
        const fields = this._extractFields(mappings.properties || {});
        let estimatedRows = null;

        try {
          const countRes = await client.count({ index: indexName });
          estimatedRows = (countRes.body || countRes).count;
        } catch {}

        objects.push({
          name: indexName,
          type: "collection",
          fields,
          primary_keys: ["_id"],
          estimated_rows: estimatedRows,
        });
      }

      return { vendor: this._vendor, objects };
    });
  }

  _extractFields(properties = {}, prefix = "", depth = 0) {
    const fields = [];
    if (depth > 3) return fields;

    for (const [name, mapping] of Object.entries(properties)) {
      const fullName = prefix ? `${prefix}.${name}` : name;
      const esType =
        mapping.type || (mapping.properties ? "object" : "keyword");

      fields.push({
        name: fullName,
        type: esType,
        nullable: true,
        is_primary_key: fullName === "_id",
        is_foreign_key: false,
        nested_paths: [],
      });

      // Recurse into nested/object properties
      if (mapping.properties) {
        fields.push(
          ...this._extractFields(mapping.properties, fullName, depth + 1)
        );
      }
    }

    return fields;
  }

  // ─── Profiling ────────────────────────────────────────────────────────────────

  async profileObjects(objects, options = {}) {
    return this._withClient(async (client) => {
      const result = {};

      for (const obj of objects) {
        try {
          const searchResult = await client.search({
            index: obj.name,
            body: {
              query: { match_all: {} },
              size: 12,
              sort: [{ _id: "desc" }],
            },
          });
          const hits = (searchResult.body || searchResult).hits?.hits || [];
          const samples = {};
          for (const hit of hits) {
            for (const [k, v] of Object.entries(hit._source || {})) {
              if (!samples[k]) samples[k] = [];
              if (samples[k].length < 5) samples[k].push(v);
            }
          }
          result[obj.name] = { samples, topValues: {} };
        } catch {
          result[obj.name] = { samples: {}, topValues: {} };
        }
      }

      return result;
    });
  }

  // ─── Plan execution ──────────────────────────────────────────────────────────

  async executePlan(physicalPlan) {
    // physicalPlan.kind === "esquery" — produced by a future ElasticsearchCompiler
    // For now, accept a raw ES query body in physicalPlan.body
    return this._withClient(async (client) => {
      if (physicalPlan.kind === "sql" && physicalPlan.sql) {
        // If X-Pack SQL is available
        const result = await client.sql.query({
          body: { query: physicalPlan.sql },
        });
        const body = result.body || result;
        const rows = (body.rows || []).map((row) => {
          const obj = {};
          (body.columns || []).forEach((col, i) => {
            obj[col.name] = row[i];
          });
          return obj;
        });
        return { rows: rows.slice(0, MAX_RESULT_ROWS), rowCount: rows.length };
      }

      // Native ES query DSL
      const body = physicalPlan.body || { query: { match_all: {} } };
      const index =
        physicalPlan.collection || physicalPlan.index || physicalPlan.target;
      const result = await client.search({
        index,
        body,
        size: physicalPlan.limit || 20,
      });
      const data = result.body || result;
      const hits = (data.hits?.hits || []).map((h) => ({
        _id: h._id,
        ...h._source,
      }));
      return {
        rows: hits.slice(0, MAX_RESULT_ROWS),
        rowCount: data.hits?.total?.value || hits.length,
      };
    });
  }

  // ─── Connection ───────────────────────────────────────────────────────────────

  async _withClient(fn) {
    const client = await this._connect();
    try {
      return await fn(client);
    } finally {
      await client.close?.().catch(() => {});
    }
  }

  async _connect() {
    const url =
      this._config.connectionString ||
      `http://${this._config.host || "localhost"}:9200`;

    if (this._vendor === "elasticsearch") {
      // const { Client } = require("@elastic/elasticsearch");
      // return new Client({ node: url, auth: this._config.auth });
      throw new Error(
        "Elasticsearch: install @elastic/elasticsearch and uncomment SearchAdapter._connect()"
      );
    }

    if (this._vendor === "opensearch") {
      // const { Client } = require("@opensearch-project/opensearch");
      // return new Client({ node: url, auth: this._config.auth });
      throw new Error(
        "OpenSearch: install @opensearch-project/opensearch and uncomment SearchAdapter._connect()"
      );
    }

    throw new Error(`Unknown search vendor: ${this._vendor}`);
  }
}

module.exports = { SearchAdapter };
