"use strict";

const {
  parseTimeRange,
  parseCompareWindows,
  describeTimeRange,
} = require("./timeRangeParser");
const { buildIntentPrompt } = require("./parserPrompts");

/**
 * QuestionParser
 *
 * Converts natural-language questions into structured Intent IR.
 * Uses deterministic parsing for time ranges and compare windows.
 * Uses LLM only for semantic intent extraction.
 * Validates output against expected schema before returning.
 */

const VALID_INTENTS = new Set([
  "count",
  "latest",
  "list",
  "aggregate",
  "compare",
  "lookup",
  "trend",
  "grouped_metric",
  "distribution",
  "unknown",
]);

const VALID_OPERATORS = new Set([
  "eq",
  "neq",
  "contains",
  "contains_ci",
  "starts_with",
  "ends_with",
  "regex",
  "gt",
  "gte",
  "lt",
  "lte",
  "in",
  "not_in",
  "is_null",
  "is_not_null",
]);

const GENERIC_ENTITY_NAMES = new Set([
  "record",
  "records",
  "row",
  "rows",
  "data",
  "item",
  "items",
  "entry",
  "entries",
  "document",
  "documents",
]);

const RELATION_PREPOSITIONS_RE = /\b(?:of|for|from|by|with)\s+(.+?)(?=\s+(?:of|for|from|by|with|and|or|where|whose|that|which|when|after|before|during|sorted|ordered|grouped|having|limit|top)\b|$)/gi;
const ROLE_FILLER_TOKENS = new Set([
  "a",
  "an",
  "the",
  "my",
  "our",
  "their",
  "this",
  "that",
  "these",
  "those",
]);
const INVALID_VALUE_START_TOKENS = new Set([
  "which",
  "that",
  "who",
  "whom",
  "where",
  "when",
  "is",
  "are",
  "was",
  "were",
  "has",
  "have",
]);
const FOCUSED_TARGET_RE = /^\s*\[(collection|table):\s*([^\]]+)\]\s*(.*)$/i;

class QuestionParser {
  /**
   * @param {Function} llmComplete  async (prompt: string, maxTokens: number, temp: number) => string
   */
  constructor(llmComplete) {
    this._llm = llmComplete;
  }

  /**
   * Parse a natural-language question into Intent IR.
   *
   * @param {string}   question
   * @param {string[]} entityNames   Known entities from schema (for LLM context)
   * @param {Date}     [now]         Override current time (for testing)
   * @returns {Promise<IntentIR>}
   */
  async parse(question, entityNames = [], now = new Date()) {
    const { questionText, preferredTarget } = extractFocusedTargetHint(question);
    const q = questionText;
    if (!q) {
      return this._fallbackIR(question, "empty question");
    }

    // ── Step 1: deterministic time range parsing ───────────────────────────
    const timeRange = parseTimeRange(q, now);
    const compareWin = parseCompareWindows(q, now);

    const isCompare = Boolean(compareWin);
    const timeHint = timeRange ? describeTimeRange(timeRange) : null;

    // ── Step 2: LLM intent extraction ─────────────────────────────────────
    const prompt = buildIntentPrompt(q, entityNames, timeHint, isCompare);

    let llmOutput = "{}";
    try {
      llmOutput = await this._llm(prompt, 600, 0.0);
    } catch (err) {
      console.error("[QuestionParser] LLM call failed:", err.message);
      return this._fallbackIR(question, `LLM error: ${err.message}`);
    }

    // ── Step 3: parse and validate LLM output ─────────────────────────────
    let parsed = {};
    try {
      const clean = llmOutput
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/```\s*$/i, "")
        .trim();
      const match = clean.match(/\{[\s\S]*\}/);
      if (!match) throw new Error("No JSON object found in LLM output");
      parsed = JSON.parse(match[0]);
    } catch (err) {
      console.error("[QuestionParser] JSON parse failed:", err.message);
      return this._fallbackIR(question, `JSON parse error: ${err.message}`);
    }

    // ── Step 4: normalise and validate ────────────────────────────────────
    return this._normalizeAndValidate(
      parsed,
      timeRange,
      compareWin,
      q,
      entityNames,
      preferredTarget
    );
  }

  _normalizeAndValidate(
    raw,
    detectedTimeRange,
    compareWindows,
    originalQuestion,
    entityNames = [],
    preferredTarget = ""
  ) {
    const ir = {};

    // intent
    ir.intent = VALID_INTENTS.has(String(raw.intent || "").toLowerCase())
      ? String(raw.intent).toLowerCase()
      : "list";

    // entity
    ir.entity =
      String(raw.entity || "")
        .toLowerCase()
        .trim() || "record";
    ir.entity_hints = Array.isArray(raw.entity_hints)
      ? raw.entity_hints.map((e) => String(e).toLowerCase()).filter(Boolean)
      : [];

    // filters — validate each
    ir.filters = Array.isArray(raw.filters)
      ? raw.filters.map((f) => this._normalizeFilter(f)).filter(Boolean)
      : [];

    // time range — prefer deterministic parser, but accept LLM kind hint
    if (detectedTimeRange) {
      ir.time_range = { ...detectedTimeRange };
      // Incorporate role_hint from LLM if it added one
      if (raw.time_range?.role_hint) {
        ir.time_range.role_hint = String(raw.time_range.role_hint);
      }
    } else {
      ir.time_range = normalizeConcreteTimeRange(raw.time_range);
    }

    // compare windows (always from deterministic parser)
    ir.compare_windows = compareWindows || [];
    if (compareWindows) ir.intent = "compare";

    // metrics
    ir.metrics = Array.isArray(raw.metrics)
      ? raw.metrics.filter((m) => m.function && m.role)
      : [];

    // group_by
    ir.group_by = Array.isArray(raw.group_by)
      ? raw.group_by.filter((g) => g.role)
      : [];

    // sort
    ir.sort = Array.isArray(raw.sort)
      ? raw.sort.filter((s) => s.role && ["asc", "desc"].includes(s.direction))
      : [];
    if (ir.intent === "latest" && !hasExplicitSortInstruction(originalQuestion)) {
      ir.sort = [];
    }

    // limit
    const rawLimit = Number(raw.limit);
    ir.limit =
      Number.isFinite(rawLimit) && rawLimit >= 1
        ? Math.min(rawLimit, 200)
        : null;

    // projection
    const validProjections = new Set([
      "full_record",
      "id_only",
      "display_fields",
      "metric_fields",
    ]);
    ir.projection = validProjections.has(raw.projection)
      ? raw.projection
      : "full_record";

    // ambiguities
    ir.ambiguities = Array.isArray(raw.ambiguities) ? raw.ambiguities : [];

    // confidence
    ir.confidence = Number.isFinite(Number(raw.confidence))
      ? Math.min(1, Math.max(0, Number(raw.confidence)))
      : 0.5;

    ir.parser_notes = String(raw.parser_notes || "").slice(0, 500);
    ir.preferred_target = String(preferredTarget || "").trim();

    return this._applyDeterministicHints(ir, originalQuestion, entityNames);
  }

  _normalizeFilter(f) {
    if (!f || typeof f !== "object") return null;
    const role = String(f.role || "").trim();
    if (!role) return null;
    const value = f.value !== undefined ? f.value : null;
    const op = VALID_OPERATORS.has(String(f.operator || ""))
      ? String(f.operator)
      : "contains_ci";
    return {
      role,
      value,
      operator: op,
      value_kind: normalizeValueKind(f.value_kind, value, role),
      confidence: Number.isFinite(Number(f.confidence))
        ? Number(f.confidence)
        : 0.7,
    };
  }

  _applyDeterministicHints(ir, question, entityNames = []) {
    const next = {
      ...ir,
      entity_hints: Array.isArray(ir.entity_hints) ? [...ir.entity_hints] : [],
      filters: Array.isArray(ir.filters) ? [...ir.filters] : [],
    };

    if (next.preferred_target) {
      const preferredShortName = _shortName(next.preferred_target);
      const preferredEntity = _singularize(
        String(preferredShortName || "").toLowerCase()
      );
      if (preferredEntity) {
        if (
          !next.entity ||
          GENERIC_ENTITY_NAMES.has(String(next.entity).toLowerCase())
        ) {
          next.entity = preferredEntity;
        }
        if (!next.entity_hints.includes(preferredEntity)) {
          next.entity_hints.unshift(preferredEntity);
        }
      }
    }

    const detectedEntity = detectEntityMention(question, entityNames);
    if (detectedEntity) {
      if (
        !next.entity ||
        GENERIC_ENTITY_NAMES.has(String(next.entity).toLowerCase())
      ) {
        next.entity = detectedEntity;
      }
      if (!next.entity_hints.includes(detectedEntity)) {
        next.entity_hints.unshift(detectedEntity);
      }
    }

    next.filters = mergeFilters(next.filters, [
      ...extractIdentifierFilters(question),
      ...extractRolePhraseFilters(question, entityNames, next.entity),
    ]);
    next.filters = pruneQuestionUnsupportedFilters(next.filters, question);

    if (next.intent === "list") {
      const q = String(question || "").toLowerCase();
      if (/\b(show|find|get|lookup|open)\b/.test(q) && next.filters.length > 0) {
        next.intent = "lookup";
      }
    }

    return next;
  }

  _fallbackIR(question, reason) {
    // Minimal fallback — at least extract a time range deterministically
    const timeRange = parseTimeRange(String(question || ""));
    return {
      intent: "list",
      entity: "record",
      entity_hints: [],
      filters: [],
      time_range: timeRange,
      compare_windows: [],
      metrics: [],
      group_by: [],
      sort: [],
      limit: 20,
      projection: "full_record",
      ambiguities: [{ type: "parse_failure", description: reason }],
      confidence: 0.1,
      parser_notes: `fallback: ${reason}`,
    };
  }
}

function detectEntityMention(question, entityNames = []) {
  const q = String(question || "").toLowerCase();
  if (!q) return null;

  const candidates = [];
  for (const entityName of entityNames || []) {
    const short = _shortName(entityName).toLowerCase();
    const variants = [...new Set([short, _singularize(short), _pluralize(short)])];

    for (const variant of variants) {
      if (!variant || variant.length < 2) continue;
      const re = new RegExp(`\\b${escapeRegExp(variant)}\\b`, "i");
      if (!re.test(q)) continue;
      candidates.push({
        entity: _singularize(short),
        score: variant.length,
      });
    }
  }

  candidates.sort((a, b) => b.score - a.score || a.entity.localeCompare(b.entity));
  return candidates[0]?.entity || null;
}

function hasExplicitSortInstruction(question = "") {
  const q = String(question || "").toLowerCase();
  if (!q) return false;
  return (
    /\b(sort|sorted|order|ordered)\b/.test(q) ||
    /\border\s+by\b/.test(q) ||
    /\balphabetical(?:ly)?\b/.test(q)
  );
}

function extractFocusedTargetHint(question = "") {
  const raw = String(question || "").trim();
  const match = raw.match(FOCUSED_TARGET_RE);
  if (!match) {
    return {
      preferredTarget: "",
      questionText: raw,
    };
  }

  return {
    preferredTarget: String(match[2] || "").trim(),
    questionText: String(match[3] || "").trim(),
  };
}

function extractIdentifierFilters(question) {
  const q = String(question || "");
  const filters = [];
  const patterns = [
    /\b([a-z][a-z0-9_\s-]{0,28}?(?:number|code|reference|ref|identifier|id|token))\s*(?:is|=|:)?\s*["“']?([A-Za-z0-9][A-Za-z0-9/_:-]{2,})["”']?/gi,
    /\b(number|code|reference|ref|identifier|id|token)\s*(?:is|=|:)?\s*["“']?([A-Za-z0-9][A-Za-z0-9/_:-]{2,})["”']?/gi,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(q))) {
      const role = String(match[1] || "").trim().toLowerCase();
      const value = stripWrappingQuotes(match[2]);
      if (!role || !value) continue;
      filters.push({
        role,
        value,
        operator: "eq",
        value_kind: "identifier",
        confidence: 0.92,
      });
    }
  }

  return filters;
}

function extractRolePhraseFilters(question, entityNames = [], detectedEntity = "") {
  const q = String(question || "");
  const filters = [];
  const entitySet = buildEntityVariantSet(entityNames, detectedEntity);

  let match;
  while ((match = RELATION_PREPOSITIONS_RE.exec(q))) {
    const segment = String(match[1] || "").trim();
    const inferred = inferRoleValuePair(segment, entitySet);
    if (!inferred) continue;

    const valueKind = normalizeValueKind("unknown", inferred.value);
    filters.push({
      role: inferred.role,
      value: inferred.value,
      operator: valueKind === "identifier" ? "eq" : "contains_ci",
      value_kind: valueKind,
      confidence: inferred.confidence,
    });
  }

  return filters;
}

function inferRoleValuePair(segment, entitySet = new Set()) {
  const normalizedSegment = String(segment || "").trim().replace(/[?.!,]+$/, "");
  if (!normalizedSegment) return null;

  const quoted = normalizedSegment.match(/^(.*?)\s+["“'](.+?)["”']$/);
  if (quoted) {
    const role = sanitizeRolePhrase(quoted[1], entitySet);
    const value = stripWrappingQuotes(quoted[2]);
    if (!role || !value) return null;
    return {
      role,
      value,
      confidence: 0.88,
    };
  }

  const tokens = normalizedSegment.split(/\s+/).filter(Boolean);
  if (tokens.length < 3) return null;

  let best = null;
  let bestScore = -Infinity;

  for (let split = 1; split <= Math.min(3, tokens.length - 1); split++) {
    const roleTokens = tokens.slice(0, split);
    const valueTokens = tokens.slice(split);
    const role = sanitizeRolePhrase(roleTokens.join(" "), entitySet);
    const value = stripWrappingQuotes(valueTokens.join(" ").replace(/[?.!,]+$/, ""));
    if (!role || !value) continue;

    const score = scoreRoleValuePair(roleTokens, valueTokens, role, value, entitySet);
    if (score > bestScore) {
      bestScore = score;
      best = { role, value, confidence: Math.min(0.9, 0.5 + score / 2) };
    }
  }

  return bestScore >= 0.55 ? best : null;
}

function sanitizeRolePhrase(value, entitySet = new Set()) {
  const tokens = String(value || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => token.replace(/^[^\p{L}\p{N}_-]+|[^\p{L}\p{N}_-]+$/gu, ""))
    .filter(Boolean);

  while (tokens.length && ROLE_FILLER_TOKENS.has(tokens[0].toLowerCase())) {
    tokens.shift();
  }

  const role = tokens.join(" ").trim().toLowerCase();
  if (!role) return null;
  if (entitySet.has(role)) return null;
  if (normalizeValueKind("unknown", role) !== "text") return null;
  return role;
}

function scoreRoleValuePair(roleTokens, valueTokens, role, value, entitySet = new Set()) {
  if (!valueTokens.length) return -Infinity;

  const firstValue = stripWrappingQuotes(String(valueTokens[0] || ""));
  if (!firstValue) return -Infinity;
  if (INVALID_VALUE_START_TOKENS.has(firstValue.toLowerCase())) return -Infinity;

  const valueKind = normalizeValueKind("unknown", value);
  let score = 0;

  if (roleTokens.length <= 2) score += 0.2;
  if (roleTokens.every((token) => /^[A-Za-z][A-Za-z_-]*$/.test(token))) score += 0.2;
  if (valueTokens.length >= 2) score += 0.25;
  if (/[A-Z]/.test(value)) score += 0.2;
  if (/[\d/_:-]/.test(value)) score += 0.2;
  if (valueKind === "identifier") score += 0.15;
  if (value.length >= 4) score += 0.1;
  if (entitySet.has(role)) score -= 0.8;
  if (normalizeValueKind("unknown", role) !== "text") score -= 0.6;

  return score;
}

function buildEntityVariantSet(entityNames = [], detectedEntity = "") {
  const values = new Set();
  for (const entityName of [...(entityNames || []), detectedEntity]) {
    const short = _shortName(entityName).toLowerCase();
    for (const variant of [short, _singularize(short), _pluralize(short)]) {
      if (variant) values.add(variant);
    }
  }
  return values;
}

function mergeFilters(existing = [], inferred = []) {
  const merged = [];
  const seen = new Set();

  for (const filter of [...existing, ...inferred]) {
    if (!filter || !filter.role) continue;
    const normalized = {
      role: String(filter.role).trim(),
      value: filter.value,
      operator: VALID_OPERATORS.has(String(filter.operator || ""))
        ? String(filter.operator)
        : "contains_ci",
      value_kind: normalizeValueKind(
        filter.value_kind,
        filter.value,
        filter.role
      ),
      confidence: Number.isFinite(Number(filter.confidence))
        ? Number(filter.confidence)
        : 0.7,
    };
    const key = `${normalized.role.toLowerCase()}|${String(
      normalized.value ?? ""
    ).toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(normalized);
  }

  return merged;
}

function pruneQuestionUnsupportedFilters(filters = [], question = "") {
  if (!Array.isArray(filters) || filters.length <= 1) return filters;

  const questionTokens = _tokens(question);
  const groupedByValue = new Map();
  for (const filter of filters) {
    const valueKey = `${filter.value_kind || "unknown"}|${String(
      filter.value ?? ""
    ).toLowerCase()}`;
    if (!groupedByValue.has(valueKey)) groupedByValue.set(valueKey, []);
    groupedByValue.get(valueKey).push(filter);
  }

  return filters.filter((filter) => {
    const roleSupport = scoreRoleSupportInQuestion(filter.role, questionTokens);
    const sameValueFilters =
      groupedByValue.get(
        `${filter.value_kind || "unknown"}|${String(filter.value ?? "").toLowerCase()}`
      ) || [];
    const bestSupportForSameValue = Math.max(
      ...sameValueFilters.map((item) =>
        scoreRoleSupportInQuestion(item.role, questionTokens)
      )
    );

    if (
      filter.value_kind === "identifier" &&
      roleSupport < 0.4 &&
      bestSupportForSameValue >= 0.8
    ) {
      return false;
    }

    if (
      roleSupport === 0 &&
      looksSyntheticFieldName(filter.role) &&
      filter.value_kind === "identifier"
    ) {
      return false;
    }

    return true;
  });
}

function normalizeValueKind(kind, value, role = "") {
  const normalized = String(kind || "")
    .toLowerCase()
    .trim();

  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return "number";

  const text = String(value || "").trim();
  if (!text) return "unknown";

  if (
    [
      "identifier",
      "text",
      "number",
      "date",
      "datetime",
      "boolean",
    ].includes(normalized)
  ) {
    if (normalized === "identifier") {
      return _looksLikeStructuredIdentifier(text) || _looksIdentifierRole(role)
        ? "identifier"
        : "text";
    }
    return normalized;
  }

  if (/^(true|false)$/i.test(text)) return "boolean";
  if (/^-?\d+(?:\.\d+)?$/.test(text)) return "number";
  if (/^\d{4}-\d{2}-\d{2}(?:[t\s]\d{2}:\d{2}(:\d{2})?)?/i.test(text)) {
    return /[t\s]\d{2}:\d{2}/i.test(text) ? "datetime" : "date";
  }
  if (_looksLikeStructuredIdentifier(text)) {
    return "identifier";
  }
  return "text";
}

function _looksIdentifierRole(role = "") {
  return /(^|[\s_-])(number|code|reference|ref|identifier|token|key|id|no)([\s_-]|$)/i.test(
    String(role || "").trim()
  );
}

function _looksLikeStructuredIdentifier(value = "") {
  const text = String(value || "").trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9/_:-]{3,}$/.test(text)) return false;
  return /[\d/_:-]/.test(text);
}

function normalizeConcreteTimeRange(timeRange) {
  if (!timeRange || typeof timeRange !== "object") return null;

  const startIso = String(timeRange.start_iso || "").trim();
  const endIso = String(timeRange.end_iso || "").trim();
  if (!startIso || !endIso) return null;

  const start = new Date(startIso);
  const end = new Date(endIso);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) {
    return null;
  }

  return {
    kind: String(timeRange.kind || "custom"),
    precision:
      String(timeRange.precision || "").toLowerCase() === "time"
        ? "time"
        : "date",
    start_iso: start.toISOString(),
    end_iso: end.toISOString(),
    role_hint: String(timeRange.role_hint || "any"),
  };
}

function stripWrappingQuotes(value) {
  return String(value || "")
    .trim()
    .replace(/^["“']+/, "")
    .replace(/["”']+$/, "")
    .trim();
}

function _shortName(name = "") {
  return String(name).split(".").pop() || String(name);
}

function _singularize(word = "") {
  if (/ies$/i.test(word)) return word.replace(/ies$/i, "y");
  if (/ses$|xes$|zes$|ches$|shes$/i.test(word)) return word.replace(/es$/i, "");
  if (/s$/i.test(word) && word.length > 3) return word.replace(/s$/i, "");
  return word;
}

function _pluralize(word = "") {
  if (/ies$/i.test(word)) return word;
  if (/y$/i.test(word) && !/[aeiou]y$/i.test(word)) {
    return word.replace(/y$/i, "ies");
  }
  if (/s$/i.test(word)) return word;
  return `${word}s`;
}

function escapeRegExp(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function _tokens(text = "") {
  return String(text)
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function scoreRoleSupportInQuestion(role = "", questionTokens = []) {
  const roleTokens = _tokens(role);
  if (!roleTokens.length || !questionTokens.length) return 0;
  const questionSet = new Set(questionTokens);
  let hits = 0;
  for (const token of roleTokens) {
    if (questionSet.has(token)) hits++;
  }
  return hits / roleTokens.length;
}

function looksSyntheticFieldName(role = "") {
  const text = String(role || "");
  return /[_A-Z]/.test(text) || text.includes(".");
}

module.exports = { QuestionParser };
