"use strict";

/**
 * OrionAI Data Mode Feature Flags
 *
 * All flags default to false — new behaviour must be explicitly enabled.
 * This lets old and new pipelines coexist safely during migration.
 *
 * In production, set via environment variables or a remote flag store.
 * In tests, override by calling `setFlag(name, value)`.
 */

const _defaults = {
  // Master switch: enable new semantic planning pipeline
  DATA_MODE_V2_ENABLED: true,

  // Enable semantic catalog for grounding
  DATA_MODE_USE_SEMANTIC_CATALOG: true,

  // Enable targeted evidence fetching (vs raw sample rows)
  DATA_MODE_USE_TARGETED_EVIDENCE: true,

  // Auto-detect and recover from schema drift
  DATA_MODE_ENABLE_DRIFT_RECOVERY: true,

  // Enable full logical planner
  DATA_MODE_ENABLE_LOGICAL_PLANNER: true,

  // Enable MongoDB $lookup compiler for relation-based queries
  DATA_MODE_ENABLE_MONGO_LOOKUP_COMPILER: true,

  // Run SQL verifier before execution (explain probe)
  DATA_MODE_ENABLE_SQL_VERIFIER: false, // requires DB access; enable after stability

  // Emit full internal trace to logs
  DATA_MODE_ENABLE_TRACE_LOGGING: false,

  // Future database families (off until client library is installed + connection code uncommented)
  DATA_MODE_ENABLE_WAREHOUSE_FAMILY: false, // BigQuery, Snowflake, Redshift, ClickHouse
  DATA_MODE_ENABLE_GRAPH_FAMILY: false, // Neo4j, Neptune, ArangoDB
  DATA_MODE_ENABLE_SEARCH_FAMILY: false, // Elasticsearch, OpenSearch
  DATA_MODE_ENABLE_KV_FAMILY: false, // Redis, DynamoDB, Cassandra

  // Emergency fallback: revert to old monolithic pipeline
  DATA_MODE_V1_FALLBACK: false,
};

// In-memory overrides (for tests + hot-reload)
const _overrides = {};

/**
 * Read a flag value.
 * Priority: environment variable > in-memory override > default
 */
function getFlag(name) {
  const envKey = name; // env var name matches flag name
  if (process.env[envKey] !== undefined) {
    return process.env[envKey] === "true" || process.env[envKey] === "1";
  }
  if (name in _overrides) {
    return _overrides[name];
  }
  if (name in _defaults) {
    return _defaults[name];
  }
  return false;
}

/**
 * Override a flag (for testing only).
 */
function setFlag(name, value) {
  _overrides[name] = Boolean(value);
}

/**
 * Reset all overrides (call between tests).
 */
function resetFlags() {
  Object.keys(_overrides).forEach((k) => delete _overrides[k]);
}

/**
 * Return a snapshot of all active flags.
 */
function getAllFlags() {
  const result = {};
  for (const name of Object.keys(_defaults)) {
    result[name] = getFlag(name);
  }
  return result;
}

module.exports = { getFlag, setFlag, resetFlags, getAllFlags };
