"use strict";

const { SQLCompiler } = require("../compiler/sqlCompiler");

/**
 * ReferenceEnricher
 *
 * Post-processes query result rows:
 * - resolves reference fields using schema/catalog metadata
 * - replaces raw ObjectIds with small human-readable objects
 * - keeps only important fields from referenced docs
 */

class ReferenceEnricher {
  constructor(adapter, catalog) {
    this._adapter = adapter;
    this._catalog = catalog;
    this._objectsByName = new Map();

    for (const obj of catalog?.objects || []) {
      this._objectsByName.set(String(obj.name || "").toLowerCase(), obj);
      this._objectsByName.set(_shortName(obj.name).toLowerCase(), obj);
    }
  }

  async enrichRows(rows, sourceObjectName) {
    if (!Array.isArray(rows) || rows.length === 0) return rows;

    const sourceObj = this._findObject(sourceObjectName);
    if (!sourceObj) return rows;

    const refFields = (sourceObj.fields || [])
      .map((field) => {
        const sem = field.semantics || {};
        if (!(sem.isReferenceField || field.is_foreign_key)) return null;

        const reference = _normalizeReference(field.references);
        if (!reference) return null;

        return {
          ...field,
          references: reference,
        };
      })
      .filter(Boolean);

    if (!refFields.length) return rows;

    const fetchPlan = new Map();
    for (const field of refFields) {
      const refObjName = field.references.object;
      const refFieldName = field.references.field;

      for (const row of rows) {
        const rawVal = row[field.name];
        if (rawVal == null) continue;

        const ids = Array.isArray(rawVal) ? rawVal : [rawVal];
        for (const id of ids) {
          if (id == null) continue;
          const key = `${refObjName}::${refFieldName}`;
          if (!fetchPlan.has(key)) {
            fetchPlan.set(key, {
              object: refObjName,
              field: refFieldName,
              ids: new Map(),
            });
          }
          fetchPlan.get(key).ids.set(_stableRefKey(id), id);
        }
      }
    }

    const fetched = new Map();

    for (const plan of fetchPlan.values()) {
      const ids = [...plan.ids.values()];
      if (!ids.length) continue;

      const relatedObj = this._findObject(plan.object);
      const displayFields = _pickImportantFields(relatedObj);
      let result;
      try {
        result = await this._executeReferenceLookup(
          plan.object,
          plan.field,
          ids,
          relatedObj
        );
      } catch {
        continue;
      }

      const objectMap = new Map();
      for (const doc of result.rows || []) {
        const key = _stableRefKey(doc[plan.field] ?? doc._id);
        objectMap.set(key, _compactDoc(doc, displayFields));
      }

      fetched.set(`${plan.object}::${plan.field}`, objectMap);
    }

    return rows.map((row) => {
      const out = { ...row };

      for (const field of refFields) {
        const refKey = `${field.references.object}::${
          field.references.field || "_id"
        }`;
        const objectMap = fetched.get(refKey);
        if (!objectMap) continue;

        const rawVal = row[field.name];
        if (rawVal == null) continue;

        if (Array.isArray(rawVal)) {
          out[field.name] = rawVal.map((id) => {
            return objectMap.get(_stableRefKey(id)) || {
              _id: _stableRefKey(id),
            };
          });
        } else {
          out[field.name] = objectMap.get(_stableRefKey(rawVal)) || {
            _id: _stableRefKey(rawVal),
          };
        }
      }

      return out;
    });
  }

  _findObject(name = "") {
    return (
      this._objectsByName.get(String(name || "").toLowerCase()) ||
      this._objectsByName.get(_shortName(name).toLowerCase()) ||
      null
    );
  }

  async _executeReferenceLookup(objectName, fieldName, ids, relatedObj) {
    const normalizedObjectName = String(objectName || "").trim();
    const normalizedFieldName = String(fieldName || "_id").trim() || "_id";

    if (!ids.length || !normalizedObjectName) {
      return { rows: [], rowCount: 0 };
    }

    if (this._adapter.vendor === "mongodb") {
      return this._adapter.executePlan({
        kind: "mongo",
        operation: "find",
        collection: normalizedObjectName,
        query: {
          [normalizedFieldName]: { $in: ids },
        },
        projection: {},
        limit: Math.min(ids.length, 200),
      });
    }

    const capabilities = this._adapter.detectCapabilities?.() || {};
    const fieldType =
      (relatedObj?.fields || []).find(
        (field) => field.name === normalizedFieldName
      )?.type || "";
    const compiler = new SQLCompiler(this._adapter.vendor, capabilities);
    const physicalPlan = compiler.compile({
      source: normalizedObjectName,
      intent: "list",
      joins: [],
      filters: [
        {
          field: normalizedFieldName,
          op: "in",
          value: ids,
          field_type: fieldType,
          logical: "and",
        },
      ],
      group_by: [],
      metrics: [],
      having: [],
      sort: [],
      projection: "full_record",
      limit: Math.min(ids.length, 200),
      time_range: null,
      compare_windows: [],
      confidence: 1,
      explanation: "reference enrichment lookup",
    });

    return this._adapter.executePlan(physicalPlan);
  }
}

function _normalizeReference(reference) {
  if (!reference || typeof reference !== "object") return null;

  const object = String(reference.object || "").trim();
  if (!object) return null;

  const field = String(reference.field || "_id").trim() || "_id";
  return { object, field };
}

function _shortName(name = "") {
  return String(name).split(".").pop() || String(name);
}

function _pickImportantFields(obj) {
  if (!obj) return ["_id"];

  const candidateDisplay = obj.candidate_display_fields || [];
  const fields = obj.fields || [];

  const semanticDisplay = fields
    .filter((f) => f.semantics?.isDisplayCandidate)
    .map((f) => f.name);

  const exactId = fields
    .filter((f) => f.semantics?.isExactIdentifierCandidate)
    .map((f) => f.name);

  const categorical = fields
    .filter(
      (f) =>
        f.semantics?.isCategorical ||
        f.semantics?.isBoolean ||
        f.semantics?.isNumeric === true
    )
    .map((f) => f.name);

  const scalarFallback = fields
    .filter(
      (f) =>
        !f.semantics?.isReferenceField &&
        !f.is_primary_key &&
        !f.is_foreign_key &&
        !["object", "array", "json", "mixed"].includes(
          String(f.type || "").toLowerCase()
        )
    )
    .map((f) => f.name);

  const base = [
    ...candidateDisplay,
    ...semanticDisplay,
    ...exactId,
    ...categorical,
    ...scalarFallback,
    "_id",
  ];

  return [...new Set(base)].slice(0, 5);
}

function _compactDoc(doc, fields) {
  const out = {};
  for (const key of fields) {
    if (doc[key] !== undefined && doc[key] !== null) {
      out[key] = _normalizeReferenceValue(doc[key]);
    }
  }

  if (Object.keys(out).length === 0 && doc._id != null) {
    out._id = _stableRefKey(doc._id);
  }

  return out;
}

function _normalizeReferenceValue(value, depth = 0) {
  if (value == null) return value;
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) return value.toString("hex");
  if (_isObjectIdLike(value)) return _stableRefKey(value);
  if (Array.isArray(value)) {
    return value.slice(0, 5).map((item) => _normalizeReferenceValue(item, depth + 1));
  }
  if (typeof value === "object") {
    if (depth >= 1) {
      return _stableRefKey(value);
    }
    const out = {};
    for (const [key, nestedValue] of Object.entries(value).slice(0, 5)) {
      out[key] = _normalizeReferenceValue(nestedValue, depth + 1);
    }
    return out;
  }
  return value;
}

function _stableRefKey(value) {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) return value.toString("hex");
  if (_isObjectIdLike(value)) {
    if (typeof value.toHexString === "function") return value.toHexString();
    return String(value);
  }
  if (typeof value === "object") {
    if (value._id != null) return _stableRefKey(value._id);
    if (typeof value.toString === "function") {
      const rendered = value.toString();
      if (rendered && rendered !== "[object Object]") return rendered;
    }
    return JSON.stringify(value);
  }
  return String(value);
}

function _isObjectIdLike(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      (value._bsontype === "ObjectID" || value._bsontype === "ObjectId")
  );
}

module.exports = { ReferenceEnricher };
