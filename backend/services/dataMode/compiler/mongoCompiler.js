"use strict";

/**
 * MongoCompiler
 *
 * Compiles a LogicalPlan to MongoDB physical queries.
 * Produces find() for simple cases, aggregate() for complex cases.
 * Zero LLM involvement.
 */

const MAX_RESULT_ROWS = 200;

class MongoCompiler {
  /**
   * @param {Object} capabilities  Adapter capability manifest
   */
  constructor(capabilities = {}) {
    this._cap = capabilities;
  }

  /**
   * Compile a logical plan to a MongoDB physical plan.
   *
   * @param {Object} logicalPlan
   * @returns {{ kind, operation, collection, query?, sort?, projection?, limit?, pipeline?, explanation }}
   */
  compile(logicalPlan) {
    const useAggregate = this._requiresAggregate(logicalPlan);

    if (useAggregate) {
      return this._compileAggregate(logicalPlan);
    }
    return this._compileFind(logicalPlan);
  }

  // ─── find() path (simple queries) ────────────────────────────────────────

  _compileFind(plan) {
    const query = this._buildMatchQuery(plan);
    const sort = this._buildSort(plan);
    const limit = plan.limit
      ? Math.min(plan.limit, MAX_RESULT_ROWS)
      : MAX_RESULT_ROWS;

    // Count intent
    if (plan.intent === "count") {
      return {
        kind: "mongo",
        operation: "count",
        collection: plan.source,
        query,
        explanation: plan.explanation,
      };
    }

    return {
      kind: "mongo",
      operation: "find",
      collection: plan.source,
      query,
      projection: {},
      sort,
      limit,
      explanation: plan.explanation,
    };
  }

  // ─── aggregate() path (joins, group_by, metrics, compare) ────────────────

  _compileAggregate(plan) {
    const pipeline = [];

    // $match stage (pre-join filters on the root collection)
    const rootFilters = plan.filters.filter(
      (f) => !f.field.includes(".") || f.field.startsWith(plan.source)
    );
    const rootQuery = this._buildFilterQuery(rootFilters);
    const timeQuery = this._buildTimeRangeQuery(plan.time_range);
    const combinedPreMatch = _combineMongoClauses(rootQuery, timeQuery);
    if (Object.keys(combinedPreMatch).length > 0) {
      pipeline.push({ $match: combinedPreMatch });
    }

    // $lookup stages (joins)
    for (const join of plan.joins || []) {
      const lookupStage = {
        $lookup: {
          from: join.to,
          localField: _extractFieldName(join.on[0][0]),
          foreignField: _extractFieldName(join.on[0][2]),
          as: join.alias || `_${join.to}`,
        },
      };
      pipeline.push(lookupStage);
      // $unwind the lookup result (left join: preserveNullAndEmptyArrays)
      pipeline.push({
        $unwind: {
          path: `$${join.alias || `_${join.to}`}`,
          preserveNullAndEmptyArrays: join.type === "left",
        },
      });
    }

    // $match stage (post-join filters, e.g. on joined collection fields)
    const joinedFilters = plan.filters.filter(
      (f) => f.field.includes(".") && !f.field.startsWith(plan.source)
    );
    if (joinedFilters.length > 0) {
      const postMatchQuery = this._buildJoinedFilterQuery(
        joinedFilters,
        plan.joins
      );
      if (Object.keys(postMatchQuery).length > 0) {
        pipeline.push({ $match: postMatchQuery });
      }
    }

    // $group stage
    if (plan.group_by?.length > 0 || plan.metrics?.length > 0) {
      const groupStage = this._buildGroupStage(plan);
      pipeline.push(groupStage);
    }

    // $sort stage
    const sort = this._buildSort(plan);
    if (Object.keys(sort).length > 0) {
      pipeline.push({ $sort: sort });
    }

    // $limit stage
    if (plan.limit) {
      pipeline.push({ $limit: Math.min(plan.limit, MAX_RESULT_ROWS) });
    }

    // Compare windows: run as separate sub-pipelines and $facet
    if (plan.compare_windows?.length > 1) {
      return this._compileCompare(plan);
    }

    return {
      kind: "mongo",
      operation: "aggregate",
      collection: plan.source,
      pipeline,
      explanation: plan.explanation,
    };
  }

  // ─── Compare windows ─────────────────────────────────────────────────────

  _compileCompare(plan) {
    const facetStages = {};
    for (const win of plan.compare_windows) {
      const winPipeline = [];
      const timeQuery = _buildRangeQuery(
        "_timeField_",
        win.start_iso,
        win.end_iso,
        "time"
      );
      // Replace time range in pipeline with window-specific one
      // (simplified: use $match on the temporal field from the plan's time_range)
      if (plan.time_range?.field && win.start_iso && win.end_iso) {
        winPipeline.push({
          $match: {
            [plan.time_range.field]: {
              $gte: new Date(win.start_iso),
              $lt: new Date(win.end_iso),
            },
          },
        });
      }
      winPipeline.push({ $count: "count" });
      facetStages[win.label] = winPipeline;
    }

    return {
      kind: "mongo",
      operation: "aggregate",
      collection: plan.source,
      pipeline: [{ $facet: facetStages }],
      explanation: plan.explanation,
      is_compare: true,
    };
  }

  // ─── Query builders ───────────────────────────────────────────────────────

  _buildMatchQuery(plan) {
    const filterQ = this._buildFilterQuery(plan.filters || []);
    const timeQ = this._buildTimeRangeQuery(plan.time_range);
    return _combineMongoClauses(filterQ, timeQ);
  }

  _buildFilterQuery(filters) {
    return this._buildLogicalMongoQuery(filters, (filter) => filter.field);
  }

  _buildJoinedFilterQuery(filters, joins) {
    return this._buildLogicalMongoQuery(filters, (filter) => {
      const parts = filter.field.split(".");
      const objName = parts[0];
      const fieldName = parts.slice(1).join(".");
      const join = (joins || []).find((j) => j.to === objName);
      const alias = join?.alias || `_${objName}`;
      return `${alias}.${fieldName}`;
    });
  }

  _buildTimeRangeQuery(timeRange) {
    if (!timeRange?.field) return {};
    const field = timeRange.field;
    const start = new Date(timeRange.start_iso);
    const end = new Date(timeRange.end_iso);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) return {};

    // For time-precision ranges, emit two variants:
    //   1. Native ISODate comparison (works when field is stored as Date)
    //   2. ISO string comparison (works when field is stored as string)
    // For date-precision ranges, also include date-only string prefix variant.
    if (timeRange.precision === "time") {
      return {
        $or: [
          { [field]: { $gte: start, $lt: end } },
          { [field]: { $gte: start.toISOString(), $lt: end.toISOString() } },
        ],
      };
    }

    // Date precision — broader match covering date-only strings too
    const startDate = timeRange.start_iso.slice(0, 10);
    const endDate = timeRange.end_iso.slice(0, 10);
    return {
      $or: [
        { [field]: { $gte: start, $lt: end } },
        { [field]: { $gte: start.toISOString(), $lt: end.toISOString() } },
        { [field]: { $gte: startDate, $lt: endDate } },
      ],
    };
  }

  _buildGroupStage(plan) {
    const _id =
      plan.group_by.length > 0
        ? Object.fromEntries(
            plan.group_by.map((g) => [
              g.alias || _fieldKey(g.field),
              `$${g.field}`,
            ])
          )
        : null;

    const accumulator = {};
    for (const m of plan.metrics || []) {
      const alias = m.alias || m.function;
      if (m.function === "count") {
        accumulator[alias] = { $sum: 1 };
      } else if (m.field) {
        const aggOp = _mongoAgg(m.function);
        if (aggOp) accumulator[alias] = { [aggOp]: `$${m.field}` };
      }
    }

    return { $group: { _id, ...accumulator } };
  }

  _buildSort(plan) {
    const sort = {};
    for (const s of plan.sort || []) {
      sort[s.field] = s.direction === "desc" ? -1 : 1;
    }
    return sort;
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  _requiresAggregate(plan) {
    return (
      plan.joins?.length > 0 ||
      plan.group_by?.length > 0 ||
      plan.metrics?.some((m) => m.function !== "count") ||
      plan.compare_windows?.length > 0
    );
  }

  _buildLogicalMongoQuery(filters, resolveFieldPath) {
    const andClauses = [];
    const orGroups = new Map();

    for (const filter of filters || []) {
      const fieldPath = resolveFieldPath(filter);
      const clause = _buildCondition(filter.op, filter.value, filter.field_type);
      if (clause === null) continue;
      const entry = { [fieldPath]: clause };

      if (filter.logical === "or" && filter.group) {
        if (!orGroups.has(filter.group)) orGroups.set(filter.group, []);
        orGroups.get(filter.group).push(entry);
      } else {
        andClauses.push(entry);
      }
    }

    for (const groupClauses of orGroups.values()) {
      if (!groupClauses.length) continue;
      if (groupClauses.length === 1) {
        andClauses.push(groupClauses[0]);
      } else {
        andClauses.push({ $or: groupClauses });
      }
    }

    if (andClauses.length === 0) return {};
    if (andClauses.length === 1) return andClauses[0];
    return { $and: andClauses };
  }
}

// ─── Standalone helpers ───────────────────────────────────────────────────────

function _extractFieldName(dotPath = "") {
  // "Bills.created_at" → "created_at" (for root collection), full path for joins
  const parts = dotPath.split(".");
  return parts.length === 1 ? dotPath : parts.slice(1).join(".");
}

function _fieldKey(field = "") {
  return field.replace(/\./g, "_");
}

function _combineMongoClauses(...clauses) {
  const valid = clauses.filter(
    (clause) => clause && typeof clause === "object" && Object.keys(clause).length
  );
  if (!valid.length) return {};
  if (valid.length === 1) return valid[0];
  return { $and: valid };
}

function _mongoAgg(fn) {
  const map = {
    sum: "$sum",
    avg: "$avg",
    min: "$min",
    max: "$max",
    count_distinct: "$addToSet",
  };
  return map[fn] || null;
}

function _buildCondition(op, value, fieldType, fieldMeta = null) {
  const sem = fieldMeta?.semantics || {};
  const type = String(fieldType || "").toLowerCase();

  if (
    sem.isReferenceField &&
    ["contains", "contains_ci", "starts_with", "ends_with", "regex"].includes(
      op
    )
  ) {
    // compiler should not emit regex for reference fields
    return value;
  }

  switch (op) {
    case "eq":
      return value;
    case "neq":
      return { $ne: value };
    case "contains_ci":
      return { $regex: _escapeRegex(String(value || "")), $options: "i" };
    case "contains":
      return { $regex: _escapeRegex(String(value || "")) };
    case "starts_with":
      return { $regex: `^${_escapeRegex(String(value || ""))}`, $options: "i" };
    case "ends_with":
      return { $regex: `${_escapeRegex(String(value || ""))}$`, $options: "i" };
    case "regex":
      return { $regex: String(value || ""), $options: "i" };
    case "gt":
      return { $gt: value };
    case "gte":
      return { $gte: value };
    case "lt":
      return { $lt: value };
    case "lte":
      return { $lte: value };
    case "in":
      return { $in: Array.isArray(value) ? value : [value] };
    case "not_in":
      return { $nin: Array.isArray(value) ? value : [value] };
    case "is_null":
      return null;
    case "is_not_null":
      return { $ne: null };
    default:
      return value;
  }
}

function _buildRangeQuery(field, startIso, endIso, precision) {
  if (!field || !startIso || !endIso) return {};
  const start = new Date(startIso);
  const end = new Date(endIso);
  return {
    $or: [
      { [field]: { $gte: start, $lt: end } },
      { [field]: { $gte: startIso, $lt: endIso } },
    ],
  };
}

function _escapeRegex(s = "") {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function _coerce(value, fieldType) {
  if (
    fieldType?.includes("number") ||
    fieldType?.includes("int") ||
    fieldType?.includes("float")
  ) {
    return Number(value);
  }
  return value;
}

module.exports = { MongoCompiler };
