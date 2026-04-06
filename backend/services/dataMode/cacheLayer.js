"use strict";

/**
 * cache/SchemaCache.js
 * cache/CatalogCache.js
 * cache/EvidenceCache.js
 *
 * Thin TTL-based caches. In production these can be backed by Redis —
 * the interface stays the same (get / set / invalidate / invalidateAll).
 */

// ─── Base TTL cache ────────────────────────────────────────────────────────────

class TTLCache {
  constructor(ttlMs) {
    this._ttlMs = ttlMs;
    this._store = new Map();
  }

  get(key) {
    const entry = this._store.get(key);
    if (!entry) return null;
    if (Date.now() - entry.setAt > this._ttlMs) {
      this._store.delete(key);
      return null;
    }
    return entry.value;
  }

  set(key, value) {
    this._store.set(key, { value, setAt: Date.now() });
  }

  has(key) {
    return this.get(key) !== null;
  }

  invalidate(key) {
    this._store.delete(key);
  }

  invalidateAll() {
    this._store.clear();
  }

  /** Invalidate all keys matching a prefix */
  invalidatePrefix(prefix) {
    for (const key of this._store.keys()) {
      if (key.startsWith(prefix)) this._store.delete(key);
    }
  }

  size() {
    return this._store.size;
  }
}

// ─── Schema Cache (5-minute TTL) ──────────────────────────────────────────────

class SchemaCache extends TTLCache {
  constructor() {
    super(5 * 60 * 1000);
  }

  getSnapshot(connectionId) {
    return this.get(`snapshot:${connectionId}`);
  }

  setSnapshot(connectionId, snapshot) {
    this.set(`snapshot:${connectionId}`, snapshot);
  }

  invalidateSnapshot(connectionId) {
    this.invalidate(`snapshot:${connectionId}`);
  }
}

// ─── Catalog Cache (30-minute TTL) ────────────────────────────────────────────

class CatalogCache extends TTLCache {
  constructor() {
    super(30 * 60 * 1000);
  }

  getCatalog(connectionId) {
    return this.get(`catalog:${connectionId}`);
  }

  setCatalog(connectionId, catalog) {
    this.set(`catalog:${connectionId}`, catalog);
  }

  getCatalogVersion(connectionId) {
    return this.getCatalog(connectionId)?.snapshotVersion || null;
  }

  invalidateCatalog(connectionId) {
    this.invalidate(`catalog:${connectionId}`);
  }
}

// ─── Evidence Cache (2-minute TTL) ────────────────────────────────────────────

class EvidenceCache extends TTLCache {
  constructor() {
    super(2 * 60 * 1000);
  }

  getEvidence(connectionId, cacheKey) {
    return this.get(`evidence:${connectionId}:${cacheKey}`);
  }

  setEvidence(connectionId, cacheKey, evidence) {
    this.set(`evidence:${connectionId}:${cacheKey}`, evidence);
  }

  invalidateForConnection(connectionId) {
    this.invalidatePrefix(`evidence:${connectionId}:`);
  }
}

module.exports = { TTLCache, SchemaCache, CatalogCache, EvidenceCache };
