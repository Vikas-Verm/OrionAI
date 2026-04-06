"use strict";

const {
  ACTOR_ROLES,
  IDENTITY_ROLES,
  METRIC_ROLES,
  STATUS_ROLES,
  LOCATION_ROLES,
} = require("../catalog/fieldSemanticDetector");
const { findJoinPath } = require("../catalog/relationGraphBuilder");
function _tokens(text = "") {
  return String(text)
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function _looksLikeObjectId(v) {
  return typeof v === "string" && /^[a-f0-9]{24}$/i.test(v);
}

function _overlapScore(a = [], b = []) {
  if (!a.length || !b.length) return 0;
  const bs = new Set(b);
  let hit = 0;
  for (const t of a) if (bs.has(t)) hit++;
  return hit / Math.max(a.length, b.length);
}

function _looksLikeObjectId(v) {
  return typeof v === "string" && /^[a-f0-9]{24}$/i.test(v);
}
/**
 * GroundingEngine
 *
 * Resolves abstract Intent IR against the actual semantic catalog.
 * Produces a GroundedPlan — every field name is exact, every join is explicit.
 *
 * Fully deterministic. Zero LLM involvement.
 */

const MIN_CONFIDENCE = 0.35; // below this, produce ambiguity instead of guessing

class GroundingEngine {
  /**
   * @param {Object} catalog   SemanticCatalog
   */
  constructor(catalog) {
    this._catalog = catalog;
    this._relations = catalog.relation_graph || [];
    this._entityMap = catalog.entity_map || {};
    this._objects = catalog.objects || [];
    this._objectsByName = new Map();
    this._objectsByExactName = new Map();
    this._objectsByExactShortName = new Map();
    for (const obj of catalog.objects || []) {
      this._objectsByExactName.set(obj.name, obj);
      this._objectsByExactShortName.set(_shortName(obj.name), obj);
      this._objectsByName.set(obj.name.toLowerCase(), obj);
      this._objectsByName.set(_shortName(obj.name).toLowerCase(), obj);
    }
  }

  /**
   * Ground an Intent IR into a GroundedPlan.
   *
   * @param {Object} intentIR
   * @returns {{ plan: GroundedPlan, ambiguities: string[], confidence: number }}
   */
  ground(intentIR) {
    const ambiguities = [];
    // ── 1. Resolve target object ──────────────────────────────────────────
    const targetResult = this._resolveTarget(
      intentIR.entity,
      intentIR.entity_hints || [],
      intentIR.preferred_target || ""
    );
    if (!targetResult) {
      return {
        plan: null,
        ambiguities: [
          `Could not identify which table/collection corresponds to "${intentIR.entity}"`,
        ],
        confidence: 0,
      };
    }
    const { targetObject, targetConf } = targetResult;
    if (targetConf < MIN_CONFIDENCE) {
      ambiguities.push(
        `Low confidence (${targetConf.toFixed(2)}) matching entity "${
          intentIR.entity
        }" to object "${targetObject.name}"`
      );
    }

    const plan = {
      target_object: targetObject.name,
      vendor: this._catalog.vendor,
      intent: intentIR.intent,
      filters: [],
      joins: [],
      temporal_field: null,
      time_range: null,
      sort_field: null,
      metrics: [],
      group_by: [],
      limit: intentIR.limit || _defaultLimit(intentIR.intent),
      projection: intentIR.projection || "full_record",
      compare_windows: intentIR.compare_windows || [],
      confidence: targetConf,
      grounding_notes: "",
      ambiguities: [],
    };

    // ── 2. Resolve filters ────────────────────────────────────────────────
    for (const filter of intentIR.filters || []) {
      const resolved = this._resolveFilter(filter, targetObject, plan);
      if (resolved) {
        if (resolved.join) plan.joins.push(resolved.join);
        plan.filters.push(resolved.filter);
      } else {
        ambiguities.push(
          `Could not resolve filter role "${filter.role}" with value "${filter.value}" in ${targetObject.name}`
        );
      }
    }

    // ── 3. Resolve temporal field + time range ────────────────────────────
    if (intentIR.time_range) {
      const temporalResult = this._resolveTemporalField(
        intentIR.time_range,
        targetObject
      );
      if (temporalResult) {
        plan.temporal_field = temporalResult;
        plan.time_range = intentIR.time_range;
      } else {
        ambiguities.push(
          `No suitable date field found in ${targetObject.name} for time filter`
        );
      }
    }

    // ── 4. Resolve sort / recency field ───────────────────────────────────
    if (intentIR.intent === "latest" || intentIR.sort?.length > 0) {
      const sortResult = this._resolveSortField(intentIR, targetObject);
      if (sortResult) {
        plan.sort_field = sortResult;
      }
    }

    // ── 5. Resolve metrics ────────────────────────────────────────────────
    for (const metric of intentIR.metrics || []) {
      const resolvedMetric = this._resolveMetricField(metric, targetObject);
      if (resolvedMetric) {
        plan.metrics.push(resolvedMetric);
      }
    }

    // ── 6. Resolve group_by ───────────────────────────────────────────────
    for (const gb of intentIR.group_by || []) {
      const resolvedGb = this._resolveGroupByField(gb, targetObject);
      if (resolvedGb) {
        plan.group_by.push(resolvedGb);
      } else {
        ambiguities.push(
          `Could not resolve group_by role "${gb.role}" in ${targetObject.name}`
        );
      }
    }

    // ── 7. Overall confidence ─────────────────────────────────────────────
    const filterConf =
      plan.filters.length > 0
        ? Math.min(...plan.filters.map((f) => f.confidence || 0.7))
        : 1;
    const temporalConf = intentIR.time_range
      ? plan.temporal_field
        ? 1.0
        : 0.3
      : 1;
    plan.confidence = Math.min(targetConf, filterConf, temporalConf);
    plan.ambiguities = ambiguities;
    plan.grounding_notes = ambiguities.join("; ") || "grounded successfully";

    return { plan, ambiguities, confidence: plan.confidence };
  }

  // ─── Target resolution ───────────────────────────────────────────────────────

  _resolveTarget(entity, hints, preferredTarget = "") {
    const preferredMatch = this._resolvePreferredTarget(preferredTarget);
    if (preferredMatch) {
      return preferredMatch;
    }

    const candidates = [];
    const tryNames = [entity, ...(hints || [])]
      .filter(Boolean)
      .map((s) => String(s).toLowerCase().trim());

    for (const name of tryNames) {
      // Exact object or short-name match
      let obj = this._objectsByName.get(name);
      if (!obj) obj = this._objectsByName.get(name + "s");
      if (!obj) obj = this._objectsByName.get(name + "es");
      if (obj) {
        candidates.push({ obj, score: 1.0 });
        continue;
      }

      // Entity map lookup
      const mapped = this._entityMap[name];
      if (mapped?.length) {
        for (const mappedName of mapped) {
          const o =
            this._objectsByName.get(mappedName.toLowerCase()) ||
            this._objectsByName.get(_shortName(mappedName).toLowerCase());
          if (o) candidates.push({ obj: o, score: 0.95 });
        }
        continue;
      }

      // Safer token-based match, not raw substring
      const nameTokens = _tokens(name);
      for (const [key, obj2] of this._objectsByName.entries()) {
        const keyTokens = _tokens(key);
        const overlap = _overlapScore(nameTokens, keyTokens);

        // Require strong token overlap, not mere substring
        if (overlap >= 0.8) {
          candidates.push({ obj: obj2, score: 0.75 + overlap * 0.1 });
        }
      }
    }

    if (!candidates.length) return null;

    candidates.sort(
      (a, b) => b.score - a.score || a.obj.name.length - b.obj.name.length
    );

    const best = candidates[0];
    return { targetObject: best.obj, targetConf: best.score };
  }

  _resolvePreferredTarget(preferredTarget = "") {
    const raw = String(preferredTarget || "").trim();
    if (!raw) return null;

    const exact =
      this._objectsByExactName.get(raw) ||
      this._objectsByExactShortName.get(raw);
    if (exact) {
      return { targetObject: exact, targetConf: 1.0 };
    }

    const normalized = raw.toLowerCase();
    const caseInsensitiveMatches = this._objects.filter((obj) => {
      const fullName = String(obj.name || "").toLowerCase();
      const shortName = _shortName(obj.name).toLowerCase();
      return fullName === normalized || shortName === normalized;
    });

    if (caseInsensitiveMatches.length === 1) {
      return { targetObject: caseInsensitiveMatches[0], targetConf: 0.99 };
    }

    return null;
  }

  // ─── Filter resolution ───────────────────────────────────────────────────────
  _findFieldViaReferenceField(
    refField,
    value,
    targetObject,
    valueKind = "text"
  ) {
    const ref = refField.references;
    if (!ref?.object || !ref?.field) return null;

    const relatedObj =
      this._objectsByName.get(ref.object.toLowerCase()) ||
      this._objectsByName.get(_shortName(ref.object).toLowerCase());
    if (!relatedObj) return null;

    const displayField =
      (relatedObj.fields || []).find((f) => f.semantics?.isDisplayCandidate) ||
      (relatedObj.fields || []).find(
        (f) => f.semantics?.isExactIdentifierCandidate
      );

    if (!displayField) return null;
    return {
      filter: {
        field: displayField.name,
        object: relatedObj.name,
        operator: valueKind === "identifier" ? "eq" : "contains_ci",
        value,
        field_type: displayField.type,
        confidence: 0.9,
      },
      join: {
        from_object: targetObject.name,
        to_object: relatedObj.name,
        from_field: refField.name,
        to_field: ref.field,
        join_type: "left",
        join_alias: `_${_shortName(relatedObj.name).toLowerCase()}`,
        confidence: 0.9,
      },
    };
  }
  _resolveFilter(filter, targetObject, plan) {
    const role = String(filter.role || "").toLowerCase();
    const value = filter.value;
    const op = filter.operator || null;
    const valueKind = filter.value_kind || "unknown";
    const isHumanTextValue =
      typeof value === "string" && !/^[a-f0-9]{24}$/i.test(value);

    const globalLookup = this._buildGlobalLookupFilter(
      role,
      value,
      targetObject,
      op,
      valueKind
    );
    if (globalLookup) {
      return globalLookup;
    }

    const directField = this._findFieldByRole(
      role,
      targetObject,
      value,
      op,
      valueKind
    );

    if (directField) {
      const sem = directField.field?.semantics || {};

      // IMPORTANT:
      // If this is a reference-like field and user gave human text,
      // DO NOT fall back to direct equality on the root field.
      if (sem.isReferenceField && isHumanTextValue) {
        const viaRef = this._findFieldViaReferenceField(
          directField.field,
          value,
          targetObject,
          valueKind
        );
        if (viaRef) return viaRef;

        // second chance: generic relation search
        const joinResult = this._findFieldViaJoin(
          role,
          value,
          targetObject,
          plan,
          op,
          valueKind
        );
        if (joinResult) return joinResult;

        // fail closed, not open
        return null;
      }
      return {
        filter: {
          field: directField.name,
          object: targetObject.name,
          operator: directField.preferredOp || op || "contains_ci",
          value,
          field_type: directField.type,
          confidence: directField.confidence,
        },
        join: null,
      };
    }

    const joinResult = this._findFieldViaJoin(
      role,
      value,
      targetObject,
      plan,
      op,
      valueKind
    );
    if (joinResult) return joinResult;

    return null;
  }

  _buildGlobalLookupFilter(
    role,
    value,
    targetObject,
    operator = null,
    valueKind = "unknown"
  ) {
    if (valueKind !== "identifier") return null;
    if (value == null || value === "") return null;
    if (!_looksLikeGlobalIdentifierValue(value)) return null;
    if (!_looksIdentifierRole(role)) return null;

    const candidates = this._findGlobalLookupCandidates(
      role,
      targetObject,
      value
    );
    if (candidates.length < 2) return null;

    return {
      filter: {
        alternatives: candidates.map((candidate) => ({
          field: candidate.name,
          object: targetObject.name,
          operator: "eq",
          value,
          field_type: candidate.type,
          confidence: candidate.confidence,
        })),
        object: targetObject.name,
        operator: "eq",
        value,
        field_type: candidates[0].type,
        confidence: Math.max(...candidates.map((candidate) => candidate.confidence)),
      },
      join: null,
    };
  }

  _inferOperator(field, value, requestedOp, valueKind = "unknown") {
    const sem = field?.semantics || {};

    if (requestedOp && requestedOp !== "contains_ci") {
      if (
        requestedOp === "eq" &&
        valueKind === "text" &&
        !_looksLikeObjectId(value) &&
        sem.isDisplayCandidate &&
        !sem.isExactIdentifierCandidate &&
        !sem.isNumeric &&
        !sem.isBoolean &&
        !sem.isTemporalCandidate
      ) {
        return "contains_ci";
      }
      return requestedOp;
    }

    if (valueKind === "identifier" || sem.isExactIdentifierCandidate) {
      return "eq";
    }

    if (sem.isNumeric || sem.isBoolean || sem.isCategorical) {
      return "eq";
    }

    if (sem.isReferenceField) {
      return _looksLikeObjectId(value) ? "eq" : "contains_ci";
    }

    return "contains_ci";
  }

  _findFieldByRole(role, obj, value, operator = null, valueKind = "unknown") {
    const roleText = String(role || "")
      .toLowerCase()
      .trim();
    const roleTokens = _tokens(roleText);
    const fields = obj.fields || [];

    let best = null;
    let bestScore = -Infinity;

    for (const f of fields) {
      const sem = f.semantics || {};
      const fieldTokens = f.normalized_tokens || _tokens(f.name);

      let score = 0;

      const overlap = _overlapScore(roleTokens, fieldTokens);
      score += overlap * 5;

      if (String(f.name).toLowerCase() === roleText) score += 8;
      if (String(f.name).toLowerCase().includes(roleText) && roleText)
        score += 4;

      if (valueKind === "identifier" && sem.isExactIdentifierCandidate)
        score += 8;
      if (valueKind === "text" && sem.isDisplayCandidate) score += 5;
      if (valueKind === "number" && sem.isNumeric) score += 5;
      if (
        (valueKind === "date" || valueKind === "datetime") &&
        sem.isTemporalCandidate
      )
        score += 6;

      if (typeof value === "string" && !_looksLikeObjectId(value)) {
        if (sem.isDisplayCandidate) score += 2;
        if (sem.isReferenceField) score -= 4;
        if (sem.isPrimaryKey) score -= 8;
      }

      if (operator === "eq" && sem.isCategorical) score += 2;

      if (score > bestScore) {
        bestScore = score;
        best = f;
      }

      if (
        this._catalog.vendor === "mongodb" &&
        Array.isArray(f.nested_paths) &&
        f.nested_paths.length
      ) {
        for (const nestedPath of f.nested_paths) {
          const nestedScore = _scoreNestedPathCandidate(
            nestedPath,
            roleText,
            roleTokens,
            valueKind,
            value
          );
          if (nestedScore <= bestScore) continue;

          bestScore = nestedScore;
          best = _buildNestedPathField(nestedPath, operator, value, valueKind);
        }
      }
    }

    if (!best || bestScore < 2) return null;

    return {
      name: best.name,
      type: best.type,
      preferredOp: this._inferOperator(best, value, operator, valueKind),
      confidence: Math.min(0.98, 0.45 + bestScore / 20),
      field: best,
    };
  }

  _findFieldViaJoin(
    role,
    value,
    targetObject,
    plan,
    operator = null,
    valueKind = "unknown"
  ) {
    let best = null;
    let bestScore = -Infinity;

    for (const rel of this._relations) {
      if (
        rel.from_object !== targetObject.name &&
        rel.to_object !== targetObject.name
      )
        continue;

      const relatedObjName =
        rel.from_object === targetObject.name ? rel.to_object : rel.from_object;

      const relatedObj =
        this._objectsByName.get(relatedObjName.toLowerCase()) ||
        this._objectsByName.get(_shortName(relatedObjName).toLowerCase());

      if (!relatedObj) continue;

      const candidate = this._findFieldByRole(
        role,
        relatedObj,
        value,
        operator,
        valueKind
      );
      if (!candidate) continue;

      const score = (rel.confidence || 0.5) + (candidate.confidence || 0.5);
      if (score <= bestScore) continue;
      bestScore = score;

      const isForward = rel.from_object === targetObject.name;
      best = {
        filter: {
          field: candidate.name,
          object: relatedObjName,
          operator: candidate.preferredOp,
          value,
          field_type: candidate.type,
          confidence: Math.min(
            rel.confidence || 0.5,
            candidate.confidence || 0.5
          ),
        },
        join: {
          from_object: targetObject.name,
          to_object: relatedObjName,
          from_field: isForward ? rel.from_field : rel.to_field,
          to_field: isForward ? rel.to_field : rel.from_field,
          join_type: "left",
          join_alias: `_${_shortName(relatedObjName).toLowerCase()}`,
          confidence: rel.confidence || 0.5,
        },
      };
    }

    return best;
  }

  _findGlobalLookupCandidates(role, obj, value) {
    const roleTokens = _tokens(role);
    const roleLooksLikePrimaryId = /\b(id|identifier)\b/i.test(String(role || ""));
    const candidates = [];

    for (const field of obj.fields || []) {
      const sem = field.semantics || {};
      if (sem.isReferenceField) continue;
      if (!sem.isExactIdentifierCandidate) continue;

      const fieldTokens = field.normalized_tokens || _tokens(field.name);
      const overlap = _overlapScore(roleTokens, fieldTokens);
      const isPrimaryIdentifierField =
        sem.isPrimaryKey || /^_?id$/i.test(String(field.name || ""));

      if (
        roleTokens.length &&
        overlap < 0.34 &&
        !(roleLooksLikePrimaryId && isPrimaryIdentifierField)
      ) {
        continue;
      }

      let score = 0.55;
      score += overlap * 0.35;

      if (_looksLikeStructuredIdentifier(String(value || ""))) score += 0.08;
      if (String(field.name || "").toLowerCase() === String(role || "").toLowerCase()) {
        score += 0.18;
      }

      candidates.push({
        name: field.name,
        type: field.type,
        confidence: Math.min(0.98, score),
        score,
      });
    }

    candidates.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
    return candidates.slice(0, 5);
  }

  // ─── Temporal field resolution ───────────────────────────────────────────────

  _resolveTemporalField(timeRange, obj) {
    const fields = obj.fields || [];
    const roleHint = String(timeRange.role_hint || "any").toLowerCase();

    let best = null;
    let bestScore = -Infinity;

    for (const f of fields) {
      const sem = f.semantics;
      if (!sem) continue;
      if (!sem.isTemporalCandidate) continue;
      if (sem.isReferenceField) continue;

      let score = sem.temporalScore || 0;

      // Boost by role hint
      if (
        roleHint === "created" &&
        sem.roles?.includes("created_at", "created_date")
      )
        score += 20;
      if (
        roleHint === "updated" &&
        sem.roles?.includes("updated_at", "updated_date")
      )
        score += 20;
      if (roleHint === "due" && sem.roles?.includes("due_date")) score += 20;

      if (score > bestScore) {
        bestScore = score;
        best = f;
      }
    }

    if (!best) return null;

    return {
      field: best.name,
      object: obj.name,
      type: best.type,
      precision: _inferTemporalPrecision(best),
    };
  }

  // ─── Sort / recency field resolution ────────────────────────────────────────

  _resolveSortField(intentIR, obj) {
    // Explicit sort from IR
    if (intentIR.sort?.length > 0) {
      const sortSpec = intentIR.sort[0];
      const field = this._findFieldByRole(sortSpec.role, obj, null);
      if (field) {
        return {
          field: field.name,
          object: obj.name,
          direction: sortSpec.direction,
        };
      }
    }

    // For "latest": find best recency field
    const fields = obj.fields || [];
    let best = null;
    let bestScore = -Infinity;

    for (const f of fields) {
      const sem = f.semantics || {};
      if (!sem) continue;
      if (!_isSafeLatestSortCandidate(f, sem)) continue;
      const score = sem.recencyScore || 0;
      if (score > bestScore) {
        bestScore = score;
        best = f;
      }
    }

    if (best) {
      return { field: best.name, object: obj.name, direction: "desc" };
    }

    // Final fallback for MongoDB: _id is always time-ordered.
    const mongoIdField = fields.find((field) => field.name === "_id");
    if (this._catalog.vendor === "mongodb" && mongoIdField) {
      return { field: "_id", object: obj.name, direction: "desc" };
    }

    const primaryKeyField = fields.find(
      (field) => field.is_primary_key || field.primaryKey
    );
    if (primaryKeyField) {
      return {
        field: primaryKeyField.name,
        object: obj.name,
        direction: "desc",
      };
    }

    const conventionalIdField = fields.find((field) =>
      /(^|[_\s-])(id|uuid)([_\s-]|$)/i.test(String(field.name || ""))
    );
    if (conventionalIdField) {
      return {
        field: conventionalIdField.name,
        object: obj.name,
        direction: "desc",
      };
    }

    return null;
  }

  // ─── Metric / group_by resolution ───────────────────────────────────────────

  _resolveMetricField(metric, obj) {
    const role = String(metric.role || "").toLowerCase();
    const fields = obj.fields || [];

    if (metric.function === "count") {
      return {
        function: "count",
        field: null,
        object: obj.name,
        alias: metric.alias || "count",
      };
    }

    const metricRE = METRIC_ROLES[role];
    if (metricRE) {
      const found = fields.find((f) => metricRE.test(f.name));
      if (found)
        return {
          function: metric.function,
          field: found.name,
          object: obj.name,
          alias: metric.alias || found.name,
        };
    }
    const direct = fields.find((f) => f.name.toLowerCase().includes(role));
    if (direct)
      return {
        function: metric.function,
        field: direct.name,
        object: obj.name,
        alias: metric.alias || direct.name,
      };
    return null;
  }

  _resolveGroupByField(gb, obj) {
    const role = String(gb.role || "").toLowerCase();
    const field = this._findFieldByRole(role, obj, null);
    if (field) return { field: field.name, object: obj.name, alias: gb.alias };
    return null;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function _shortName(name = "") {
  return name.split(".").pop() || name;
}

function _defaultLimit(intent) {
  switch (intent) {
    case "latest":
      return 1;
    case "count":
      return null;
    case "aggregate":
    case "grouped_metric":
      return 20;
    default:
      return 20;
  }
}

function _inferTemporalPrecision(field) {
  const type = String(field.type || "").toLowerCase();
  if (/(time|timestamp|datetime)/.test(type)) return "time";
  if (/date/.test(type)) return "date";
  // Infer from sample values
  if (field.sample_values?.some((v) => /T\d{2}:\d{2}/.test(String(v || ""))))
    return "time";
  return "date";
}

function _scoreNestedPathCandidate(
  nestedPath,
  roleText,
  roleTokens,
  valueKind,
  value
) {
  const pathText = String(nestedPath || "").toLowerCase();
  const pathTokens = _tokens(pathText);
  const lastToken = pathTokens[pathTokens.length - 1] || "";

  let score = _overlapScore(roleTokens, pathTokens) * 6;

  if (pathText === roleText) score += 8;
  if (pathText.includes(roleText) && roleText) score += 4;
  if (/(name|title|label|display|summary|description)$/.test(lastToken)) {
    score += 4;
  }
  if (/(number|code|ref|reference|identifier|id|token)$/.test(lastToken)) {
    score += valueKind === "identifier" ? 6 : 2;
  }
  if (valueKind === "text" && /(name|title|label|description)$/.test(lastToken)) {
    score += 3;
  }
  if (typeof value === "string" && value.length > 2) {
    score += 1;
  }

  return score;
}

function _buildNestedPathField(nestedPath, operator, value, valueKind) {
  return {
    name: nestedPath,
    type: _inferNestedPathType(nestedPath),
    preferredOp: _inferNestedPathOperator(nestedPath, operator, valueKind, value),
    confidence: 0.78,
    field: {
      name: nestedPath,
      type: _inferNestedPathType(nestedPath),
      nested_path: true,
      semantics: {
        isReferenceField: false,
        isDisplayCandidate:
          /(name|title|label|display|summary|description)$/.test(
            String(nestedPath).toLowerCase()
          ),
        isExactIdentifierCandidate:
          /(number|code|ref|reference|identifier|token|id)$/.test(
            String(nestedPath).toLowerCase()
          ),
      },
    },
  };
}

function _inferNestedPathType(nestedPath) {
  const lower = String(nestedPath || "").toLowerCase();
  if (/(amount|total|price|cost|rate|qty|quantity|count)$/.test(lower)) {
    return "number";
  }
  if (/(date|time|timestamp|datetime|_at|_on)$/.test(lower)) {
    return "date";
  }
  return "string";
}

function _inferNestedPathOperator(nestedPath, operator, valueKind, value) {
  if (operator && operator !== "contains_ci") return operator;
  if (valueKind === "identifier") return "eq";
  if (_looksLikeObjectId(value)) return "eq";
  if (
    /(number|code|ref|reference|identifier|token|id)$/.test(
      String(nestedPath || "").toLowerCase()
    )
  ) {
    return "eq";
  }
  return "contains_ci";
}

function _isSafeLatestSortCandidate(field, semantics = {}) {
  if (!field || semantics.isReferenceField) return false;
  if ((semantics.recencyScore || 0) > 0) return true;
  if (semantics.isRecencyCandidate) return true;
  if (semantics.temporalRole === "created" || semantics.temporalRole === "updated") {
    return true;
  }
  return false;
}

function _looksLikeStructuredIdentifier(value) {
  const text = String(value || "").trim();
  if (!text) return false;
  if (!/^[A-Za-z0-9][A-Za-z0-9/_:-]{3,}$/.test(text)) return false;
  return /[\d/_:-]/.test(text);
}

function _looksLikeGlobalIdentifierValue(value) {
  const text = String(value || "").trim();
  if (_looksLikeObjectId(text)) return true;
  return _looksLikeStructuredIdentifier(text);
}

function _looksIdentifierRole(role) {
  return /(^|[\s_-])(number|code|reference|ref|identifier|token|key|id|no)([\s_-]|$)/i.test(
    String(role || "").trim()
  );
}

function _tokens(text = "") {
  return String(text)
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function _overlapScore(a = [], b = []) {
  if (!a.length || !b.length) return 0;
  const bs = new Set(b);
  let hit = 0;
  for (const t of a) {
    if (bs.has(t)) hit++;
  }
  return hit / Math.max(a.length, b.length);
}
module.exports = { GroundingEngine };
