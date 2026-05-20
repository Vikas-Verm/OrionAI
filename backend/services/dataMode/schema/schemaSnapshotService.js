"use strict";

const crypto = require("crypto");

// ═══════════════════════════════════════════════════════════════════════════════
// SchemaFingerprint.js
// Deterministic SHA-256 fingerprint of a schema structure.
// Changes in field names, types, or object set all change the fingerprint.
// ═══════════════════════════════════════════════════════════════════════════════

function computeFingerprint(objects = []) {
  const normalized = objects
    .map((obj) => ({
      name: String(obj.name || ""),
      fields: (obj.fields || [])
        .map((f) => ({ n: String(f.name || ""), t: String(f.type || "").toLowerCase() }))
        .sort((a, b) => a.n.localeCompare(b.n)),
      pks: (obj.primary_keys || []).slice().sort(),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return crypto
    .createHash("sha256")
    .update(JSON.stringify(normalized))
    .digest("hex")
    .slice(0, 16); // 16-char prefix is enough for fingerprinting
}

// ═══════════════════════════════════════════════════════════════════════════════
// SchemaDiff.js
// Compares two schema snapshots and classifies changes.
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Diff two schema snapshots.
 *
 * @param {Object} prev  Previous SchemaSnapshot
 * @param {Object} next  Current SchemaSnapshot
 * @returns {{ changes: Change[], hasBreakingChanges: boolean, hasMajorDrift: boolean }}
 */
function diffSnapshots(prev, next) {
  const changes = [];

  const prevByName = new Map((prev.objects || []).map((o) => [o.name, o]));
  const nextByName = new Map((next.objects || []).map((o) => [o.name, o]));

  // Objects removed
  for (const [name] of prevByName) {
    if (!nextByName.has(name)) {
      changes.push({ kind: "object_removed", object: name, severity: "breaking" });
    }
  }

  // Objects added
  for (const [name] of nextByName) {
    if (!prevByName.has(name)) {
      changes.push({ kind: "object_added", object: name, severity: "non_breaking" });
    }
  }

  // Field-level diffs for objects that exist in both
  for (const [name, prevObj] of prevByName) {
    const nextObj = nextByName.get(name);
    if (!nextObj) continue;

    const prevFields = new Map((prevObj.fields || []).map((f) => [f.name, f]));
    const nextFields = new Map((nextObj.fields || []).map((f) => [f.name, f]));

    for (const [fn] of prevFields) {
      if (!nextFields.has(fn)) {
        changes.push({ kind: "field_removed", object: name, field: fn, severity: "breaking" });
      }
    }

    for (const [fn, nf] of nextFields) {
      if (!prevFields.has(fn)) {
        changes.push({ kind: "field_added", object: name, field: fn, severity: "non_breaking" });
        continue;
      }
      const pf = prevFields.get(fn);
      if (String(pf.type || "").toLowerCase() !== String(nf.type || "").toLowerCase()) {
        changes.push({ kind: "type_changed", object: name, field: fn, from: pf.type, to: nf.type, severity: "breaking" });
      }
    }

    // Heuristic: field removed + similar-named field added → suspected rename
    const removedFields = changes.filter((c) => c.kind === "field_removed" && c.object === name).map((c) => c.field);
    const addedFields   = changes.filter((c) => c.kind === "field_added"   && c.object === name).map((c) => c.field);
    for (const rem of removedFields) {
      for (const add of addedFields) {
        const similarity = _strSimilarity(rem, add);
        if (similarity > 0.7) {
          changes.push({ kind: "field_renamed_suspected", object: name, from: rem, to: add, similarity, severity: "breaking" });
        }
      }
    }
  }

  const hasBreakingChanges = changes.some((c) => c.severity === "breaking");
  const hasMajorDrift      = changes.filter((c) => c.severity === "breaking").length >= 3;

  return { changes, hasBreakingChanges, hasMajorDrift };
}

function _strSimilarity(a, b) {
  const longer  = a.length > b.length ? a : b;
  const shorter = a.length > b.length ? b : a;
  if (longer.length === 0) return 1.0;
  if (longer.toLowerCase().includes(shorter.toLowerCase())) return 0.85;
  const editDist = _editDistance(a.toLowerCase(), b.toLowerCase());
  return (longer.length - editDist) / longer.length;
}

function _editDistance(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[a.length][b.length];
}

// ═══════════════════════════════════════════════════════════════════════════════
// SchemaSnapshotService.js
// Builds, caches, and retrieves schema snapshots.
// ═══════════════════════════════════════════════════════════════════════════════

class SchemaSnapshotService {
  constructor() {
    this._cache = new Map(); // connectionId → { snapshot, cachedAt }
    this._ttlMs = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Build a schema snapshot from an adapter.
   *
   * @param {string} connectionId
   * @param {Object} adapter
   * @param {{ force?: boolean }} options
   * @returns {Promise<SchemaSnapshot>}
   */
  async getSnapshot(connectionId, adapter, options = {}) {
    if (!options.force) {
      const cached = this._cache.get(connectionId);
      if (cached && Date.now() - cached.cachedAt < this._ttlMs) {
        return cached.snapshot;
      }
    }

    const snapshot = await this._buildSnapshot(connectionId, adapter);
    this._cache.set(connectionId, { snapshot, cachedAt: Date.now() });
    return snapshot;
  }

  async _buildSnapshot(connectionId, adapter) {
    const raw  = await adapter.introspectSchema();
    const objects = raw.objects || raw.tables || [];

    // Normalise to common shape
    const normalizedObjects = objects.map((obj) => ({
      name:           obj.name,
      type:           obj.type || "collection",
      fields:         (obj.fields || []).map((f) => ({
        name:           f.name,
        type:           f.type || "mixed",
        nullable:       f.nullable ?? true,
        is_primary_key: f.primaryKey || f.is_primary_key || false,
        is_foreign_key: f.foreignKey || f.is_foreign_key || false,
        references:     f.references || null,
        nested_paths:   f.nested_paths || [],
      })),
      primary_keys:   obj.primaryKeys || obj.primary_keys || [],
      estimated_rows: obj.estimatedRows ?? obj.estimated_rows ?? null,
    }));

    const fingerprint  = computeFingerprint(normalizedObjects);
    const capabilities = adapter.detectCapabilities?.() || {};

    return {
      connectionId,
      vendor:       raw.vendor,
      family:       _vendorFamily(raw.vendor),
      fingerprint,
      capturedAt:   new Date().toISOString(),
      objects:      normalizedObjects,
      capabilities,
    };
  }

  /**
   * Compare the cached snapshot fingerprint to a live probe.
   * Returns { drifted, diff } where diff may be null if no drift.
   */
  async probe(connectionId, adapter) {
    const cached = this._cache.get(connectionId);
    if (!cached) return { drifted: true, diff: null, reason: "no_cached_snapshot" };

    let liveSnapshot;
    try {
      liveSnapshot = await this._buildSnapshot(connectionId, adapter);
    } catch (err) {
      return { drifted: false, diff: null, reason: "probe_failed", error: err.message };
    }

    if (cached.snapshot.fingerprint === liveSnapshot.fingerprint) {
      return { drifted: false, diff: null };
    }

    const diff = diffSnapshots(cached.snapshot, liveSnapshot);
    // Update cache with live snapshot
    this._cache.set(connectionId, { snapshot: liveSnapshot, cachedAt: Date.now() });
    return { drifted: true, diff, liveSnapshot };
  }

  invalidate(connectionId) {
    this._cache.delete(connectionId);
  }
}

function _vendorFamily(vendor) {
  const map = {
    mongodb:    "document",
    postgres:   "relational",
    mysql:      "relational",
    sqlite:     "relational",
    bigquery:   "warehouse",
    snowflake:  "warehouse",
    redshift:   "warehouse",
    clickhouse: "warehouse",
    elasticsearch: "search",
    neo4j:      "graph",
    dynamodb:   "kv",
  };
  return map[String(vendor || "").toLowerCase()] || "relational";
}

module.exports = { SchemaSnapshotService, computeFingerprint, diffSnapshots };