"use strict";

/**
 * RelationGraphBuilder.js
 *
 * Infers join/relation graph between collections/tables.
 * Uses naming conventions and FK patterns — no LLM.
 *
 * Strategies:
 * 1. Explicit FK declarations (SQL information_schema)
 * 2. Convention-based inference: <entity>_id → target primary key
 * 3. Matching on known entity patterns
 */

/**
 * Build a relation graph from schema objects.
 *
 * @param {Object[]} objects   Array of schema objects (tables/collections)
 * @param {string}   vendor    Database vendor
 * @returns {{ relations: Relation[], entityMap: Object }}
 */
function buildRelationGraph(objects, vendor = "mongodb") {
  const relations = [];
  const entityMap = {}; // entityLabel → objectName[]

  // Build object lookup: lowercase name → object
  const byName = new Map();
  for (const obj of objects) {
    byName.set(obj.name.toLowerCase(), obj);
    byName.set(_shortName(obj.name).toLowerCase(), obj);

    // Populate entity map (plural → singular entity)
    const entity = _singularize(_shortName(obj.name).toLowerCase());
    if (!entityMap[entity]) entityMap[entity] = [];
    entityMap[entity].push(obj.name);
  }

  // For each object, scan its fields for FK-like patterns
  for (const obj of objects) {
    for (const field of obj.fields || []) {
      const fn = String(field.name || "");

      // Explicit FK
      if (field.references?.object && field.references?.field) {
        relations.push({
          from_object: obj.name,
          from_field: field.name,
          to_object: field.references.object,
          to_field: field.references.field,
          confidence: 1.0,
          source: "explicit_fk",
        });
        continue;
      }

      // Convention: something_id → Somethings (or Something)
      const idMatch = fn.match(/^(.+?)_?(?:id|_id|Id)$/i);
      if (idMatch) {
        const entityName = idMatch[1].toLowerCase();
        const targetObj = _findTarget(entityName, byName, objects);
        if (targetObj && targetObj.name !== obj.name) {
          const toField = _findPkField(targetObj, vendor);
          relations.push({
            from_object: obj.name,
            from_field: field.name,
            to_object: targetObj.name,
            to_field: toField,
            confidence: 0.65,
            source: "convention_id_suffix",
          });
        }
        continue;
      }

      // Generic display-field convention: <entity>_<displayish>
      const nameMatch = fn.match(
        /^(.+?)_(?:name|code|title|label|display|display_name|ref|number|no)$/i
      );
      if (nameMatch) {
        const entityName = nameMatch[1].toLowerCase();
        const targetObj = _findTarget(entityName, byName, objects);
        if (targetObj && targetObj.name !== obj.name) {
          // Only infer if target has a "name/code" field
          const targetField = _findDisplayField(targetObj);
          if (targetField) {
            relations.push({
              from_object: obj.name,
              from_field: field.name,
              to_object: targetObj.name,
              to_field: targetField,
              confidence: 0.35,
              source: "convention_name_suffix",
              is_display: true,
            });
          }
        }
      }
    }
  }

  // Deduplicate
  const seen = new Set();
  const deduplicated = relations.filter((r) => {
    const key = `${r.from_object}:${r.from_field}→${r.to_object}:${r.to_field}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { relations: deduplicated, entityMap };
}

/**
 * Find a relation path between two objects.
 * Returns the shortest path or null.
 */
function findJoinPath(relations, fromObject, toObject) {
  if (fromObject === toObject) return [];

  // Direct relation
  const direct = relations.find(
    (r) =>
      (r.from_object === fromObject && r.to_object === toObject) ||
      (r.from_object === toObject && r.to_object === fromObject)
  );
  if (direct) return [direct];

  // One-hop via intermediate (BFS)
  const intermediates = new Set();
  for (const r of relations) {
    if (r.from_object === fromObject) intermediates.add(r.to_object);
    if (r.to_object === fromObject) intermediates.add(r.from_object);
  }
  for (const mid of intermediates) {
    const leg1 = relations.find(
      (r) =>
        (r.from_object === fromObject && r.to_object === mid) ||
        (r.from_object === mid && r.to_object === fromObject)
    );
    const leg2 = relations.find(
      (r) =>
        (r.from_object === mid && r.to_object === toObject) ||
        (r.from_object === toObject && r.to_object === mid)
    );
    if (leg1 && leg2) return [leg1, leg2];
  }

  return null; // no path found
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function _shortName(name = "") {
  return name.split(".").pop() || name;
}

function _singularize(word = "") {
  if (/ies$/i.test(word)) return word.replace(/ies$/i, "y");
  if (/ses$|xes$|zes$|ches$|shes$/i.test(word)) return word.replace(/es$/, "");
  if (/s$/i.test(word) && word.length > 3) return word.replace(/s$/, "");
  return word;
}

function _findTarget(entityName, byName, objects) {
  // Try exact, plural, variations
  const attempts = [
    entityName,
    entityName + "s",
    entityName + "es",
    entityName + "ies".replace(/y$/, ""),
  ];
  for (const a of attempts) {
    const found = byName.get(a);
    if (found) return found;
  }
  // Partial match
  for (const obj of objects) {
    if (
      _shortName(obj.name).toLowerCase().startsWith(entityName) ||
      entityName.startsWith(_singularize(_shortName(obj.name).toLowerCase()))
    ) {
      return obj;
    }
  }
  return null;
}

function _findPkField(obj, vendor) {
  if (vendor === "mongodb") return "_id";
  const pk = obj.primary_keys || [];
  if (pk.length) return pk[0];
  // Common id field names
  for (const f of obj.fields || []) {
    if (/^(id|_id|uuid)$/i.test(f.name)) return f.name;
  }
  return "id";
}

function _findDisplayField(obj) {
  for (const f of obj.fields || []) {
    if (/^(name|title|label|code|ref)$/i.test(f.name)) return f.name;
    if (/(name|title)$/.test(f.name)) return f.name;
  }
  return null;
}

module.exports = { buildRelationGraph, findJoinPath };
