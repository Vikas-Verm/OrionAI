"use strict";

/**
 * LogicalPlanner
 *
 * Converts a GroundedPlan into a vendor-neutral LogicalPlan.
 * Handles: filters, joins, aggregations, time windows, compare windows.
 * Zero LLM involvement.
 */

class LogicalPlanner {
  /**
   * @param {Object} capabilities  Adapter capability manifest
   */
  constructor(capabilities = {}) {
    this._cap = capabilities;
  }

  /**
   * Build logical plan from grounded plan.
   *
   * @param {Object} groundedPlan
   * @returns {Object} logicalPlan
   */
  build(groundedPlan) {
    const {
      target_object,
      vendor,
      intent,
      filters,
      joins,
      temporal_field,
      time_range,
      sort_field,
      metrics,
      group_by,
      limit,
      projection,
      compare_windows,
      confidence,
    } = groundedPlan;

    const plan = {
      source: target_object,
      intent,
      joins: [],
      filters: [],
      group_by: [],
      metrics: [],
      having: [],
      sort: [],
      projection,
      limit: limit ?? _defaultLimit(intent),
      time_range: null,
      compare_windows: [],
      confidence,
      explanation: "",
    };

    // ── Joins ─────────────────────────────────────────────────────────────
    for (const j of joins || []) {
      if (!this._cap.supportsJoins && !this._cap.supportsLookupJoin) continue;
      plan.joins.push({
        to: j.to_object,
        type: j.join_type || "left",
        on: [
          [
            `${j.from_object}.${j.from_field}`,
            "=",
            `${j.to_object}.${j.to_field}`,
          ],
        ],
        alias: j.join_alias || null,
      });
    }

    // ── Filters ───────────────────────────────────────────────────────────
    for (const [index, f] of (filters || []).entries()) {
      if (Array.isArray(f.alternatives) && f.alternatives.length) {
        const group = `or_${index}`;
        for (const alternative of f.alternatives) {
          plan.filters.push({
            field:
              alternative.object && alternative.object !== target_object
                ? `${alternative.object}.${alternative.field}`
                : alternative.field,
            op: alternative.operator,
            value: alternative.value,
            field_type: alternative.field_type || "",
            logical: "or",
            group,
          });
        }
        continue;
      }

      plan.filters.push({
        field:
          f.object && f.object !== target_object
            ? `${f.object}.${f.field}`
            : f.field,
        op: f.operator,
        value: f.value,
        field_type: f.field_type || "",
        logical: "and",
      });
    }

    // ── Time range filter ─────────────────────────────────────────────────
    if (temporal_field && _hasConcreteTimeRange(time_range)) {
      // Use the MORE precise of the two: if the time range says "time" (e.g.
      // "last 12 hours"), we must honour that even if the field type is "date".
      const precision =
        time_range.precision === "time" || temporal_field.precision === "time"
          ? "time"
          : "date";
      plan.time_range = {
        field: temporal_field.field,
        start_iso: time_range.start_iso,
        end_iso: time_range.end_iso,
        precision,
      };
    }

    // ── Aggregation / metrics ─────────────────────────────────────────────
    for (const m of metrics || []) {
      plan.metrics.push({
        function: m.function,
        field: m.field,
        alias: m.alias,
      });
    }

    // ── Group by ──────────────────────────────────────────────────────────
    if (group_by?.length && this._cap.supportsGroupBy !== false) {
      for (const g of group_by) {
        plan.group_by.push({
          field:
            g.object && g.object !== target_object
              ? `${g.object}.${g.field}`
              : g.field,
          alias: g.alias,
        });
      }
    }

    // ── Sort ──────────────────────────────────────────────────────────────
    if (sort_field) {
      plan.sort.push({
        field: sort_field.field,
        direction: sort_field.direction || "desc",
      });
    } else if (intent === "latest") {
      // Only apply the implicit Mongo fallback here. SQL latest queries
      // should rely on grounding to pick a real temporal or key field.
      if (vendor === "mongodb") {
        plan.sort.push({ field: "_id", direction: "desc" });
      }
    }

    // ── Compare windows ───────────────────────────────────────────────────
    if (compare_windows?.length) {
      plan.compare_windows = compare_windows;
    }

    // ── Intent overrides ──────────────────────────────────────────────────
    if (intent === "count" && metrics.length === 0) {
      plan.metrics = [{ function: "count", field: null, alias: "count" }];
      plan.sort = [];
      plan.limit = null;
    }

    if (intent === "latest" && !plan.limit) {
      plan.limit = 1;
    }

    // ── Explanation ───────────────────────────────────────────────────────
    plan.explanation = _buildExplanation(plan, groundedPlan);

    return plan;
  }
}

function _defaultLimit(intent) {
  if (intent === "count") return null;
  if (intent === "latest") return 1;
  if (intent === "compare") return null;
  return 20;
}

function _hasConcreteTimeRange(timeRange) {
  return Boolean(
    timeRange &&
      typeof timeRange.start_iso === "string" &&
      timeRange.start_iso &&
      typeof timeRange.end_iso === "string" &&
      timeRange.end_iso
  );
}

function _buildExplanation(plan, gp) {
  const parts = [];
  parts.push(`${plan.intent} from ${plan.source}`);
  if (plan.filters.length) {
    parts.push(
      `where ${plan.filters
        .map((f) => `${f.field} ${f.op} "${f.value}"`)
        .join(" AND ")}`
    );
  }
  if (_hasConcreteTimeRange(plan.time_range)) {
    parts.push(
      `within ${plan.time_range.start_iso} to ${plan.time_range.end_iso}`
    );
  }
  if (plan.joins.length) {
    parts.push(`joined to ${plan.joins.map((j) => j.to).join(", ")}`);
  }
  if (plan.sort.length) {
    parts.push(
      `sorted by ${plan.sort
        .map((s) => `${s.field} ${s.direction}`)
        .join(", ")}`
    );
  }
  if (plan.limit) {
    parts.push(`limit ${plan.limit}`);
  }
  return parts.join("; ");
}

module.exports = { LogicalPlanner };
