"use strict";

/**
 * CatalogScorer.js
 *
 * Computes confidence scores for semantic catalog entries.
 * Used by GroundingEngine to decide whether to proceed,
 * fetch more evidence, or surface ambiguity to the user.
 */

const THRESHOLDS = {
  TARGET_HIGH: 0.85, // proceed without evidence
  TARGET_MED: 0.5, // proceed with targeted evidence
  TARGET_LOW: 0.25, // surface ambiguity
  FIELD_HIGH: 0.8,
  FIELD_MED: 0.5,
  FIELD_LOW: 0.25,
  RELATION_HIGH: 0.85,
  RELATION_MED: 0.6,
};

/**
 * Score a target entity resolution.
 * @param {string} entityName     What the user said
 * @param {Object} resolvedObject The catalog object we matched to
 * @returns {number} 0–1
 */
function scoreTargetResolution(entityName, resolvedObject) {
  if (!resolvedObject) return 0;
  const entity = String(entityName || "")
    .toLowerCase()
    .trim();
  const objName = String(resolvedObject.name || "").toLowerCase();
  const short = objName.split(".").pop();

  // Exact match
  if (objName === entity || short === entity) return 1.0;

  // Plural/singular
  if (objName === entity + "s" || short === entity + "s") return 0.95;
  if (entity === objName + "s" || entity === short + "s") return 0.95;

  // Entity label match
  const labels = (resolvedObject.entity_labels || []).map((l) =>
    l.toLowerCase()
  );
  if (labels.includes(entity)) return 0.92;
  if (labels.some((l) => l.startsWith(entity) || entity.startsWith(l)))
    return 0.75;

  // Substring
  if (objName.includes(entity) || entity.includes(objName.replace(/s$/, "")))
    return 0.65;

  return 0.4;
}

/**
 * Score a field role resolution.
 * @param {string} role       Semantic role from Intent IR
 * @param {Object} field      Resolved field profile
 * @param {string} operator   Resolved operator
 * @returns {number} 0–1
 */
function scoreFieldResolution(role, field, operator) {
  if (!field) return 0;

  const roles = field.semantics?.roles || field.roles || [];
  const name = String(field.name || "").toLowerCase();
  const r = String(role || "").toLowerCase();

  // Direct role match
  if (roles.includes(r)) return 0.95;

  // Name contains role token
  if (name.includes(r) || r.includes(name.replace(/_name$|_id$/, "")))
    return 0.75;

  // Actor field matched via name convention
  if (name.endsWith("_name") || name.endsWith("_id")) return 0.7;

  return 0.5;
}

/**
 * Score a relation path resolution.
 * @param {Object} relation   Relation from catalog
 * @returns {number} 0–1
 */
function scoreRelationPath(relation) {
  return relation?.confidence ?? 0.5;
}

/**
 * Compute the overall plan confidence from its components.
 * @param {{ targetConf, filterConfs, temporalConf, sortConf }} components
 * @returns {number} 0–1
 */
function computePlanConfidence({
  targetConf = 1,
  filterConfs = [],
  temporalConf = 1,
  sortConf = 1,
}) {
  const minFilter = filterConfs.length > 0 ? Math.min(...filterConfs) : 1;
  // Weighted minimum: target is most important, then filters, then temporal
  return Math.min(
    targetConf * 0.4 + minFilter * 0.35 + temporalConf * 0.15 + sortConf * 0.1,
    1
  );
}

/**
 * Decide what to do based on confidence.
 * @param {number} confidence
 * @returns {"proceed"|"evidence"|"ambiguous"|"reject"}
 */
function decideAction(confidence) {
  if (confidence >= THRESHOLDS.TARGET_HIGH) return "proceed";
  if (confidence >= THRESHOLDS.TARGET_MED) return "evidence";
  if (confidence >= THRESHOLDS.TARGET_LOW) return "ambiguous";
  return "reject";
}

module.exports = {
  THRESHOLDS,
  scoreTargetResolution,
  scoreFieldResolution,
  scoreRelationPath,
  computePlanConfidence,
  decideAction,
};
