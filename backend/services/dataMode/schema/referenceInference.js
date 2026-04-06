"use strict";

/**
 * Infer references generically across database families.
 * Never use business-specific words.
 */

function enrichReferences(objects = []) {
  const byName = new Map();
  for (const obj of objects) {
    byName.set(String(obj.name || "").toLowerCase(), obj);
    byName.set(_shortName(obj.name).toLowerCase(), obj);
  }

  return objects.map((obj) => ({
    ...obj,
    fields: (obj.fields || []).map((field) => {
      if (field.references?.object && field.references?.field) {
        return field;
      }

      const inferred = inferFieldReference(field, obj, objects, byName);
      if (!inferred) return field;

      return {
        ...field,
        is_foreign_key: true,
        references: inferred,
      };
    }),
  }));
}

function inferFieldReference(field, currentObject, objects, byName) {
  const fieldName = String(field.name || "");
  const lower = fieldName.toLowerCase();
  const type = String(field.type || "").toLowerCase();

  // obvious PK never becomes FK
  if (field.is_primary_key || field.primaryKey || lower === "_id") return null;

  // strongest generic FK pattern: *_id / *Id / id
  const idMatch = lower.match(/^(.+?)_?(?:id)$/i);
  if (idMatch) {
    const entity = idMatch[1];
    const target = _findTargetObject(entity, currentObject, objects, byName);
    if (target) {
      return { object: target.name, field: _findPkField(target) };
    }
  }

  // Mongo/ObjectId plain reference names can point directly at another object
  if (type === "objectid" || type === "uuid") {
    const target = _findTargetObject(lower, currentObject, objects, byName);
    if (target) {
      return { object: target.name, field: _findPkField(target) };
    }
  }

  return null;
}

function _findTargetObject(entity, currentObject, objects, byName) {
  const candidates = [];
  const norm = _singularize(String(entity || "").toLowerCase());

  const direct =
    byName.get(norm) || byName.get(norm + "s") || byName.get(norm + "es");
  if (direct && direct.name !== currentObject.name) {
    candidates.push({ obj: direct, score: 1.0 });
  }

  for (const obj of objects) {
    if (obj.name === currentObject.name) continue;
    const short = _shortName(obj.name).toLowerCase();
    const shortSingular = _singularize(short);

    if (shortSingular === norm) {
      candidates.push({ obj, score: 0.95 });
      continue;
    }

    const overlap = _tokenOverlap(_tokens(norm), _tokens(shortSingular));
    if (overlap >= 0.8) {
      candidates.push({ obj, score: 0.7 + overlap * 0.1 });
    }
  }

  if (!candidates.length) return null;
  candidates.sort(
    (a, b) => b.score - a.score || a.obj.name.length - b.obj.name.length
  );
  return candidates[0].obj;
}

function _findPkField(obj) {
  const pk = (obj.primary_keys || obj.primaryKeys || [])[0];
  if (pk) return pk;

  const field =
    (obj.fields || []).find((f) => f.is_primary_key || f.primaryKey) ||
    (obj.fields || []).find((f) => String(f.name || "") === "_id") ||
    (obj.fields || []).find((f) => /(^|_)id$/i.test(String(f.name || "")));

  return field?.name || "_id";
}

function _shortName(name = "") {
  return String(name).split(".").pop() || String(name);
}

function _singularize(s = "") {
  if (s.endsWith("ies")) return s.slice(0, -3) + "y";
  if (s.endsWith("ses")) return s.slice(0, -2);
  if (s.endsWith("s") && !s.endsWith("ss")) return s.slice(0, -1);
  return s;
}

function _tokens(text = "") {
  return String(text)
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function _tokenOverlap(a = [], b = []) {
  if (!a.length || !b.length) return 0;
  const bs = new Set(b);
  let hit = 0;
  for (const t of a) if (bs.has(t)) hit++;
  return hit / Math.max(a.length, b.length);
}

module.exports = { enrichReferences };
