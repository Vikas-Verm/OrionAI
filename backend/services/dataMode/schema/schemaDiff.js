"use strict";

/**
 * SchemaDiff.js
 *
 * Compares two SchemaSnapshots and classifies every change.
 *
 * Change kinds:
 *   object_added            — new table/collection appeared
 *   object_removed          — table/collection no longer exists
 *   field_added             — new field in an existing object
 *   field_removed           — field was removed (breaking — may break queries)
 *   field_renamed_suspected — field removed + similar-named field added
 *   type_changed            — field type changed (breaking — may break temporal/metric queries)
 *   primary_key_changed     — PK set changed
 *   nested_path_changed     — MongoDB nested path structure changed
 *
 * Severity:
 *   non_breaking — safe to continue with cached catalog (just rebuild the new object)
 *   breaking     — must invalidate any query plan that references this object/field
 *   critical     — must do a full catalog rebuild before retrying
 *
 * Usage:
 *   const { diffSnapshots } = require('./SchemaDiff');
 *   const result = diffSnapshots(previousSnapshot, currentSnapshot);
 *   if (result.hasBreakingChanges) { // rebuild catalog }
 */

/**
 * Diff two schema snapshots.
 *
 * @param {Object} prev   Previous SchemaSnapshot
 * @param {Object} next   Current SchemaSnapshot
 * @returns {DiffResult}
 */
function diffSnapshots(prev, next) {
  const changes = [];

  const prevObjects = new Map((prev?.objects || []).map((o) => [o.name, o]));
  const nextObjects = new Map((next?.objects || []).map((o) => [o.name, o]));

  // ── Object-level changes ──────────────────────────────────────────────────
  for (const [name] of prevObjects) {
    if (!nextObjects.has(name)) {
      changes.push({
        kind: "object_removed",
        object: name,
        severity: "breaking",
        message: `Table/collection "${name}" was removed`,
      });
    }
  }

  for (const [name] of nextObjects) {
    if (!prevObjects.has(name)) {
      changes.push({
        kind: "object_added",
        object: name,
        severity: "non_breaking",
        message: `Table/collection "${name}" was added`,
      });
    }
  }

  // ── Field-level changes for objects present in both snapshots ─────────────
  for (const [name, prevObj] of prevObjects) {
    const nextObj = nextObjects.get(name);
    if (!nextObj) continue;

    const prevFields = new Map((prevObj.fields || []).map((f) => [f.name, f]));
    const nextFields = new Map((nextObj.fields || []).map((f) => [f.name, f]));

    const removed = [];
    const added = [];

    for (const [fn] of prevFields) {
      if (!nextFields.has(fn)) {
        removed.push(fn);
        changes.push({
          kind: "field_removed",
          object: name,
          field: fn,
          severity: "breaking",
          message: `Field "${fn}" was removed from "${name}"`,
        });
      }
    }

    for (const [fn, nf] of nextFields) {
      if (!prevFields.has(fn)) {
        added.push(fn);
        changes.push({
          kind: "field_added",
          object: name,
          field: fn,
          severity: "non_breaking",
          message: `Field "${fn}" was added to "${name}"`,
        });
        continue;
      }

      const pf = prevFields.get(fn);

      // Type change
      if (_normalizeType(pf.type) !== _normalizeType(nf.type)) {
        changes.push({
          kind: "type_changed",
          object: name,
          field: fn,
          from: pf.type,
          to: nf.type,
          severity: "breaking",
          message: `Field "${fn}" type changed from "${pf.type}" to "${nf.type}" in "${name}"`,
        });
      }
    }

    // Suspected renames: field removed + similar-named field added
    for (const rem of removed) {
      for (const add of added) {
        const sim = _stringSimilarity(rem, add);
        if (sim >= 0.72) {
          changes.push({
            kind: "field_renamed_suspected",
            object: name,
            from: rem,
            to: add,
            similarity: Number(sim.toFixed(2)),
            severity: "breaking",
            message: `Field "${rem}" may have been renamed to "${add}" in "${name}" (similarity: ${(
              sim * 100
            ).toFixed(0)}%)`,
          });
        }
      }
    }

    // Primary key changes
    const prevPks = new Set(prevObj.primary_keys || prevObj.primaryKeys || []);
    const nextPks = new Set(nextObj.primary_keys || nextObj.primaryKeys || []);
    if (!_setsEqual(prevPks, nextPks)) {
      changes.push({
        kind: "primary_key_changed",
        object: name,
        from: [...prevPks],
        to: [...nextPks],
        severity: "critical",
        message: `Primary key changed in "${name}"`,
      });
    }
  }

  const breakingChanges = changes.filter(
    (c) => c.severity === "breaking" || c.severity === "critical"
  );
  const criticalChanges = changes.filter((c) => c.severity === "critical");
  const hasBreakingChanges = breakingChanges.length > 0;
  const hasMajorDrift =
    breakingChanges.length >= 3 || criticalChanges.length > 0;

  /**
   * Which objects are safe to use from cache (not touched by breaking changes).
   */
  const safeObjects = (prev?.objects || [])
    .map((o) => o.name)
    .filter((name) => !breakingChanges.some((c) => c.object === name));

  /**
   * Which objects need their catalog entries rebuilt.
   */
  const staleObjects = [...new Set(breakingChanges.map((c) => c.object))];

  return {
    changes,
    hasBreakingChanges,
    hasMajorDrift,
    safeObjects,
    staleObjects,
    summary: _buildSummary(changes),
  };
}

/**
 * Returns true if there are no changes between the two snapshots.
 */
function schemasAreIdentical(prev, next) {
  const result = diffSnapshots(prev, next);
  return result.changes.length === 0;
}

/**
 * Filter diff result to only changes affecting specific objects.
 * Useful for targeted refresh logic.
 */
function diffForObjects(diffResult, objectNames) {
  const nameSet = new Set(objectNames);
  return {
    ...diffResult,
    changes: diffResult.changes.filter((c) => nameSet.has(c.object)),
  };
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function _normalizeType(t) {
  return String(t || "")
    .toLowerCase()
    .replace(/\s+/g, "");
}

function _setsEqual(a, b) {
  if (a.size !== b.size) return false;
  for (const item of a) if (!b.has(item)) return false;
  return true;
}

function _stringSimilarity(a, b) {
  const la = String(a || "").toLowerCase();
  const lb = String(b || "").toLowerCase();
  const longer = la.length >= lb.length ? la : lb;
  const shorter = la.length >= lb.length ? lb : la;
  if (longer.length === 0) return 1.0;
  if (longer.includes(shorter) || shorter.includes(longer)) return 0.85;
  const dist = _editDistance(la, lb);
  return (longer.length - dist) / longer.length;
}

function _editDistance(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) =>
      i === 0 ? j : j === 0 ? i : 0
    )
  );
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[a.length][b.length];
}

function _buildSummary(changes) {
  if (!changes.length) return "No schema changes detected.";
  const counts = {};
  for (const c of changes) counts[c.kind] = (counts[c.kind] || 0) + 1;
  return Object.entries(counts)
    .map(([kind, n]) => `${n} ${kind.replace(/_/g, " ")}`)
    .join(", ");
}

module.exports = { diffSnapshots, schemasAreIdentical, diffForObjects };
