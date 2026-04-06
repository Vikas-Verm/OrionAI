"use strict";

/**
 * ConfidenceLogger.js
 *
 * Logs confidence scores at each pipeline stage.
 * Used to tune thresholds and identify weak grounding patterns over time.
 */

class ConfidenceLogger {
  constructor({ enabled = false, onLog = null } = {}) {
    this._enabled = enabled;
    this._onLog = onLog || console.debug;
    this._entries = [];
  }

  log(stage, data) {
    if (!this._enabled) return;
    const entry = { ts: new Date().toISOString(), stage, ...data };
    this._entries.push(entry);
    this._onLog("[ConfidenceLogger]", entry);
  }

  logParse(intentIR) {
    this.log("parse", {
      intent: intentIR.intent,
      entity: intentIR.entity,
      confidence: intentIR.confidence,
      filterCount: (intentIR.filters || []).length,
    });
  }

  logGrounding(groundedPlan, confidence) {
    this.log("grounding", {
      target: groundedPlan?.target_object,
      confidence,
      filterCount: (groundedPlan?.filters || []).length,
      joinCount: (groundedPlan?.joins || []).length,
      hasTimeRange: !!groundedPlan?.time_range,
    });
  }

  logVerification(result) {
    this.log("verification", {
      valid: result.valid,
      errors: result.errors?.length || 0,
      warnings: result.warnings?.length || 0,
    });
  }

  getEntries() {
    return [...this._entries];
  }
  clear() {
    this._entries = [];
  }
}

// ─── ExecutionTrace.js ────────────────────────────────────────────────────────

/**
 * ExecutionTrace
 *
 * Records the full execution result including timing, row count,
 * and executed query. Attached to the final response in debug mode.
 */
class ExecutionTrace {
  constructor() {
    this._records = [];
  }

  record({
    question,
    executedQuery,
    rowCount,
    executionMs,
    vendor,
    intent,
    source,
    confidence,
  }) {
    this._records.push({
      ts: new Date().toISOString(),
      question: String(question || "").slice(0, 200),
      executedQuery: String(executedQuery || "").slice(0, 500),
      rowCount: rowCount ?? 0,
      executionMs: executionMs ?? 0,
      vendor,
      intent,
      source,
      confidence,
    });

    // Keep only last 100 records in memory
    if (this._records.length > 100) {
      this._records.shift();
    }
  }

  getRecent(n = 10) {
    return this._records.slice(-n);
  }

  clear() {
    this._records = [];
  }
}

module.exports = { ConfidenceLogger, ExecutionTrace };
