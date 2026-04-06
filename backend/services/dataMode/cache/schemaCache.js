"use strict";

/**
 * SchemaCache.js
 *
 * Caches SchemaSnapshot objects, keyed by connectionId.
 * TTL: 5 minutes (schema rarely changes mid-session).
 *
 * In production this can be replaced with a Redis-backed version
 * by implementing the same interface:
 *   getSnapshot(connectionId) → snapshot | null
 *   setSnapshot(connectionId, snapshot) → void
 *   invalidate(connectionId) → void
 *   invalidateAll() → void
 */

const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes

class SchemaCache {
  /**
   * @param {Object} [options]
   * @param {number} [options.ttlMs]   TTL in milliseconds (default 5 min)
   */
  constructor(options = {}) {
    this._ttlMs = options.ttlMs || DEFAULT_TTL_MS;
    this._store = new Map(); // connectionId → { snapshot, setAt, fingerprint }
  }

  /**
   * Retrieve a cached snapshot.
   * Returns null if missing or expired.
   *
   * @param {string} connectionId
   * @returns {Object|null}  SchemaSnapshot or null
   */
  getSnapshot(connectionId) {
    const key = _key(connectionId);
    const entry = this._store.get(key);
    if (!entry) return null;
    if (Date.now() - entry.setAt > this._ttlMs) {
      this._store.delete(key);
      return null;
    }
    return entry.snapshot;
  }

  /**
   * Store a snapshot.
   *
   * @param {string} connectionId
   * @param {Object} snapshot    SchemaSnapshot
   */
  setSnapshot(connectionId, snapshot) {
    this._store.set(_key(connectionId), {
      snapshot,
      setAt: Date.now(),
      fingerprint: snapshot.fingerprint || null,
    });
  }

  /**
   * Get only the fingerprint without loading the full snapshot.
   * Useful for cheap drift probes.
   *
   * @param {string} connectionId
   * @returns {string|null}
   */
  getFingerprint(connectionId) {
    const entry = this._store.get(_key(connectionId));
    if (!entry || Date.now() - entry.setAt > this._ttlMs) return null;
    return entry.fingerprint;
  }

  /**
   * Check if a cached snapshot is still fresh (not expired).
   *
   * @param {string} connectionId
   * @returns {boolean}
   */
  isFresh(connectionId) {
    const entry = this._store.get(_key(connectionId));
    return Boolean(entry && Date.now() - entry.setAt <= this._ttlMs);
  }

  /**
   * Invalidate a specific connection's snapshot.
   * Forces the next getSnapshot call to reload from the database.
   *
   * @param {string} connectionId
   */
  invalidate(connectionId) {
    this._store.delete(_key(connectionId));
  }

  /**
   * Invalidate all cached snapshots.
   * Use when doing a system-wide refresh.
   */
  invalidateAll() {
    this._store.clear();
  }

  /**
   * Number of cached snapshots.
   */
  size() {
    return this._store.size;
  }

  /**
   * Age of a cached snapshot in milliseconds.
   * Returns Infinity if not cached.
   *
   * @param {string} connectionId
   * @returns {number}
   */
  ageMs(connectionId) {
    const entry = this._store.get(_key(connectionId));
    return entry ? Date.now() - entry.setAt : Infinity;
  }
}

function _key(id) {
  return `schema:${String(id || "")}`;
}

module.exports = { SchemaCache };
