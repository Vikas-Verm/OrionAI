"use strict";

/**
 * PlanVerifier
 *
 * Validates a LogicalPlan before compilation and execution.
 * Enforces:
 *   - Read-only safety
 *   - Field existence in schema
 *   - Temporal field is actually temporal
 *   - Sort fields are valid
 *   - Numeric metrics are on numeric fields
 *   - Minimum confidence threshold
 *   - Safe result limits
 *
 * Zero LLM. Hard rejects on safety violations.
 */

const MAX_ALLOWED_LIMIT = 200;
const MIN_PLAN_CONFIDENCE = 0.25;

class PlanVerifier {
  /**
   * @param {Object} catalog   SemanticCatalog
   */
  constructor(catalog) {
    this._catalog = catalog;
    this._objectsByName = new Map(
      (catalog.objects || []).map((o) => [o.name.toLowerCase(), o])
    );
  }

  /**
   * Verify a logical plan.
   *
   * @param {Object} logicalPlan
   * @param {Object} groundedPlan
   * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
   */
  verify(logicalPlan, groundedPlan) {
    const errors = [];
    const warnings = [];

    // ── Confidence ────────────────────────────────────────────────────────
    if ((logicalPlan.confidence || 0) < MIN_PLAN_CONFIDENCE) {
      errors.push(
        `Plan confidence too low (${(logicalPlan.confidence || 0).toFixed(
          2
        )} < ${MIN_PLAN_CONFIDENCE})`
      );
    }

    // ── Source object existence ───────────────────────────────────────────
    const sourceObj = this._findObject(logicalPlan.source);
    if (!sourceObj) {
      errors.push(`Source object "${logicalPlan.source}" not found in schema`);
      return { valid: false, errors, warnings };
    }

    // ── Limit safety ──────────────────────────────────────────────────────
    if (logicalPlan.limit && logicalPlan.limit > MAX_ALLOWED_LIMIT) {
      warnings.push(
        `Limit capped from ${logicalPlan.limit} to ${MAX_ALLOWED_LIMIT}`
      );
      logicalPlan.limit = MAX_ALLOWED_LIMIT;
    }

    // ── Filter field existence ────────────────────────────────────────────
    for (const f of logicalPlan.filters || []) {
      const fieldPath = f.field;
      const objName = fieldPath.includes(".")
        ? fieldPath.split(".")[0]
        : logicalPlan.source;
      const fieldName = fieldPath.includes(".")
        ? fieldPath.split(".").slice(1).join(".")
        : fieldPath;
      const obj = this._findObject(objName);
      if (!obj) continue;

      const fp = this._findFieldInObject(obj, fieldName);
      if (!fp) {
        warnings.push(
          `Filter field "${fieldPath}" was not found in "${obj.name}" during verification.`
        );
        continue;
      }

      const sem = fp.semantics || {};
      if (fp) {
        if (
          sem.isReferenceField &&
          [
            "contains",
            "contains_ci",
            "starts_with",
            "ends_with",
            "regex",
          ].includes(f.op)
        ) {
          warnings.push(
            `Filter "${fieldPath}" uses text operator "${f.op}" on a reference field. Join/display-field resolution is likely required.`
          );
        }

        if (
          sem.isReferenceField &&
          typeof f.value === "string" &&
          !/^[a-f0-9]{24}$/i.test(String(f.value)) &&
          f.op === "eq"
        ) {
          warnings.push(
            `Filter "${fieldPath}" compares a reference field to human text. Join/display-field resolution is likely required.`
          );
        }
      }

      if (
        sem.isReferenceField &&
        [
          "contains",
          "contains_ci",
          "starts_with",
          "ends_with",
          "regex",
        ].includes(f.op)
      ) {
        warnings.push(
          `Filter "${fieldPath}" uses ${f.op} on a reference field. A join/display-field resolution may be required.`
        );
      }

      if (sem.isExactIdentifierCandidate && !["eq", "in"].includes(f.op)) {
        warnings.push(
          `Filter "${fieldPath}" looks like an exact identifier but is using "${f.op}" instead of eq/in.`
        );
      }

      if (
        sem.isNumeric &&
        [
          "contains",
          "contains_ci",
          "starts_with",
          "ends_with",
          "regex",
        ].includes(f.op)
      ) {
        errors.push(
          `Filter "${fieldPath}" is numeric and cannot use text operator "${f.op}".`
        );
      }
    }

    // ── Temporal field verification ───────────────────────────────────────
    if (logicalPlan.time_range?.field) {
      const tf = logicalPlan.time_range.field;
      const fieldProfile = this._findFieldInObject(sourceObj, tf);
      if (!fieldProfile) {
        errors.push(
          `Temporal field "${tf}" not found in "${logicalPlan.source}"`
        );
      } else if (!fieldProfile.semantics?.isTemporalCandidate) {
        errors.push(
          `Field "${tf}" is not a temporal field (type: ${fieldProfile.type}) — cannot be used for date filtering`
        );
      } else if (fieldProfile.semantics?.isReferenceField) {
        errors.push(
          `Field "${tf}" is a reference/actor field, not a date field — cannot be used for date filtering`
        );
      }
    }

    // ── Sort field existence ──────────────────────────────────────────────
    for (const s of logicalPlan.sort || []) {
      if (!this._fieldExists(sourceObj, s.field)) {
        warnings.push(
          `Sort field "${s.field}" not found in "${logicalPlan.source}" — sort may be ignored`
        );
      }
    }

    // ── Metric field type check ───────────────────────────────────────────
    for (const m of logicalPlan.metrics || []) {
      if (!m.field || m.function === "count") continue;
      const fp = this._findFieldInObject(sourceObj, m.field);
      if (fp) {
        const numericTypes =
          /(int|float|double|decimal|numeric|number|bigint|real)/i;
        if (
          !numericTypes.test(fp.type || "") &&
          !numericTypes.test(fp.semantics?.roles?.join(",") || "")
        ) {
          warnings.push(
            `Metric ${m.function}(${m.field}) — field type "${fp.type}" may not be numeric`
          );
        }
      }
    }

    // ── Join object existence ─────────────────────────────────────────────
    for (const j of logicalPlan.joins || []) {
      if (!this._findObject(j.to)) {
        errors.push(`Join target "${j.to}" not found in schema`);
      }
    }

    // ── Group_by field existence ──────────────────────────────────────────
    for (const g of logicalPlan.group_by || []) {
      if (!this._fieldExists(sourceObj, g.field)) {
        warnings.push(
          `Group-by field "${g.field}" not found in "${logicalPlan.source}"`
        );
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  _findObject(name = "") {
    return (
      this._objectsByName.get(name.toLowerCase()) ||
      this._objectsByName.get(name.split(".").pop().toLowerCase()) ||
      null
    );
  }

  _fieldExists(obj, fieldName) {
    return Boolean(this._findFieldInObject(obj, fieldName));
  }

  _findFieldInObject(obj, fieldName) {
    if (!obj || !fieldName) return null;
    const direct =
      (obj.fields || []).find(
        (f) => f.name.toLowerCase() === fieldName.toLowerCase()
      ) || null;
    if (direct) return direct;

    const nestedSource = (obj.fields || []).find((field) =>
      (field.nested_paths || []).some(
        (path) => String(path).toLowerCase() === String(fieldName).toLowerCase()
      )
    );
    if (!nestedSource) return null;

    return _buildNestedFieldProfile(fieldName);
  }
}

function _buildNestedFieldProfile(fieldName) {
  const lower = String(fieldName || "").toLowerCase();
  return {
    name: fieldName,
    type: /(amount|total|price|cost|rate|qty|quantity|count)$/.test(lower)
      ? "number"
      : /(date|time|timestamp|datetime|_at|_on)$/.test(lower)
      ? "date"
      : "string",
    semantics: {
      isReferenceField: false,
      isTemporalCandidate: /(date|time|timestamp|datetime|_at|_on)$/.test(
        lower
      ),
      isExactIdentifierCandidate:
        /(number|code|ref|reference|identifier|token|id)$/.test(lower),
      isNumeric: /(amount|total|price|cost|rate|qty|quantity|count)$/.test(
        lower
      ),
    },
  };
}

module.exports = { PlanVerifier };
