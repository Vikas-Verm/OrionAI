"use strict";

/**
 * planTransforms.js
 *
 * Transforms applied to a LogicalPlan before compilation.
 * Each transform is a pure function: plan → plan.
 * They are composable and independently testable.
 */

const { enforceLimit } = require("../verifier/safetyPolicy");

/**
 * Apply all standard transforms in order.
 * @param {Object} plan
 * @param {Object} capabilities
 * @returns {Object} transformed plan
 */
function applyTransforms(plan, capabilities = {}) {
  let p = plan;
  p = enforceResultLimit(p);
  p = normalizeIntentDefaults(p);
  p = collapseRedundantFilters(p);
  if (!capabilities.supportsJoins && !capabilities.supportsLookupJoin) {
    p = flattenJoins(p);
  }
  return p;
}

/**
 * Cap limit at MAX_RESULT_ROWS.
 */
function enforceResultLimit(plan) {
  return { ...plan, limit: enforceLimit(plan.limit) };
}

/**
 * Apply intent-specific defaults:
 * - count: remove sort + set limit to null
 * - latest: ensure limit = 1
 * - compare: remove sort (compare uses sub-pipelines)
 */
function normalizeIntentDefaults(plan) {
  const p = { ...plan };
  if (p.intent === "count") {
    p.sort = [];
    p.limit = null;
    if (!p.metrics?.length) {
      p.metrics = [{ function: "count", field: null, alias: "count" }];
    }
  }
  if (p.intent === "latest" && (!p.limit || p.limit > 1)) {
    p.limit = 1;
  }
  if (p.intent === "compare") {
    p.sort = [];
  }
  return p;
}

/**
 * Remove duplicate filters (same field + op + value).
 */
function collapseRedundantFilters(plan) {
  const seen = new Set();
  const filters = (plan.filters || []).filter((f) => {
    const key = `${f.logical || "and"}|${f.group || ""}|${f.field}|${f.op}|${JSON.stringify(
      f.value
    )}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { ...plan, filters };
}

/**
 * When joins are not supported, flatten join filters into the main filter list
 * using available inline fields (e.g. local display fields instead of joined fields).
 * This is a best-effort degradation; the filter field name stays as-is.
 */
function flattenJoins(plan) {
  if (!plan.joins?.length) return plan;
  // Move join-based filters to root (they may or may not work without the join)
  return {
    ...plan,
    joins: [],
    _degraded: true,
    _degradationReason: "joins_not_supported",
  };
}

module.exports = {
  applyTransforms,
  enforceResultLimit,
  normalizeIntentDefaults,
  collapseRedundantFilters,
};
