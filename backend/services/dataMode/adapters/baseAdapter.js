"use strict";

/**
 * BaseAdapter.js
 *
 * Abstract base class defining the contract every database adapter must implement.
 *
 * HOW TO ADD A NEW DATABASE:
 * ─────────────────────────
 * 1. Create `adapters/YourAdapter.js` extending BaseAdapter
 * 2. Implement the 4 required methods:
 *      detectCapabilities() → capabilities object
 *      introspectSchema()   → { vendor, objects[] }
 *      profileObjects()     → { [objectName]: { samples, topValues } }
 *      executePlan()        → { rows, rowCount }
 * 3. Register in AdapterFactory.js
 * 4. Add a compiler if your query language is not SQL or MongoDB
 * 5. Add golden test cases
 *
 * Nothing else needs to change. The entire semantic pipeline
 * (parser → grounding → planning → verification → answering)
 * works unchanged for any adapter that implements this interface.
 */

class BaseAdapter {
  constructor(config) {
    if (new.target === BaseAdapter) {
      throw new Error(
        "BaseAdapter is abstract — extend it, do not instantiate it directly."
      );
    }
    this._config = config;
    this._vendor = config.vendor;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // REQUIRED — must be implemented by every adapter
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Return a capability manifest describing what this database supports.
   *
   * The LogicalPlanner and Compilers read these flags to decide what
   * query constructs to use. Be honest — false negatives cause wrong queries.
   *
   * @returns {CapabilityManifest}
   */
  detectCapabilities() {
    throw new Error(
      `${this.constructor.name} must implement detectCapabilities()`
    );
  }

  /**
   * Introspect the database schema.
   * Return ALL tables/collections/indices accessible with the given credentials.
   *
   * @returns {Promise<{ vendor: string, objects: SchemaObject[] }>}
   *
   * SchemaObject shape:
   * {
   *   name:          string,           // "public.orders" or "Orders"
   *   type:          string,           // "table" | "collection" | "view" | "index"
   *   fields: [{
   *     name:          string,
   *     type:          string,         // native type string
   *     is_primary_key: boolean,
   *     is_foreign_key: boolean,
   *     references:    { object, field } | null,
   *     nullable:      boolean,
   *     nested_paths:  string[],       // MongoDB only — dot-path nested fields
   *   }],
   *   primary_keys:  string[],
   *   estimated_rows: number | null,
   * }
   */
  async introspectSchema() {
    throw new Error(
      `${this.constructor.name} must implement introspectSchema()`
    );
  }

  /**
   * Profile a set of schema objects — collect sample values, top values,
   * distinct counts, null ratios etc.
   *
   * This is called by SemanticCatalogBuilder to enrich field semantics.
   * Only sample a small number of rows per object (12 is enough).
   * Prioritise RECENT rows (sort by primary key desc).
   * Do NOT fetch full table scans.
   *
   * @param {SchemaObject[]} objects   Objects to profile
   * @param {Object}         options
   * @returns {Promise<{ [objectName]: ProfileResult }>}
   *
   * ProfileResult shape:
   * {
   *   samples:      { [fieldName]: any[] },   // up to 5 sample values per field
   *   topValues:    { [fieldName]: any[] },   // most frequent values (optional)
   *   nullRatios:   { [fieldName]: number },  // 0–1 (optional)
   *   distinctCounts: { [fieldName]: number }, // approximate (optional)
   * }
   */
  async profileObjects(objects, options = {}) {
    throw new Error(`${this.constructor.name} must implement profileObjects()`);
  }

  /**
   * Execute a compiled physical plan and return rows.
   *
   * The physical plan is produced by a Compiler (MongoCompiler or SQLCompiler).
   * It will be one of:
   *   - { kind: "mongo", operation, collection, query, sort, projection, limit, pipeline }
   *   - { kind: "sql",   target, sql, params }
   *   - { kind: "custom", ... }  (for custom query languages)
   *
   * This method MUST:
   *   - Enforce read-only (reject if the plan would modify data)
   *   - Cap results at MAX_RESULT_ROWS (200)
   *   - Return { rows, rowCount }
   *
   * @param {Object} physicalPlan
   * @returns {Promise<{ rows: Object[], rowCount: number }>}
   */
  async executePlan(physicalPlan) {
    throw new Error(`${this.constructor.name} must implement executePlan()`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // OPTIONAL — override to add capability
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Explain a plan (for the verifier's execution probe).
   * Return a string describing the query plan, or null if not supported.
   *
   * @param {Object} physicalPlan
   * @returns {Promise<string|null>}
   */
  async explainPlan(physicalPlan) {
    return null; // default: not supported
  }

  /**
   * Validate a raw query string before execution.
   * Return { valid, errors }.
   *
   * @param {string} rawQuery
   * @param {Object} options
   * @returns {{ valid: boolean, errors: string[] }}
   */
  validateRawQuery(rawQuery, options = {}) {
    return { valid: true, errors: [] }; // default: pass through
  }

  /**
   * Return the vendor string for this adapter.
   */
  get vendor() {
    return this._vendor;
  }

  /**
   * Return the config this adapter was created with.
   */
  get config() {
    return this._config;
  }
}

// ─── Capability manifest shape (for documentation) ────────────────────────────

/**
 * @typedef {Object} CapabilityManifest
 *
 * @property {boolean} supportsJoins             SQL JOIN / $lookup between objects
 * @property {boolean} supportsLookupJoin        MongoDB $lookup specifically
 * @property {boolean} supportsAggregation       GROUP BY / $group
 * @property {boolean} supportsNestedPaths       MongoDB dot-path nested fields
 * @property {boolean} supportsWindowFunctions   SQL OVER() / PARTITION BY
 * @property {boolean} supportsILIKE             PostgreSQL ILIKE case-insensitive
 * @property {boolean} supportsCaseInsensitiveLike  Any case-insensitive string match
 * @property {boolean} supportsExplain           Query execution plan introspection
 * @property {boolean} supportsGroupBy           GROUP BY aggregation
 * @property {boolean} supportsCTE               WITH ... AS (common table expressions)
 * @property {boolean} supportsFullTextSearch    FTS index queries
 * @property {boolean} supportsGraphTraversal    Graph path queries (Neo4j, etc.)
 * @property {boolean} supportsGeoSearch         Geospatial queries
 * @property {boolean} supportsVectorSearch      Vector similarity search
 * @property {boolean} supportsSchemaIntrospection  Can read column/field definitions
 * @property {boolean} isReadOnly                Adapter is always read-only (e.g. analytics)
 * @property {string}  queryLanguage             "mongodb" | "sql" | "cypher" | "esquery" | "custom"
 * @property {string}  family                    "document" | "relational" | "warehouse" | "search" | "graph" | "kv"
 */

module.exports = { BaseAdapter };
