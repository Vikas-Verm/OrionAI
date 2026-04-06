"use strict";

/**
 * RawQueryValidator.js + RawQueryExecutor.js
 *
 * Completely separate from the natural-language pipeline.
 * Raw queries are validated for safety then executed directly.
 */

// ─── RawQueryValidator ────────────────────────────────────────────────────────

class RawQueryValidator {
  /**
   * @param {string} vendor
   */
  constructor(vendor) {
    this._vendor = vendor;
  }

  /**
   * Validate a raw query input.
   * @param {{ query: string, collection?: string }} input
   * @returns {{ valid: boolean, errors: string[] }}
   */
  validate(input) {
    const errors = [];
    const query = String(input.query || "").trim();

    if (!query) {
      errors.push("Query is required.");
      return { valid: false, errors };
    }

    if (this._vendor === "mongodb") {
      return this._validateMongo(query, input.collection);
    }

    return this._validateSql(query);
  }

  _validateSql(sql) {
    const errors = [];
    const low = sql
      .trim()
      .toLowerCase()
      .replace(/;+\s*$/, "");

    if (sql.includes(";")) {
      errors.push("Multiple SQL statements are not allowed.");
    }
    if (!/^select\b|^with\b/.test(low)) {
      errors.push(
        "Only SELECT queries are allowed in Data Mode. Use the Table Browser to modify data."
      );
    }
    if (
      /\b(insert|update|delete|drop|alter|truncate|create|grant|revoke|replace)\b/.test(
        low
      )
    ) {
      errors.push("Write operations are not allowed in Data Mode.");
    }

    return { valid: errors.length === 0, errors };
  }

  _validateMongo(query, collection) {
    const errors = [];

    if (!collection) {
      errors.push("Collection name is required for MongoDB raw queries.");
    }

    try {
      const parsed = JSON.parse(query);
      if (typeof parsed !== "object" && !Array.isArray(parsed)) {
        errors.push(
          "MongoDB query must be a JSON object or aggregation pipeline array."
        );
      }
    } catch {
      errors.push("MongoDB query must be valid JSON.");
    }

    return { valid: errors.length === 0, errors };
  }
}

// ─── RawQueryExecutor ─────────────────────────────────────────────────────────

class RawQueryExecutor {
  /**
   * @param {BaseAdapter} adapter
   */
  constructor(adapter) {
    this._adapter = adapter;
  }

  /**
   * Execute a validated raw query.
   * @param {{ query: string, collection?: string }} input
   * @returns {Promise<{ rows, rowCount, executedQuery }>}
   */
  async execute(input) {
    const vendor = this._adapter._vendor || this._adapter._config?.vendor;

    if (vendor === "mongodb") {
      return this._executeMongo(input);
    }
    return this._executeSql(input);
  }

  async _executeSql(input) {
    return this._adapter.executePlan({
      kind: "sql",
      sql: input.query,
      params: [],
    });
  }

  async _executeMongo(input) {
    const collection = String(input.collection || "").trim();
    let parsed;
    try {
      parsed = JSON.parse(input.query);
    } catch {
      throw new Error("MongoDB raw query must be valid JSON.");
    }

    if (Array.isArray(parsed)) {
      // Aggregation pipeline
      return this._adapter.executePlan({
        kind: "mongo",
        operation: "aggregate",
        collection,
        pipeline: parsed,
        limit: 200,
      });
    }

    // find query object
    const query =
      parsed.query && typeof parsed.query === "object" ? parsed.query : parsed;
    const projection =
      parsed.projection && typeof parsed.projection === "object"
        ? parsed.projection
        : undefined;
    const sort =
      parsed.sort && typeof parsed.sort === "object" ? parsed.sort : undefined;
    const limit = Math.min(Number(parsed.limit) || 20, 200);

    return this._adapter.executePlan({
      kind: "mongo",
      operation: "find",
      collection,
      query,
      projection: projection || {},
      sort: sort || {},
      limit,
    });
  }
}

module.exports = { RawQueryValidator, RawQueryExecutor };
