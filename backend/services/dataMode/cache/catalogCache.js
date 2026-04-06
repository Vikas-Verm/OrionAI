"use strict";

/**
 * CatalogCache.js
 *
 * Caches SemanticCatalog objects, keyed by connectionId.
 * TTL: 30 minutes (catalog is expensive to build).
 *
 * Version-aware: stores the schema snapshot version alongside the catalog
 * so the drift manager can detect staleness without reloading the full catalog.
 *
 * In production, replace with a Redis or MongoDB-backed implementation
 * keeping the same interface.
 */

const DEFAULT_TTL_MS = 30 * 60 * 1000; // 30 minutes

class CatalogCache {
  /**
   * @param {Object} [options]
   * @param {number} [options.ttlMs]  TTL in milliseconds (default 30 min)
   */
  constructor(options = {}) {
    this._ttlMs = options.ttlMs || DEFAULT_TTL_MS;
    this._store = new Map(); // connectionId → { catalog, setAt, schemaVersion }
  }

  /**
   * Retrieve a cached catalog.
   * Returns null if missing or expired.
   *
   * @param {string} connectionId
   * @returns {Object|null}  SemanticCatalog or null
   */
  get(connectionId) {
    const key = _key(connectionId);
    const entry = this._store.get(key);
    if (!entry) return null;
    if (Date.now() - entry.setAt > this._ttlMs) {
      this._store.delete(key);
      return null;
    }
    return entry.catalog;
  }

  /**
   * Store a catalog.
   *
   * @param {string} connectionId
   * @param {Object} catalog    SemanticCatalog
   */
  set(connectionId, catalog) {
    this._store.set(_key(connectionId), {
      catalog,
      setAt: Date.now(),
      schemaVersion: catalog.snapshotVersion || null,
    });
  }

  /**
   * Get the schema version this catalog was built from.
   * Used to check if the catalog is still valid for the current schema fingerprint.
   *
   * @param {string} connectionId
   * @returns {string|null}  Schema fingerprint or null
   */
  getSchemaVersion(connectionId) {
    const entry = this._store.get(_key(connectionId));
    if (!entry || Date.now() - entry.setAt > this._ttlMs) return null;
    return entry.schemaVersion;
  }

  /**
   * Check if the catalog was built from a specific schema version.
   *
   * @param {string} connectionId
   * @param {string} schemaFingerprint
   * @returns {boolean}
   */
  isCurrentFor(connectionId, schemaFingerprint) {
    const version = this.getSchemaVersion(connectionId);
    return version !== null && version === schemaFingerprint;
  }

  /**
   * Partially invalidate: remove only the catalog entries for specific objects.
   * The rest of the catalog can still be used.
   *
   * NOTE: This requires rebuilding those objects and merging.
   * Returns the catalog with the affected objects nulled out (for rebuild).
   *
   * @param {string}   connectionId
   * @param {string[]} objectNames   Objects to invalidate
   * @returns {Object|null}  Modified catalog (still cached) or null if no catalog
   */
  invalidateObjects(connectionId, objectNames) {
    const catalog = this.get(connectionId);
    if (!catalog) return null;

    const staleSet = new Set(objectNames);
    const updated = {
      ...catalog,
      objects: (catalog.objects || []).map((obj) =>
        staleSet.has(obj.name) ? { ...obj, _stale: true } : obj
      ),
    };

    // Re-cache the partially invalidated catalog
    this._store.get(_key(connectionId)).catalog = updated;
    return updated;
  }

  /**
   * Invalidate a specific connection's catalog entirely.
   *
   * @param {string} connectionId
   */
  invalidate(connectionId) {
    this._store.delete(_key(connectionId));
  }

  /**
   * Invalidate all catalogs.
   */
  invalidateAll() {
    this._store.clear();
  }

  /**
   * Number of cached catalogs.
   */
  size() {
    return this._store.size;
  }

  /**
   * Age of a cached catalog in milliseconds.
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
  return `catalog:${String(id || "")}`;
}

module.exports = { CatalogCache };
