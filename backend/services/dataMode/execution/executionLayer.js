"use strict";

/**
 * ExecutionLayer.js
 *
 * Executes only verified physical plans through the adapter.
 * Collects rows, rowCount, timing, and executed query string.
 */
class ExecutionLayer {
  /**
   * @param {BaseAdapter} adapter
   */
  constructor(adapter) {
    this._adapter = adapter;
  }

  /**
   * Execute a compiled physical plan.
   *
   * @param {Object} physicalPlan   Output of MongoCompiler or SQLCompiler
   * @returns {Promise<{ rows, rowCount, executedQuery, executionMs }>}
   */
  async execute(physicalPlan) {
    const startedAt = Date.now();

    const result = await this._adapter.executePlan(physicalPlan);

    const executedQuery =
      physicalPlan.kind === "mongo"
        ? _describeMongoPlan(physicalPlan)
        : physicalPlan.sql || "";

    return {
      rows: result.rows || [],
      rowCount: result.rowCount ?? 0,
      executedQuery,
      executionMs: Date.now() - startedAt,
    };
  }
}

function _describeMongoPlan(plan) {
  if (plan.operation === "aggregate") {
    return `${plan.collection}.aggregate(${JSON.stringify(
      plan.pipeline || []
    )})`;
  }
  if (plan.operation === "count") {
    return `${plan.collection}.countDocuments(${JSON.stringify(
      plan.query || {}
    )})`;
  }
  const opts = {};
  if (plan.sort && Object.keys(plan.sort).length) opts.sort = plan.sort;
  if (plan.limit) opts.limit = plan.limit;
  return `${plan.collection}.find(${JSON.stringify(plan.query || {})}${
    Object.keys(opts).length ? `, ${JSON.stringify(opts)}` : ""
  })`;
}

module.exports = { ExecutionLayer };
