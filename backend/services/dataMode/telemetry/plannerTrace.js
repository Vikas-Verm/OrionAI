"use strict";

/**
 * PlannerTrace.js
 *
 * Full internal trace for a single query pipeline run.
 * Enables debugging of exactly why OrionAI chose a particular plan.
 */

class PlannerTrace {
  constructor(question) {
    this.question = question;
    this.startedAt = Date.now();
    this.steps = [];
    this.latencyTier = null;
    this.driftEvent = null;
    this.retried = false;
  }

  // ── Step recording ──────────────────────────────────────────────────────────

  recordParse(intentIR) {
    this._step("parse", {
      intent: intentIR.intent,
      entity: intentIR.entity,
      filters: intentIR.filters,
      time_range: intentIR.time_range,
      confidence: intentIR.confidence,
      notes: intentIR.parser_notes,
    });
  }

  recordGrounding(groundedPlan, ambiguities, confidence) {
    this._step("grounding", {
      target: groundedPlan?.target_object,
      filters: (groundedPlan?.filters || []).map(
        (f) => `${f.field} ${f.operator} "${f.value}"`
      ),
      joins: (groundedPlan?.joins || []).map(
        (j) => `${j.from_object}→${j.to_object}`
      ),
      temporalField: groundedPlan?.temporal_field?.field,
      sortField: groundedPlan?.sort_field?.field,
      ambiguities,
      confidence,
    });
  }

  recordEvidence(tier, evidenceKeys) {
    this.latencyTier = tier;
    this._step("evidence", { tier, evidenceKeys });
  }

  recordPlan(logicalPlan) {
    this._step("logical_plan", {
      source: logicalPlan.source,
      intent: logicalPlan.intent,
      filters: (logicalPlan.filters || []).length,
      joins: (logicalPlan.joins || []).length,
      timeRange: !!logicalPlan.time_range,
      sort: (logicalPlan.sort || []).map((s) => `${s.field} ${s.direction}`),
      limit: logicalPlan.limit,
      explanation: logicalPlan.explanation,
    });
  }

  recordVerification(result) {
    this._step("verification", {
      valid: result.valid,
      errors: result.errors,
      warnings: result.warnings,
    });
  }

  recordCompilation(physicalPlan) {
    this._step("compilation", {
      kind: physicalPlan.kind,
      operation: physicalPlan.operation,
      query:
        physicalPlan.kind === "mongo"
          ? JSON.stringify(physicalPlan.query || physicalPlan.pipeline).slice(
              0,
              300
            )
          : (physicalPlan.sql || "").slice(0, 300),
    });
  }

  recordExecution(result) {
    this._step("execution", {
      rowCount: result.rowCount,
      executionMs: result.executionMs,
      executedQuery: (result.executedQuery || "").slice(0, 300),
    });
  }

  recordDrift(driftSummary) {
    this.driftEvent = driftSummary;
    this._step("drift", {
      changes: (driftSummary.changes || []).length,
      breaking: driftSummary.breaking,
      major: driftSummary.major,
    });
  }

  recordRetry(reason) {
    this.retried = true;
    this._step("retry", { reason });
  }

  recordError(stage, error) {
    this._step("error", { stage, message: error?.message || String(error) });
  }

  // ── Summary ─────────────────────────────────────────────────────────────────

  summary() {
    const totalMs = Date.now() - this.startedAt;
    return {
      question: this.question,
      totalMs,
      latencyTier: this.latencyTier || "unknown",
      retried: this.retried,
      driftEvent: this.driftEvent
        ? {
            changes: this.driftEvent.changes?.length,
            breaking: this.driftEvent.breaking,
          }
        : null,
      steps: this.steps.map((s) => ({
        stage: s.stage,
        durationMs: s.durationMs,
        ...s.data,
      })),
    };
  }

  toDebugObject() {
    return {
      question: this.question,
      totalMs: Date.now() - this.startedAt,
      latencyTier: this.latencyTier,
      retried: this.retried,
      steps: this.steps,
    };
  }

  _step(stage, data) {
    const prev = this.steps[this.steps.length - 1];
    const durationMs = prev
      ? Date.now() -
        (this.startedAt +
          this.steps.slice(0, -1).reduce((a, s) => a + (s.durationMs || 0), 0))
      : Date.now() - this.startedAt;
    this.steps.push({ stage, data, durationMs });
  }
}

module.exports = { PlannerTrace };
