"use strict";

const {
  detectFieldSemantics,
  scoreTemporalField,
  scoreRecencyField,
} = require("./fieldSemanticDetector");
const { buildRelationGraph } = require("./relationGraphBuilder");

/**
 * Keep this helper at file scope so _buildFieldCatalog can always access it.
 */
function tokenizeFieldName(name = "") {
  return String(name)
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/**
 * SemanticCatalogBuilder
 *
 * Builds the full semantic catalog for a connected database.
 * Combines schema snapshot + sample values + semantic inference.
 */
class SemanticCatalogBuilder {
  /**
   * @param {Object} adapter   Database adapter (must implement profileObjects)
   */
  constructor(adapter) {
    this._adapter = adapter;
  }

  /**
   * Build a complete semantic catalog from a schema snapshot.
   *
   * @param {string}   connectionId
   * @param {Object}   snapshot
   * @param {Object}   [options]
   * @returns {Promise<Object>}
   */
  async build(connectionId, snapshot, options = {}) {
    const { objects = [], vendor, fingerprint } = snapshot;
    this._allObjects = objects;
    const profiles = await this._profileObjects(objects, options);
    this._profiles = profiles;
    const { relations, entityMap } = buildRelationGraph(objects, vendor);

    const catalogObjects = objects.map((obj) => {
      const profile = profiles[obj.name] || {};
      const fields = this._buildFieldCatalog(obj, profile, vendor);

      const temporalFields = fields
        .filter((f) => f.semantics?.isTemporalCandidate)
        .sort(
          (a, b) =>
            (b.semantics?.temporalScore || 0) -
            (a.semantics?.temporalScore || 0)
        );

      const recencyFields = fields
        .filter((f) => f.semantics?.isRecencyCandidate)
        .sort(
          (a, b) =>
            (b.semantics?.recencyScore || 0) - (a.semantics?.recencyScore || 0)
        );

      const displayFields = fields
        .filter((f) => f.semantics?.isDisplayCandidate)
        .sort((a, b) => {
          const aScore =
            (a.semantics?.isDisplayCandidate ? 10 : 0) +
            (a.distinct_estimate || 0) * 0.0001;
          const bScore =
            (b.semantics?.isDisplayCandidate ? 10 : 0) +
            (b.distinct_estimate || 0) * 0.0001;
          return bScore - aScore;
        })
        .slice(0, 5);

      const objRelations = relations.filter(
        (r) => r.from_object === obj.name || r.to_object === obj.name
      );

      return {
        name: obj.name,
        entity_labels: _inferEntityLabels(obj.name, entityMap),
        row_estimate: obj.estimated_rows ?? profile.row_estimate ?? null,
        fields,
        relations: objRelations,
        candidate_temporal_fields: temporalFields.map((f) => f.name),
        candidate_recency_fields: recencyFields.map((f) => f.name),
        candidate_display_fields: displayFields.map((f) => f.name),
      };
    });

    return {
      connectionId,
      vendor,
      snapshotVersion: fingerprint,
      builtAt: new Date().toISOString(),
      objects: catalogObjects,
      relation_graph: relations,
      entity_map: entityMap,
    };
  }

  _buildFieldCatalog(obj, profile, vendor) {
    return (obj.fields || []).map((field) => {
      const sampleValues = profile.samples?.[field.name] || [];
      const fieldWithSamples = { ...field, sampleValues };

      const semantics = detectFieldSemantics(fieldWithSamples);

      // ---- FIX: object-aware reference correction ----
      const inferredRef = inferReferenceLikeField(
        field,
        obj,
        this._allObjects || [],
        this._profiles || {}
      );

      if (inferredRef) {
        semantics.isReferenceField = true;
        semantics.isText = false;
        semantics.isCategorical = false;
        semantics.isExactIdentifierCandidate = false;
      }

      semantics.temporalScore = scoreTemporalField({
        ...semantics,
        temporalObservationCount: sampleValues.filter(_looksLikeDate).length,
      });

      semantics.recencyScore = scoreRecencyField({
        ...semantics,
        name: field.name,
        type: field.type,
      });

      return {
        name: field.name,
        type: field.type,
        is_primary_key: field.is_primary_key || field.primaryKey || false,
        is_foreign_key:
          Boolean(inferredRef) ||
          field.is_foreign_key ||
          field.foreignKey ||
          false,
        references: field.references || inferredRef || null,
        nested_paths: field.nested_paths || [],
        nullable_ratio: profile.nullRatios?.[field.name] ?? null,
        distinct_estimate: profile.distinctCounts?.[field.name] ?? null,
        sample_values: sampleValues.slice(0, 5),
        top_values: profile.topValues?.[field.name] || [],
        min_value: profile.minMax?.[field.name]?.min ?? null,
        max_value: profile.minMax?.[field.name]?.max ?? null,
        semantics,
        confidence: _fieldConfidence(semantics),
        normalized_tokens: tokenizeFieldName(field.name),
      };
    });
  }

  async _profileObjects(objects, options) {
    if (!this._adapter || typeof this._adapter.profileObjects !== "function") {
      return {};
    }
    try {
      return await this._adapter.profileObjects(objects, options);
    } catch {
      return {};
    }
  }
}

/**
 * In-memory catalog store with simple expiry.
 */
class SemanticCatalogStore {
  constructor() {
    this._store = new Map();
    this._ttlMs = 30 * 60 * 1000;
  }

  set(connectionId, catalog) {
    this._store.set(connectionId, {
      catalog,
      builtAt: Date.now(),
      version: catalog.snapshotVersion,
    });
  }

  get(connectionId) {
    const entry = this._store.get(connectionId);
    if (!entry) return null;
    if (Date.now() - entry.builtAt > this._ttlMs) {
      this._store.delete(connectionId);
      return null;
    }
    return entry.catalog;
  }

  getVersion(connectionId) {
    return this._store.get(connectionId)?.version || null;
  }

  invalidate(connectionId) {
    this._store.delete(connectionId);
  }

  invalidateAll() {
    this._store.clear();
  }
}

function _inferEntityLabels(objectName, entityMap) {
  const short = objectName.split(".").pop() || objectName;
  const lower = short.toLowerCase();
  const singular = lower.endsWith("ies")
    ? lower.slice(0, -3) + "y"
    : lower.endsWith("s")
    ? lower.slice(0, -1)
    : lower;

  const labels = [lower];
  if (singular !== lower) labels.push(singular);
  return [...new Set(labels)];
}

function _looksLikeDate(value) {
  if (value instanceof Date) return !isNaN(value.getTime());
  if (typeof value === "string") {
    return (
      /^\d{4}-\d{2}-\d{2}/.test(value.trim()) || /T\d{2}:\d{2}/.test(value)
    );
  }
  if (typeof value === "number") {
    const abs = Math.abs(value);
    return (abs >= 1e12 && abs <= 4e12) || (abs >= 1e9 && abs <= 4e10);
  }
  return false;
}

function _fieldConfidence(semantics = {}) {
  const roles = Array.isArray(semantics.roles) ? semantics.roles : [];
  if (roles.length === 0) return 0.3;
  if (roles.length === 1) return 0.7;
  return 0.9;
}

function _shortName(name = "") {
  return String(name).split(".").pop() || String(name);
}

function _singularize(value = "") {
  if (/ies$/i.test(value)) return value.replace(/ies$/i, "y");
  if (/ses$|xes$|zes$|ches$|shes$/i.test(value))
    return value.replace(/es$/i, "");
  if (/s$/i.test(value) && value.length > 3) return value.replace(/s$/i, "");
  return value;
}

function _tokenOverlap(a = [], b = []) {
  if (!a.length || !b.length) return 0;
  const right = new Set(b);
  let hit = 0;
  for (const token of a) {
    if (right.has(token)) hit++;
  }
  return hit / Math.max(a.length, b.length);
}

function inferReferenceLikeField(
  field,
  currentObject,
  allObjects = [],
  objectProfiles = {}
) {
  if (field.references?.object && field.references?.field) {
    return field.references;
  }

  const fieldName = String(field.name || "").toLowerCase();
  const fieldType = String(field.type || "").toLowerCase();

  // primary keys are not foreign references
  if (field.is_primary_key || field.primaryKey || fieldName === "_id") {
    return null;
  }

  // only attempt for id-like native types
  const isIdLikeType =
    fieldType === "objectid" || fieldType === "uuid" || fieldType === "string"; // keep string for some DBs that store FK as string

  if (!isIdLikeType) return null;

  // generic match against object names
  for (const obj of allObjects) {
    if (!obj?.name || obj.name === currentObject.name) continue;

    const short = String(obj.name).split(".").pop().toLowerCase();
    const singular = short.endsWith("ies")
      ? short.slice(0, -3) + "y"
      : short.endsWith("s") && !short.endsWith("ss")
      ? short.slice(0, -1)
      : short;

    if (
      fieldName === short ||
      fieldName === singular ||
      fieldName === `${singular}_id` ||
      fieldName === `${short}_id`
    ) {
      const pk =
        (obj.primary_keys || obj.primaryKeys || [])[0] ||
        (obj.fields || []).find((f) => f.is_primary_key || f.primaryKey)
          ?.name ||
        "_id";

      return { object: obj.name, field: pk };
    }
  }

  const roleScopedTarget = inferRoleScopedTarget(
    fieldName,
    currentObject,
    allObjects,
    objectProfiles
  );
  if (roleScopedTarget) {
    return {
      object: roleScopedTarget.name,
      field:
        (roleScopedTarget.primary_keys ||
          roleScopedTarget.primaryKeys ||
          [])[0] ||
        (roleScopedTarget.fields || []).find(
          (f) => f.is_primary_key || f.primaryKey
        )?.name ||
        "_id",
    };
  }

  return null;
}

function inferRoleScopedTarget(
  fieldName,
  currentObject,
  allObjects = [],
  objectProfiles = {}
) {
  const fieldLabel = _singularize(String(fieldName || "").toLowerCase());
  const fieldTokens = tokenizeFieldName(fieldLabel);
  if (!fieldTokens.length) return null;

  let best = null;
  let bestScore = 0;

  for (const obj of allObjects) {
    if (!obj?.name || obj.name === currentObject.name) continue;

    const short = _shortName(obj.name).toLowerCase();
    const profile = objectProfiles[obj.name] || {};
    let score = 0;

    if (_hasDisplayLikeField(obj)) {
      score += 0.08;
    }
    score += _scoreObjectNameAgainstField(short, fieldTokens);
    score += _profileMatchesFieldLabel(profile, obj, fieldLabel, fieldTokens);
    score += _scoreReferenceShape(obj, profile);

    if (score > bestScore) {
      bestScore = score;
      best = obj;
    }
  }

  return bestScore >= 0.85 ? best : null;
}

function _hasDisplayLikeField(obj) {
  return (obj.fields || []).some((field) =>
    /(name|title|label|display|summary|description)/i.test(
      String(field.name || "")
    )
  );
}

function _profileMatchesFieldLabel(profile, obj, fieldLabel, fieldTokens) {
  const profileSamples = profile.samples || {};
  const topValues = profile.topValues || {};
  let best = 0;

  for (const field of obj.fields || []) {
    const fieldName = String(field.name || "");
    if (
      !/(role|type|kind|category|group|class|segment|profile)/i.test(fieldName)
    ) {
      continue;
    }

    const values = [
      ...(profileSamples[fieldName] || []),
      ...(topValues[fieldName] || []),
    ]
      .map((value) =>
        String(value || "")
          .toLowerCase()
          .trim()
      )
      .filter(Boolean);

    for (const value of values) {
      const valueTokens = tokenizeFieldName(value);
      const overlap = _tokenOverlap(fieldTokens, valueTokens);
      if (!overlap) continue;

      let score = overlap;
      if (value === fieldLabel) score += 0.75;
      if (value.includes(fieldLabel)) score += 0.25;
      best = Math.max(best, score);
    }
  }

  return Math.min(best, 1.2);
}

function _scoreObjectNameAgainstField(shortName, fieldTokens) {
  const shortTokens = tokenizeFieldName(_singularize(shortName));
  const overlap = _tokenOverlap(fieldTokens, shortTokens);
  if (!overlap) return 0;
  if (overlap === 1) return 0.35;
  return overlap * 0.2;
}

function _scoreReferenceShape(obj, profile) {
  const fieldNames = new Set(
    (obj.fields || []).map((field) => String(field.name || "").toLowerCase())
  );
  const sampleKeys = new Set(
    Object.keys(profile.samples || {}).map((key) =>
      String(key || "").toLowerCase()
    )
  );
  let score = 0;

  if (
    [...fieldNames].some((name) =>
      /(name|title|label|display|summary|description)/.test(name)
    )
  ) {
    score += 0.08;
  }
  if (
    [...fieldNames].some((name) =>
      /(role|type|kind|category|group|class|segment|profile)/.test(name)
    )
  ) {
    score += 0.05;
  }
  if ([...sampleKeys].length >= 2) {
    score += 0.04;
  }

  return score;
}

module.exports = { SemanticCatalogBuilder, SemanticCatalogStore };
