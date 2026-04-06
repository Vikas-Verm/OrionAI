"use strict";

/**
 * SQLCompiler
 *
 * Compiles a LogicalPlan to safe, parameterized SQL.
 * Handles PostgreSQL, MySQL, SQLite dialects.
 * Zero LLM involvement.
 */

const MAX_RESULT_ROWS = 200;

class SQLCompiler {
  /**
   * @param {string} vendor         "postgres" | "mysql" | "sqlite"
   * @param {Object} capabilities   Adapter capability manifest
   */
  constructor(vendor, capabilities = {}) {
    this._vendor = vendor;
    this._cap = capabilities;
  }

  /**
   * Compile a logical plan to SQL.
   *
   * @param {Object} logicalPlan
   * @returns {{ kind: "sql", target, sql, params, explanation }}
   */
  compile(logicalPlan) {
    const plan = logicalPlan;

    // Compare windows → two CTEs or UNION
    if (plan.compare_windows?.length > 1) {
      return this._compileCompare(plan);
    }

    // Aggregation / group_by
    if (plan.metrics?.length > 0 || plan.group_by?.length > 0) {
      return this._compileAggregate(plan);
    }

    // Count
    if (plan.intent === "count") {
      return this._compileCount(plan);
    }

    // List / latest
    return this._compileSelect(plan);
  }

  // ─── SELECT path ─────────────────────────────────────────────────────────

  _compileSelect(plan) {
    const params = [];
    const parts = [];

    parts.push(`SELECT ${this._tbl(plan.source)}.*`);

    const joinClauses = this._buildJoinClauses(plan, params);
    parts.push(`FROM ${this._tbl(plan.source)}`);
    if (joinClauses.length) parts.push(joinClauses.join("\n"));

    const whereClauses = this._buildWhereClauses(plan, params);
    if (whereClauses.length) parts.push(`WHERE ${whereClauses.join(" AND ")}`);

    if (plan.sort?.length > 0) {
      const orderParts = plan.sort.map(
        (s) => `${this._col(s.field, plan.source)} ${s.direction.toUpperCase()}`
      );
      parts.push(`ORDER BY ${orderParts.join(", ")}`);
    }

    const limit = plan.limit
      ? Math.min(plan.limit, MAX_RESULT_ROWS)
      : MAX_RESULT_ROWS;
    parts.push(`LIMIT ${limit}`);

    return {
      kind: "sql",
      target: plan.source,
      sql: parts.join("\n"),
      params,
      explanation: plan.explanation,
    };
  }

  // ─── COUNT path ───────────────────────────────────────────────────────────

  _compileCount(plan) {
    const params = [];
    const parts = [];

    parts.push(`SELECT COUNT(*) AS count`);

    const joinClauses = this._buildJoinClauses(plan, params);
    parts.push(`FROM ${this._tbl(plan.source)}`);
    if (joinClauses.length) parts.push(joinClauses.join("\n"));

    const whereClauses = this._buildWhereClauses(plan, params);
    if (whereClauses.length) parts.push(`WHERE ${whereClauses.join(" AND ")}`);

    return {
      kind: "sql",
      target: plan.source,
      sql: parts.join("\n"),
      params,
      explanation: plan.explanation,
    };
  }

  // ─── Aggregate path ───────────────────────────────────────────────────────

  _compileAggregate(plan) {
    const params = [];
    const parts = [];

    const selectExprs = [];

    // Group by columns
    for (const g of plan.group_by || []) {
      const col = this._col(g.field, plan.source);
      selectExprs.push(g.alias ? `${col} AS ${this._id(g.alias)}` : col);
    }

    // Metrics
    for (const m of plan.metrics || []) {
      const alias = m.alias || m.function;
      if (m.function === "count") {
        selectExprs.push(`COUNT(*) AS ${this._id(alias)}`);
      } else if (m.function === "count_distinct" && m.field) {
        const col = this._col(m.field, plan.source);
        selectExprs.push(`COUNT(DISTINCT ${col}) AS ${this._id(alias)}`);
      } else if (m.field) {
        const col = this._col(m.field, plan.source);
        const aggFn = _sqlAgg(m.function);
        selectExprs.push(`${aggFn}(${col}) AS ${this._id(alias)}`);
      }
    }

    parts.push(`SELECT ${selectExprs.join(", ") || "COUNT(*) AS count"}`);

    const joinClauses = this._buildJoinClauses(plan, params);
    parts.push(`FROM ${this._tbl(plan.source)}`);
    if (joinClauses.length) parts.push(joinClauses.join("\n"));

    const whereClauses = this._buildWhereClauses(plan, params);
    if (whereClauses.length) parts.push(`WHERE ${whereClauses.join(" AND ")}`);

    if (plan.group_by?.length > 0) {
      const gbCols = plan.group_by.map((g) => this._col(g.field, plan.source));
      parts.push(`GROUP BY ${gbCols.join(", ")}`);
    }

    if (plan.sort?.length > 0) {
      const orderParts = plan.sort.map(
        (s) => `${this._col(s.field, plan.source)} ${s.direction.toUpperCase()}`
      );
      parts.push(`ORDER BY ${orderParts.join(", ")}`);
    }

    if (plan.limit) {
      parts.push(`LIMIT ${Math.min(plan.limit, MAX_RESULT_ROWS)}`);
    }

    return {
      kind: "sql",
      target: plan.source,
      sql: parts.join("\n"),
      params,
      explanation: plan.explanation,
    };
  }

  // ─── Compare path ─────────────────────────────────────────────────────────

  _compileCompare(plan) {
    const subQueries = [];
    const params = [];

    for (const win of plan.compare_windows) {
      const subParams = [];
      const timeClauses = [];

      if (
        plan.time_range?.field &&
        _hasConcreteTimeRange(plan.time_range) &&
        win.start_iso &&
        win.end_iso
      ) {
        const col = this._col(plan.time_range.field, plan.source);
        timeClauses.push(
          ...this._buildDateRangeClause(
            col,
            win.start_iso,
            win.end_iso,
            plan.time_range.precision,
            subParams
          )
        );
      }

      const otherWhere = this._buildWhereClauses(
        plan,
        subParams,
        true /* skip time range */
      );
      const allWhere = [...timeClauses, ...otherWhere];

      const label = this._param(win.label, subParams);
      let sql = `SELECT ${label} AS window_label, COUNT(*) AS count FROM ${this._tbl(
        plan.source
      )}`;
      if (allWhere.length) sql += ` WHERE ${allWhere.join(" AND ")}`;
      subQueries.push(sql);
      params.push(...subParams);
    }

    return {
      kind: "sql",
      target: plan.source,
      sql: subQueries.join("\nUNION ALL\n"),
      params,
      explanation: plan.explanation,
      is_compare: true,
    };
  }

  // ─── Builder helpers ──────────────────────────────────────────────────────

  _buildJoinClauses(plan, params) {
    return (plan.joins || []).map((j) => {
      const joinType = j.type === "inner" ? "INNER JOIN" : "LEFT JOIN";
      const cond = j.on
        .map(([l, op, r]) => `${this._col(l)} ${op} ${this._col(r)}`)
        .join(" AND ");
      return `${joinType} ${this._tbl(j.to)} ON ${cond}`;
    });
  }

  _buildWhereClauses(plan, params, skipTimeRange = false) {
    const clauses = this._buildLogicalFilterClauses(plan.filters || [], plan.source, params);

    if (
      !skipTimeRange &&
      plan.time_range?.field &&
      _hasConcreteTimeRange(plan.time_range)
    ) {
      const col = this._col(plan.time_range.field, plan.source);
      clauses.push(
        ...this._buildDateRangeClause(
          col,
          plan.time_range.start_iso,
          plan.time_range.end_iso,
          plan.time_range.precision,
          params
        )
      );
    }

    return clauses;
  }

  _buildLogicalFilterClauses(filters, defaultSource, params) {
    const clauses = [];
    const orGroups = new Map();

    for (const filter of filters || []) {
      const col = this._col(filter.field, defaultSource);
      const clause = this._buildFilterClause(
        col,
        filter.op,
        filter.value,
        filter.field_type,
        params
      );
      if (!clause) continue;

      if (filter.logical === "or" && filter.group) {
        if (!orGroups.has(filter.group)) orGroups.set(filter.group, []);
        orGroups.get(filter.group).push(clause);
      } else {
        clauses.push(clause);
      }
    }

    for (const groupClauses of orGroups.values()) {
      if (!groupClauses.length) continue;
      clauses.push(
        groupClauses.length === 1
          ? groupClauses[0]
          : `(${groupClauses.join(" OR ")})`
      );
    }

    return clauses;
  }

  _buildFilterClause(col, op, value, fieldType, params) {
    switch (op) {
      case "eq":
        params.push(value);
        return `${col} = ${this._ph(params.length)}`;
      case "neq":
        params.push(value);
        return `${col} != ${this._ph(params.length)}`;
      case "contains_ci":
        params.push(`%${String(value || "").toLowerCase()}%`);
        return this._cap.supportsILIKE
          ? `LOWER(${col}) LIKE ${this._ph(params.length)}`
          : `LOWER(CAST(${col} AS ${this._textType()})) LIKE ${this._ph(
              params.length
            )}`;
      case "contains":
        params.push(`%${String(value || "")}%`);
        return `${col} LIKE ${this._ph(params.length)}`;
      case "starts_with":
        params.push(`${String(value || "")}%`);
        return `${col} LIKE ${this._ph(params.length)}`;
      case "ends_with":
        params.push(`%${String(value || "")}`);
        return `${col} LIKE ${this._ph(params.length)}`;
      case "regex":
        if (this._vendor === "postgres") {
          params.push(String(value || ""));
          return `${col} ~* ${this._ph(params.length)}`;
        }
        // MySQL: REGEXP, SQLite: no regex — fall back to LIKE
        params.push(`%${String(value || "")}%`);
        return `${col} LIKE ${this._ph(params.length)}`;
      case "gt":
        params.push(value);
        return `${col} > ${this._ph(params.length)}`;
      case "gte":
        params.push(value);
        return `${col} >= ${this._ph(params.length)}`;
      case "lt":
        params.push(value);
        return `${col} < ${this._ph(params.length)}`;
      case "lte":
        params.push(value);
        return `${col} <= ${this._ph(params.length)}`;
      case "in": {
        const vals = Array.isArray(value) ? value : [value];
        if (!vals.length) return "1 = 0";
        const phs = vals.map((v) => {
          params.push(v);
          return this._ph(params.length);
        });
        return `${col} IN (${phs.join(", ")})`;
      }
      case "not_in": {
        const vals = Array.isArray(value) ? value : [value];
        if (!vals.length) return "1 = 1";
        const phs = vals.map((v) => {
          params.push(v);
          return this._ph(params.length);
        });
        return `${col} NOT IN (${phs.join(", ")})`;
      }
      case "is_null":
        return `${col} IS NULL`;
      case "is_not_null":
        return `${col} IS NOT NULL`;
      default:
        params.push(`%${String(value || "")}%`);
        return `LOWER(CAST(${col} AS ${this._textType()})) LIKE ${this._ph(
          params.length
        )}`;
    }
  }

  _buildDateRangeClause(col, startIso, endIso, precision, params) {
    const clauses = [];
    if (precision === "time") {
      if (this._vendor === "postgres") {
        params.push(startIso);
        clauses.push(
          `${col} >= ${this._castPostgresTemporalParam(
            this._ph(params.length),
            startIso,
            "time"
          )}`
        );
        params.push(endIso);
        clauses.push(
          `${col} < ${this._castPostgresTemporalParam(
            this._ph(params.length),
            endIso,
            "time"
          )}`
        );
      } else if (this._vendor === "sqlite") {
        params.push(startIso);
        clauses.push(
          `datetime(${col}) >= datetime(${this._ph(params.length)})`
        );
        params.push(endIso);
        clauses.push(`datetime(${col}) < datetime(${this._ph(params.length)})`);
      } else {
        params.push(startIso);
        clauses.push(`${col} >= ${this._ph(params.length)}`);
        params.push(endIso);
        clauses.push(`${col} < ${this._ph(params.length)}`);
      }
    } else {
      const start = startIso.slice(0, 10);
      const end = endIso.slice(0, 10);
      if (this._vendor === "postgres") {
        params.push(start);
        clauses.push(
          `DATE(${col}) >= ${this._castPostgresTemporalParam(
            this._ph(params.length),
            start,
            "date"
          )}`
        );
        params.push(end);
        clauses.push(
          `DATE(${col}) <= ${this._castPostgresTemporalParam(
            this._ph(params.length),
            end,
            "date"
          )}`
        );
      } else if (this._vendor === "sqlite") {
        params.push(start);
        clauses.push(`date(${col}) >= date(${this._ph(params.length)})`);
        params.push(end);
        clauses.push(`date(${col}) <= date(${this._ph(params.length)})`);
      } else {
        params.push(start);
        clauses.push(`DATE(${col}) >= ${this._ph(params.length)}`);
        params.push(end);
        clauses.push(`DATE(${col}) <= ${this._ph(params.length)}`);
      }
    }
    return clauses;
  }

  // ─── Quoting helpers ──────────────────────────────────────────────────────

  _q(name = "") {
    const text = String(name || "");
    if (this._vendor === "mysql") {
      return `\`${text.replace(/`/g, "``")}\``;
    }
    return `"${text.replace(/"/g, '""')}"`;
  }
  _id(name = "") {
    return this._q(name);
  }
  _tbl(name = "") {
    const parts = name.split(".");
    return parts.map((p) => this._q(p)).join(".");
  }

  _col(field = "", defaultTable = "") {
    if (field.includes(".")) {
      return field
        .split(".")
        .filter(Boolean)
        .map((part) => this._q(part))
        .join(".");
    }
    return defaultTable
      ? `${this._tbl(defaultTable)}.${this._q(field)}`
      : this._q(field);
  }

  _castPostgresTemporalParam(placeholder, rawValue, precision) {
    if (precision === "date") {
      return `CAST(${placeholder} AS DATE)`;
    }
    const value = String(rawValue || "").trim();
    const hasTimezone = /(?:z|[+-]\d{2}:\d{2})$/i.test(value);
    return `CAST(${placeholder} AS ${hasTimezone ? "TIMESTAMPTZ" : "TIMESTAMP"})`;
  }

  _ph(i) {
    return this._vendor === "postgres" ? `$${i}` : "?";
  }

  _param(value, params) {
    params.push(value);
    return this._ph(params.length);
  }

  _textType() {
    return this._vendor === "postgres" ? "TEXT" : "CHAR";
  }
}

function _sqlAgg(fn) {
  const map = {
    sum: "SUM",
    avg: "AVG",
    min: "MIN",
    max: "MAX",
  };
  return map[fn] || "SUM";
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

module.exports = { SQLCompiler };
