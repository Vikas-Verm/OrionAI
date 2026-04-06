"use strict";

/**
 * AnswerBuilder
 *
 * Builds the final human-readable answer from query execution results.
 * Answers STRICTLY from returned rows — never invents data.
 * Optional LLM call for wording only (can be disabled).
 */

class AnswerBuilder {
  /**
   * @param {Function} [llmComplete]  Optional: async (prompt, maxTokens, temp) => string
   */
  constructor(llmComplete = null) {
    this._llm = llmComplete;
  }

  /**
   * Build an answer from execution results.
   *
   * @param {string} question
   * @param {Object} executionResult   { rows, rowCount, executedQuery, executionMs }
   * @param {Object} logicalPlan
   * @param {Object} trace             PlannerTrace for debug mode
   * @param {Object} options           { debugMode, useLlm }
   * @returns {Promise<string>}
   */
  async build(
    question,
    executionResult,
    logicalPlan,
    trace = {},
    options = {}
  ) {
    const { rows, rowCount } = executionResult;

    // ── Count answer — always deterministic ────────────────────────────────
    if (logicalPlan.intent === "count") {
      return this._buildCountAnswer(question, rows, logicalPlan, trace);
    }

    // ── Empty result ───────────────────────────────────────────────────────
    if (!rows || rows.length === 0) {
      return this._buildEmptyAnswer(question, logicalPlan);
    }

    // ── Latest / single record ─────────────────────────────────────────────
    if (
      rows.length === 1 &&
      ["latest", "lookup", "list"].includes(logicalPlan.intent)
    ) {
      return this._buildSingleRecordAnswer(
        question,
        rows[0],
        logicalPlan,
        options
      );
    }

    // ── Compare windows ────────────────────────────────────────────────────
    if (
      logicalPlan.intent === "compare" &&
      logicalPlan.compare_windows?.length > 0
    ) {
      return this._buildCompareAnswer(rows, logicalPlan);
    }

    // ── Aggregate / grouped_metric ─────────────────────────────────────────
    if (
      ["aggregate", "grouped_metric", "distribution"].includes(
        logicalPlan.intent
      )
    ) {
      return this._buildAggregateAnswer(question, rows, logicalPlan);
    }

    // ── List — optional LLM wording ───────────────────────────────────────
    if (this._llm && options.useLlm !== false) {
      return this._buildWithLlm(question, executionResult, logicalPlan);
    }

    return this._buildListAnswer(question, rows, rowCount, logicalPlan);
  }

  // ─── Deterministic answer builders ─────────────────────────────────────────

  _buildCountAnswer(question, rows, plan, trace) {
    const count = _extractCount(rows);
    if (count === null) {
      return "The query ran but I couldn't extract a count from the result.";
    }

    const entity = _humanizeSource(plan.source);
    const timeLabel = plan.time_range ? ` in the specified time range` : "";
    const filterLabel = plan.filters?.length ? ` matching your filters` : "";

    return `There ${count === 1 ? "is" : "are"} **${count.toLocaleString()}** ${
      count === 1 ? _singularize(entity) : entity
    }${filterLabel}${timeLabel}.`;
  }

  _buildEmptyAnswer(question, plan) {
    const entity = _humanizeSource(plan.source);
    const filterNote = plan.filters?.length
      ? " matching your filters"
      : plan.time_range
      ? " in the specified time range"
      : "";
    return `No ${entity} found${filterNote}. Try broadening your filters or checking the time range.`;
  }

  _buildSingleRecordAnswer(question, row, plan, options) {
    const entity = _singularize(_humanizeSource(plan.source));
    const lines = [];
    lines.push(`Here is the ${entity}:`);
    lines.push("");

    const fields = pickDisplayFields(row, 24);

    for (const key of fields) {
      _appendStructuredField(lines, key, row[key]);
    }

    return lines.join("\n");
  }

  _buildListAnswer(question, rows, rowCount, plan) {
    const entity = _humanizeSource(plan.source);
    const shown = rows.length;
    const header = `Found **${rowCount.toLocaleString()}** ${entity}${
      rowCount !== shown ? `, showing ${shown}` : ""
    }:`;
    const lines = [header, ""];

    // Display key fields (first 5 non-id fields)
    const keyFields = pickDisplayFields(rows[0] || {}, 6);
    for (const row of rows.slice(0, 20)) {
      const parts = keyFields.map(
        (k) => `${_humanizeKey(k)}: ${_formatValue(row[k])}`
      );
      lines.push(`• ${parts.join(" | ")}`);
    }

    if (rowCount > 20) {
      lines.push(`\n_...and ${rowCount - 20} more records._`);
    }
    return lines.join("\n");
  }

  _buildAggregateAnswer(question, rows, plan) {
    if (!rows.length) return "No aggregation results found.";

    const lines = [];
    for (const row of rows.slice(0, 20)) {
      const parts = Object.entries(row)
        .filter(([k]) => k !== "_id" || typeof row[k] !== "object")
        .map(([k, v]) => {
          const displayKey = k === "_id" ? "Group" : _humanizeKey(k);
          const displayVal =
            typeof v === "object" && v !== null
              ? JSON.stringify(v)
              : _formatValue(v);
          return `${displayKey}: **${displayVal}**`;
        });
      lines.push(`• ${parts.join(" | ")}`);
    }
    return lines.join("\n");
  }

  _buildCompareAnswer(rows, plan) {
    if (!rows.length) return "No comparison data found.";
    const lines = ["Comparison results:", ""];
    for (const row of rows) {
      const label = row.window_label || row._id || "Window";
      const count = row.count ?? row.total ?? "—";
      lines.push(`• **${label}**: ${count.toLocaleString()}`);
    }
    return lines.join("\n");
  }

  // ─── LLM wording (optional) ───────────────────────────────────────────────

  async _buildWithLlm(question, executionResult, plan) {
    const { rows, rowCount, executedQuery } = executionResult;
    const prompt = [
      "You are OrionAI answering a database query.",
      "Answer STRICTLY from the rows provided. Do not invent any data.",
      "Be concise and direct. Format key values in bold.",
      `Question: "${question}"`,
      `Row count: ${rowCount}`,
      `Executed query: ${executedQuery}`,
      `Sample rows (up to 8): ${JSON.stringify(_safeRows(rows, 8))}`,
      "",
      "Answer with a direct response first, then the most relevant details from the rows.",
      "If the result is empty, say so clearly.",
    ].join("\n");

    try {
      return await this._llm(prompt, 600, 0.2);
    } catch {
      return this._buildListAnswer(question, rows, rowCount, plan);
    }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function _extractCount(rows) {
  if (!Array.isArray(rows) || rows.length !== 1) return null;
  const row = rows[0];
  const countKey = Object.keys(row).find((k) => /^count$/i.test(k));
  if (countKey) {
    const n = Number(row[countKey]);
    return Number.isFinite(n) ? n : null;
  }
  const numEntries = Object.entries(row).filter(([, v]) =>
    Number.isFinite(Number(v))
  );
  return numEntries.length === 1 ? Number(numEntries[0][1]) : null;
}

function _humanizeSource(name = "") {
  const short = name.split(".").pop() || name;
  return short.replace(/[_-]/g, " ").toLowerCase().trim();
}

function _humanizeKey(key = "") {
  return String(key)
    .replace(/[_-]/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function pickDisplayFields(row = {}, maxFields = 20) {
  const scored = Object.entries(row)
    .filter(([key, value]) => key !== "__v" && value !== undefined)
    .map(([key, value]) => ({
      key,
      score: scoreDisplayField(key, value),
    }))
    .sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));

  return scored.slice(0, maxFields).map((x) => x.key);
}

function scoreDisplayField(key, value) {
  const k = String(key || "").toLowerCase();
  let score = 0;

  if (k === "__v") return -1000;
  if (k === "_id") score -= 25;

  if (value === null || value === undefined || value === "") score -= 8;

  if (typeof value === "string") {
    score += 16;
    if (looksHumanReadable(value)) score += 18;
    if (looksStructuredIdentifier(value)) score += 10;
    if (looksDateLike(value)) score += 12;
    if (looksCompactCategory(value)) score += 7;
    if (value.length > 150) score -= 10;
  }

  if (typeof value === "number") score += 10;
  if (typeof value === "boolean") score += 4;
  if (value instanceof Date) score += 14;

  if (Array.isArray(value)) {
    if (value.length === 0) score -= 5;
    else score += 6;
    if (value.some((item) => item && typeof item === "object")) score += 8;
  }

  if (typeof value === "object" && value !== null && !(value instanceof Date)) {
    if (_isObjectIdLike(value)) score -= 15;
    const keys = Object.keys(value);
    if (keys.length <= 6) score += 10;
    else score += 2;
  }

  return score;
}

function looksHumanReadable(value) {
  const s = String(value || "").trim();
  if (!s || s.length < 3) return false;
  if (/[A-Za-z]{3,}/.test(s) && /\s/.test(s)) return true;
  if (
    /^[A-Za-z][A-Za-z0-9\s\-&,()./]{2,}$/.test(s) &&
    !/^[a-f0-9]{24}$/i.test(s)
  ) {
    return true;
  }
  return false;
}

function looksStructuredIdentifier(value) {
  const s = String(value || "").trim();
  if (!s) return false;
  return /^[A-Za-z0-9][A-Za-z0-9/_-]{4,}$/.test(s);
}

function looksDateLike(value) {
  const s = String(value || "").trim();
  if (!s) return false;
  return /^\d{4}-\d{2}-\d{2}(?:[t\s]\d{2}:\d{2}(:\d{2})?)?/i.test(s);
}

function looksCompactCategory(value) {
  const s = String(value || "").trim();
  if (!s || s.length > 32) return false;
  if (/\s{2,}/.test(s)) return false;
  return /^[A-Za-z][A-Za-z0-9 _-]{1,31}$/.test(s);
}

function _singularize(word = "") {
  if (/ies$/i.test(word)) return word.replace(/ies$/i, "y");
  if (/ses$|xes$|zes$|ches$|shes$/i.test(word)) return word.replace(/es$/i, "");
  if (/s$/i.test(word) && word.length > 3) return word.replace(/s$/i, "");
  return word;
}

function _formatValue(value, depth = 0) {
  if (value === null || value === undefined) return "(empty)";
  if (value === "") return "(empty)";

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (_isObjectIdLike(value)) {
    return _objectIdToString(value);
  }

  if (Buffer.isBuffer(value)) {
    return value.toString("hex");
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value);
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return "(empty)";
    if (depth >= 1) return `[${value.length} items]`;

    return value
      .slice(0, 3)
      .map((item) => _formatValue(item, depth + 1))
      .join(", ");
  }

  if (typeof value === "object") {
    if (
      typeof value.toString === "function" &&
      value.toString !== Object.prototype.toString
    ) {
      const rendered = value.toString();
      if (rendered && rendered !== "[object Object]") {
        return rendered;
      }
    }
    const keys = Object.keys(value);
    if (!keys.length) return "(empty)";
    if (depth >= 1) return `{${keys.length} fields}`;

    const parts = [];
    for (const key of keys.slice(0, 5)) {
      parts.push(`${key}: ${_formatValue(value[key], depth + 1)}`);
    }
    return parts.join(" | ");
  }

  return String(value);
}

function _appendStructuredField(lines, key, value, depth = 0) {
  const label = _humanizeKey(key);
  const indent = "  ".repeat(depth);
  const normalized = _normalizeStructuredValue(value, depth);

  if (
    normalized === "(empty)" ||
    typeof normalized === "string" ||
    typeof normalized === "number" ||
    typeof normalized === "boolean"
  ) {
    lines.push(`${indent}**${label}:** ${normalized}`);
    return;
  }

  if (Array.isArray(normalized)) {
    lines.push(`${indent}**${label}:**`);
    const shown = normalized.slice(0, 3);
    for (const item of shown) {
      if (
        typeof item === "string" ||
        typeof item === "number" ||
        typeof item === "boolean"
      ) {
        lines.push(`${indent}- ${item}`);
      } else {
        lines.push(`${indent}- ${_formatInlineStructuredObject(item)}`);
      }
    }
    if (normalized.length > shown.length) {
      lines.push(`${indent}- ...and ${normalized.length - shown.length} more`);
    }
    return;
  }

  const inline = _formatInlineStructuredObject(normalized);
  if (depth >= 1 || inline.length <= 100) {
    lines.push(`${indent}**${label}:** ${inline}`);
    return;
  }

  lines.push(`${indent}**${label}:**`);
  for (const nestedKey of pickDisplayFields(normalized, depth === 0 ? 6 : 4)) {
    _appendStructuredField(lines, nestedKey, normalized[nestedKey], depth + 1);
  }
}

function _normalizeStructuredValue(value, depth = 0) {
  if (value === null || value === undefined || value === "") return "(empty)";
  if (value instanceof Date) return value.toISOString();
  if (_isObjectIdLike(value)) return _objectIdToString(value);
  if (Buffer.isBuffer(value)) return value.toString("hex");

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, 6)
      .map((item) => _normalizeStructuredValue(item, depth + 1))
      .filter((item) => item !== "(empty)");
  }

  if (typeof value === "object") {
    if (
      typeof value.toString === "function" &&
      value.toString !== Object.prototype.toString
    ) {
      const rendered = value.toString();
      if (rendered && rendered !== "[object Object]") {
        return rendered;
      }
    }

    const out = {};
    for (const nestedKey of Object.keys(value).slice(0, 12)) {
      out[nestedKey] = _normalizeStructuredValue(value[nestedKey], depth + 1);
    }
    return out;
  }

  return String(value);
}

function _formatInlineStructuredObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return _formatValue(value);
  }

  const keys = pickDisplayFields(value, 4);
  if (!keys.length) return "(empty)";

  return keys
    .map((key) => `${_humanizeKey(key)}: ${_formatValue(value[key], 1)}`)
    .join(" | ");
}

function _isObjectIdLike(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      (value._bsontype === "ObjectID" || value._bsontype === "ObjectId")
  );
}

function _objectIdToString(value) {
  if (!value) return "(empty)";
  if (typeof value.toHexString === "function") return value.toHexString();
  return String(value);
}

// function _pickDisplayFields(row) {
//   return Object.keys(row)
//     .filter((k) => k !== "_id" && k !== "__v")
//     .slice(0, 5);
// }

function _safeRows(rows, n) {
  return (rows || []).slice(0, n).map((row) => {
    const safe = {};
    for (const [k, v] of Object.entries(row || {}).slice(0, 12)) {
      safe[k] = _formatValue(v);
    }
    return safe;
  });
}

// function _pickSmartDisplayFields(row = {}, fieldProfiles = []) {
//   const profileMap = new Map(fieldProfiles.map((f) => [f.name, f]));
//   const scored = Object.entries(row)
//     .filter(([key, value]) => key !== "__v" && value !== undefined)
//     .map(([key, value]) => ({
//       key,
//       score: _scoreDisplayFieldWithProfile(key, value, profileMap.get(key)),
//     }))
//     .sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));

//   return scored.slice(0, 12).map((x) => x.key);
// }

// function _scoreDisplayFieldWithProfile(key, value, profile) {
//   let score = scoreDisplayField(key, value);

//   const sem = profile?.semantics || {};
//   if (sem.isDisplayCandidate) score += 30;
//   if (sem.isTemporalCandidate) score += 12;
//   if (sem.isExactIdentifierCandidate) score += 10;
//   if (sem.isReferenceField) score += 8;
//   if (sem.isPrimaryKey) score -= 20;

//   return score;
// }

// function _looksHumanReadable(value) {
//   const s = String(value || "").trim();
//   if (!s) return false;
//   if (s.length < 3) return false;

//   // normal words / names / titles
//   if (/[A-Za-z]{3,}/.test(s) && /\s/.test(s)) return true;
//   if (
//     /^[A-Za-z][A-Za-z0-9\s\-&,()./]{2,}$/.test(s) &&
//     !/^[A-Fa-f0-9]{24}$/.test(s)
//   ) {
//     return true;
//   }

//   return false;
// }

// function _looksStructuredIdentifier(value) {
//   const s = String(value || "").trim();
//   if (!s) return false;
//   return /^[A-Za-z0-9][A-Za-z0-9/_-]{4,}$/.test(s);
// }

module.exports = { AnswerBuilder };
