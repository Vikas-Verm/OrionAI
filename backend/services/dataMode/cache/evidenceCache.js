"use strict";

/**
 * EvidenceCache.js
 *
 * Caches the result of targeted evidence probes.
 * TTL: 2 minutes (evidence must be reasonably fresh for query planning).
 *
 * Keys are structured as:
 *   `{connectionId}:{objectName}:{intentKey}`
 *
 * This lets us invalidate all evidence for a connection (on drift)
 * or just for a specific object (on targeted refresh).
 */

const DEFAULT_TTL_MS = 2 * 60 * 1000; // 2 minutes

class EvidenceCache {
  /**
   * @param {Object} [options]
   * @param {number} [options.ttlMs]  TTL in milliseconds (default 2 min)
   */
  constructor(options = {}) {
    this._ttlMs = options.ttlMs || DEFAULT_TTL_MS;
    this._store = new Map();
  }

  /**
   * Retrieve cached evidence.
   *
   * @param {string} connectionId
   * @param {string} objectName
   * @param {string} intentKey   A stable string derived from the intent (entity + roles)
   * @returns {Object|null}  Evidence object or null if missing/expired
   */
  get(connectionId, objectName, intentKey) {
    const key = _key(connectionId, objectName, intentKey);
    const entry = this._store.get(key);
    if (!entry) return null;
    if (Date.now() - entry.setAt > this._ttlMs) {
      this._store.delete(key);
      return null;
    }
    return entry.evidence;
  }

  /**
   * Store evidence.
   *
   * @param {string} connectionId
   * @param {string} objectName
   * @param {string} intentKey
   * @param {Object} evidence
   */
  set(connectionId, objectName, intentKey, evidence) {
    this._store.set(_key(connectionId, objectName, intentKey), {
      evidence,
      setAt: Date.now(),
    });
  }

  /**
   * Invalidate all evidence for a connection.
   * Called when schema drift is detected for this connection.
   *
   * @param {string} connectionId
   */
  invalidateForConnection(connectionId) {
    const prefix = `ev:${connectionId}:`;
    for (const key of this._store.keys()) {
      if (key.startsWith(prefix)) this._store.delete(key);
    }
  }

  /**
   * Invalidate all evidence for a specific object within a connection.
   * Called on targeted object refresh.
   *
   * @param {string} connectionId
   * @param {string} objectName
   */
  invalidateForObject(connectionId, objectName) {
    const prefix = `ev:${connectionId}:${objectName}:`;
    for (const key of this._store.keys()) {
      if (key.startsWith(prefix)) this._store.delete(key);
    }
  }

  /**
   * Invalidate all evidence across all connections.
   */
  invalidateAll() {
    this._store.clear();
  }

  /**
   * Build a stable intent key from an IntentIR.
   * Used as the cache key's intent component.
   *
   * @param {Object} intentIR
   * @returns {string}
   */
  static buildIntentKey(intentIR) {
    const roles = (intentIR.filters || [])
      .map((f) => f.role)
      .sort()
      .join(",");
    const time = intentIR.time_range?.kind || "none";
    return `${intentIR.intent}:${intentIR.entity}:${roles}:${time}`;
  }

  size() {
    return this._store.size;
  }
}

function _key(connectionId, objectName, intentKey) {
  return `ev:${connectionId}:${objectName}:${intentKey}`;
}

module.exports = { EvidenceCache };
