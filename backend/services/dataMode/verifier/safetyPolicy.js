"use strict";

/**
 * safetyPolicy.js
 *
 * Hard-coded safety rules that cannot be overridden by any flag.
 * Data Mode is always read-only. These rules are enforced at
 * multiple layers: verification, compilation, and execution.
 */

const MAX_RESULT_ROWS = 200;
const MAX_PIPELINE_DEPTH = 20; // MongoDB aggregate stages
const MAX_JOINS = 3; // prevent runaway cross-collection queries
const MAX_FILTER_COUNT = 10;

const FORBIDDEN_SQL_KEYWORDS =
  /\b(insert|update|delete|drop|alter|truncate|create|grant|revoke|replace|exec|execute|call|merge|upsert)\b/i;
const MULTI_STATEMENT_RE = /;(?!\s*$)/;

/**
 * Check a logical plan against safety policy.
 * Returns { safe: boolean, violations: string[] }
 */
function checkLogicalPlan(plan) {
  const violations = [];

  if (plan.limit && plan.limit > MAX_RESULT_ROWS) {
    violations.push(`Limit ${plan.limit} exceeds maximum ${MAX_RESULT_ROWS}`);
  }

  if ((plan.joins || []).length > MAX_JOINS) {
    violations.push(`${plan.joins.length} joins exceeds maximum ${MAX_JOINS}`);
  }

  if ((plan.filters || []).length > MAX_FILTER_COUNT) {
    violations.push(
      `${plan.filters.length} filters exceeds maximum ${MAX_FILTER_COUNT}`
    );
  }

  return { safe: violations.length === 0, violations };
}

/**
 * Check a compiled SQL string against safety policy.
 * Hard reject — throws on violation.
 */
function assertSqlSafe(sql) {
  const s = String(sql || "").trim();

  if (!s) {
    throw new Error("Generated SQL is empty.");
  }

  if (MULTI_STATEMENT_RE.test(s)) {
    throw new Error("Multiple SQL statements are not allowed.");
  }

  const low = s.toLowerCase().replace(/;+\s*$/, "");
  if (!/^select\b|^with\b/.test(low)) {
    throw new Error("Only SELECT queries are allowed in Data Mode.");
  }

  if (FORBIDDEN_SQL_KEYWORDS.test(low)) {
    throw new Error(`SQL contains forbidden keyword. Data Mode is read-only.`);
  }
}

/**
 * Check a compiled MongoDB plan against safety policy.
 * Hard reject — throws on violation.
 */
function assertMongoPlanSafe(plan) {
  const op = String(plan.operation || "").toLowerCase();

  if (!["find", "aggregate", "count"].includes(op)) {
    throw new Error(
      `MongoDB operation "${op}" is not allowed. Only find/aggregate/count are permitted.`
    );
  }

  if (op === "aggregate") {
    const stages = Array.isArray(plan.pipeline) ? plan.pipeline : [];
    if (stages.length > MAX_PIPELINE_DEPTH) {
      throw new Error(
        `Aggregate pipeline has ${stages.length} stages (max ${MAX_PIPELINE_DEPTH})`
      );
    }

    // No write stages allowed
    const writeStages = ["$out", "$merge", "$indexStats"];
    for (const stage of stages) {
      for (const key of Object.keys(stage || {})) {
        if (writeStages.includes(key)) {
          throw new Error(
            `Aggregate stage "${key}" is not allowed. Data Mode is read-only.`
          );
        }
      }
    }
  }
}

/**
 * Enforce safe limit — cap at MAX_RESULT_ROWS if not already capped.
 */
function enforceLimit(limit) {
  if (!limit) return MAX_RESULT_ROWS;
  return Math.min(
    Math.max(1, Number(limit) || MAX_RESULT_ROWS),
    MAX_RESULT_ROWS
  );
}

module.exports = {
  MAX_RESULT_ROWS,
  MAX_PIPELINE_DEPTH,
  MAX_JOINS,
  checkLogicalPlan,
  assertSqlSafe,
  assertMongoPlanSafe,
  enforceLimit,
};
