"use strict";

/**
 * EvidenceFetcher
 *
 * Fetches TARGETED evidence when catalog confidence is insufficient.
 *
 * Three tiers:
 *   FAST   — catalog only, no DB hit
 *   MEDIUM — catalog + small targeted probe (e.g. sample values for one field)
 *   DEEP   — extended probes across multiple fields/objects
 *
 * IMPORTANT: Never fetches arbitrary "latest N rows from the whole collection".
 * Every probe is scoped to the specific field or role being resolved.
 */

const TIER_FAST = "fast";
const TIER_MEDIUM = "medium";
const TIER_DEEP = "deep";

class EvidenceFetcher {
  /**
   * @param {BaseAdapter} adapter
   * @param {Object}      catalog   SemanticCatalog
   */
  constructor(adapter, catalog) {
    this._adapter = adapter;
    this._catalog = catalog;
    this._evidenceCache = new Map(); // key → { evidence, cachedAt }
    this._cacheTtlMs = 2 * 60 * 1000; // 2 minutes
  }

  /**
   * Decide which tier to use based on intent and catalog confidence.
   *
   * @param {Object} intentIR
   * @param {Object} groundingResult  { plan, confidence }
   * @returns {"fast"|"medium"|"deep"}
   */
  decideTier(intentIR, groundingResult) {
    const conf = groundingResult?.confidence || 0;

    if (conf >= 0.85) return TIER_FAST;
    if (conf >= 0.5) return TIER_MEDIUM;
    return TIER_DEEP;
  }

  /**
   * Fetch targeted evidence for the given intent and tier.
   *
   * @param {Object} intentIR
   * @param {string} targetObject     Resolved collection/table name
   * @param {string} tier
   * @returns {Promise<Object>}  Evidence object passed to GroundingEngine
   */
  async fetchEvidence(intentIR, targetObject, tier) {
    if (tier === TIER_FAST) return {};

    const cacheKey = `${targetObject}:${tier}:${intentIR.entity}`;
    const cached = this._evidenceCache.get(cacheKey);
    if (cached && Date.now() - cached.cachedAt < this._cacheTtlMs) {
      return cached.evidence;
    }

    const objCatalog = (this._catalog.objects || []).find(
      (o) => o.name === targetObject || o.name.split(".").pop() === targetObject
    );
    if (!objCatalog) return {};

    const evidence = {};

    // Probe temporal fields — only the candidate fields
    if (intentIR.time_range) {
      const temporalCandidates = (
        objCatalog.candidate_temporal_fields || []
      ).slice(0, 3);
      if (temporalCandidates.length) {
        evidence.temporalSamples = await this._probeSampleValues(
          targetObject,
          temporalCandidates,
          5
        );
      }
    }

    // Probe role/classification fields when the parser extracted one
    for (const filter of intentIR.filters || []) {
      if (tier === TIER_MEDIUM) break; // medium: one probe only
      evidence[`${filter.role}_samples`] = await this._probeFieldValues(
        targetObject,
        filter.role,
        filter.value,
        5
      );
    }

    // Deep: also probe recency candidates and metric candidates
    if (tier === TIER_DEEP) {
      const recencyCandidates = (
        objCatalog.candidate_recency_fields || []
      ).slice(0, 2);
      if (recencyCandidates.length) {
        evidence.recencySamples = await this._probeSampleValues(
          targetObject,
          recencyCandidates,
          3
        );
      }
    }

    this._evidenceCache.set(cacheKey, { evidence, cachedAt: Date.now() });
    return evidence;
  }

  // ─── Probe helpers ──────────────────────────────────────────────────────────

  async _probeSampleValues(targetObject, fieldNames, n) {
    try {
      const objCatalog = (this._catalog.objects || []).find(
        (o) => o.name === targetObject
      );
      const result = {};
      for (const fn of fieldNames) {
        const field = (objCatalog?.fields || []).find((f) => f.name === fn);
        result[fn] = field?.sample_values || [];
      }
      return result;
    } catch {
      return {};
    }
  }

  async _probeFieldValues(targetObject, role, value, n) {
    // This would do a targeted DB query for distinct values matching the role
    // In MEDIUM tier, use catalog top_values instead of a live query
    try {
      const objCatalog = (this._catalog.objects || []).find(
        (o) => o.name === targetObject
      );
      const candidates = (objCatalog?.fields || []).filter(
        (f) =>
          f.name.toLowerCase().includes(role) ||
          (f.semantics?.roles || []).includes(role)
      );
      const result = {};
      for (const c of candidates.slice(0, 2)) {
        result[c.name] = c.top_values || c.sample_values || [];
      }
      return result;
    } catch {
      return {};
    }
  }
}

module.exports = { EvidenceFetcher, TIER_FAST, TIER_MEDIUM, TIER_DEEP };
