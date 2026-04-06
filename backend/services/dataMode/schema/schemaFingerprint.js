"use strict";

/**
 * SchemaFingerprint.js
 *
 * Computes a deterministic SHA-256 fingerprint of a database schema structure.
 *
 * The fingerprint changes when:
 *   - A collection/table is added or removed
 *   - A field is added or removed
 *   - A field type changes
 *   - Primary key structure changes
 *
 * The fingerprint does NOT change for:
 *   - Row count changes
 *   - Data value changes
 *   - Index changes (not captured in schema introspection)
 *
 * Usage:
 *   const { computeFingerprint, shortFingerprint } = require('./SchemaFingerprint');
 *   const fp = computeFingerprint(snapshot.objects);
 *   if (fp !== cachedFingerprint) { // schema changed }
 */

const crypto = require("crypto");

/**
 * Compute a full SHA-256 fingerprint of a schema object list.
 *
 * @param {Object[]} objects   Array of schema objects (tables/collections)
 * @returns {string}           64-char hex SHA-256 digest
 */
function computeFingerprint(objects = []) {
  const normalized = _normalizeObjects(objects);
  const canonical = JSON.stringify(normalized);
  return crypto.createHash("sha256").update(canonical).digest("hex");
}

/**
 * Short fingerprint — first 16 chars of the SHA-256 digest.
 * Suitable for display, logging, and cache keys.
 * Collision probability is negligible for schema fingerprinting use.
 *
 * @param {Object[]} objects
 * @returns {string}  16-char hex string
 */
function shortFingerprint(objects = []) {
  return computeFingerprint(objects).slice(0, 16);
}

/**
 * Compare two fingerprints.
 *
 * @param {string} a
 * @param {string} b
 * @returns {boolean}  true if identical (no schema change)
 */
function fingerprintsMatch(a, b) {
  return String(a || "") === String(b || "") && String(a || "") !== "";
}

/**
 * Build a fingerprint that covers only a subset of objects (for targeted drift probes).
 *
 * @param {Object[]} objects      Full schema object list
 * @param {string[]} objectNames  Names of objects to include
 * @returns {string}              16-char hex fingerprint
 */
function partialFingerprint(objects = [], objectNames = []) {
  const nameSet = new Set(objectNames.map((n) => String(n).toLowerCase()));
  const filtered = objects.filter((o) =>
    nameSet.has(String(o.name || "").toLowerCase())
  );
  return shortFingerprint(filtered);
}

// ─── Internal ────────────────────────────────────────────────────────────────

function _normalizeObjects(objects) {
  return [...(objects || [])]
    .map((obj) => ({
      n: String(obj.name || ""),
      t: String(obj.type || "collection"),
      f: _normalizeFields(obj.fields || []),
      pk: [...(obj.primary_keys || obj.primaryKeys || [])].sort(),
    }))
    .sort((a, b) => a.n.localeCompare(b.n));
}

function _normalizeFields(fields) {
  return [...fields]
    .map((f) => ({
      n: String(f.name || ""),
      t: String(f.type || "").toLowerCase(),
      pk: Boolean(f.is_primary_key || f.primaryKey),
      fk: Boolean(f.is_foreign_key || f.foreignKey),
    }))
    .sort((a, b) => a.n.localeCompare(b.n));
}

module.exports = {
  computeFingerprint,
  shortFingerprint,
  fingerprintsMatch,
  partialFingerprint,
};
