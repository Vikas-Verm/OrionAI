"use strict";

/**
 * SchemaDriftManager
 *
 * Monitors for schema changes between queries.
 * Strategy:
 *   - Before each query: cheap fingerprint probe
 *   - On drift: targeted refresh → rebuild partial catalog → retry plan once
 *   - On major drift (≥3 breaking changes): full rebuild → retry once
 *   - Manual refresh: force full rebuild
 */

const { diffSnapshots } = require("../schema/schemaSnapshotService");

class SchemaDriftManager {
  /**
   * @param {SchemaSnapshotService} snapshotService
   * @param {SemanticCatalogStore}  catalogStore
   * @param {SemanticCatalogBuilder} catalogBuilder
   */
  constructor(snapshotService, catalogStore, catalogBuilder) {
    this._snapshots = snapshotService;
    this._catalog = catalogStore;
    this._builder = catalogBuilder;
    this._driftLog = []; // recent drift events for telemetry
  }

  /**
   * Check for drift and refresh if needed.
   * Returns the current snapshot (refreshed if drift detected).
   *
   * @param {string} connectionId
   * @param {Object} adapter
   * @returns {Promise<{ snapshot, catalog, driftDetected, driftSummary }>}
   */
  async checkAndRefresh(connectionId, adapter) {
    const probe = await this._snapshots.probe(connectionId, adapter);

    if (!probe.drifted) {
      const snapshot = await this._snapshots.getSnapshot(connectionId, adapter);
      const catalog = this._catalog.get(connectionId);
      return { snapshot, catalog, driftDetected: false, driftSummary: null };
    }

    // Drift detected
    const summary = {
      connectionId,
      detectedAt: new Date().toISOString(),
      changes: probe.diff?.changes || [],
      breaking: probe.diff?.hasBreakingChanges || false,
      major: probe.diff?.hasMajorDrift || false,
    };
    this._driftLog.push(summary);


    // Targeted or full refresh
    const strategy = summary.major ? "full" : "targeted";
    const snapshot =
      probe.liveSnapshot ||
      (await this._snapshots.getSnapshot(connectionId, adapter, {
        force: true,
      }));

    // Rebuild catalog
    let catalog;
    try {
      catalog = await this._builder.build(connectionId, snapshot);
      this._catalog.set(connectionId, catalog);
    } catch (err) {
      console.error(
        `[SchemaDriftManager] Catalog rebuild failed: ${err.message}`
      );
      catalog = this._catalog.get(connectionId); // use stale catalog if rebuild fails
    }

    return {
      snapshot,
      catalog,
      driftDetected: true,
      driftSummary: summary,
      strategy,
    };
  }

  /**
   * Force a full schema + catalog rebuild (e.g. user clicks "Refresh Schema").
   */
  async forceFullRefresh(connectionId, adapter) {
    this._snapshots.invalidate(connectionId);
    this._catalog.invalidate(connectionId);

    const snapshot = await this._snapshots.getSnapshot(connectionId, adapter, {
      force: true,
    });
    const catalog = await this._builder.build(connectionId, snapshot);
    this._catalog.set(connectionId, catalog);


    return { snapshot, catalog };
  }

  getRecentDriftLog(connectionId, limit = 10) {
    return this._driftLog
      .filter((e) => e.connectionId === connectionId)
      .slice(-limit);
  }
}

module.exports = { SchemaDriftManager };
