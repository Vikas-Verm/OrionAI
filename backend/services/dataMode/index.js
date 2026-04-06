"use strict";

/**
 * DataModeOrchestrator  (dataMode/index.js)
 *
 * Main entry point for OrionAI Data Mode.
 * Wires together all layers in the correct order.
 *
 * Pipeline (natural language path):
 *   1. Adapter      → connect to database family
 *   2. Snapshot     → get current schema (with drift check)
 *   3. Catalog      → get semantic model (build if missing)
 *   4. Parser       → NL → Intent IR  (LLM #1)
 *   5. Evidence     → targeted probes if confidence is low
 *   6. Grounding    → Intent IR + catalog → GroundedPlan (deterministic)
 *   7. Planner      → GroundedPlan → LogicalPlan (deterministic)
 *   8. Verifier     → safety + field existence check
 *   9. Compiler     → LogicalPlan → physical query (deterministic)
 *  10. Execution    → run physical query
 *  11. Answer       → format reply  (LLM #2, optional)
 *
 * Raw query path (separate, no NL pipeline):
 *   Validate → Execute → Return rows
 */

const { getFlag } = require("./featureFlags");
const { createAdapter } = require("./adapters/adapterFactory");
const { SchemaSnapshotService } = require("./schema/schemaSnapshotService");
const { SchemaDriftManager } = require("./drift/schemaDriftManager.js");
const {
  SemanticCatalogBuilder,
  SemanticCatalogStore,
} = require("./catalog/semanticCatalogBuilder");
const { QuestionParser } = require("./parser/questionParser");
const { EvidenceFetcher } = require("./evidence/evidenceFetcher");
const { GroundingEngine } = require("./grounding/groundingEngine");
const { LogicalPlanner } = require("./planner/logicalPlanner");
const { PlanVerifier } = require("./verifier/planVerfier");
const { MongoCompiler } = require("./compiler/mongoCompiler");
const { SQLCompiler } = require("./compiler/sqlCompiler");
const { ExecutionLayer } = require("./execution/executionLayer");
const { AnswerBuilder } = require("./answer/answerBuilder");
const {
  RawQueryValidator,
  RawQueryExecutor,
} = require("./raw/rawQueryValidator");
const { PlannerTrace } = require("./telemetry/plannerTrace");
const { ReferenceEnricher } = require("./execution/referenceEnricher");
// ─── Singletons (shared across requests) ─────────────────────────────────────
const snapshotService = new SchemaSnapshotService();
const catalogStore = new SemanticCatalogStore();

class DataModeOrchestrator {
  /**
   * @param {Function} llmComplete   async (prompt, maxTokens, temp) => string
   *                                 Injected so this module stays framework-agnostic.
   */
  constructor(llmComplete) {
    this._llm = llmComplete;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Answer a natural-language database question.
   *
   * @param {string} userId
   * @param {string} question
   * @param {Object} dbConfig     { vendor, connectionString, filePath, ssl, ... }
   * @param {Object} [options]    { debugMode, useLlmAnswer, forceSchemaRefresh, now }
   * @returns {Promise<DataModeResult>}
   */
  async query(userId, question, dbConfig, options = {}) {
    const trace = new PlannerTrace(question);
    const now = options.now || new Date();

    try {
      // ── 1. Adapter ────────────────────────────────────────────────────────
      const adapter = createAdapter(dbConfig);
      // ── 2. Schema snapshot + drift check ─────────────────────────────────
      const catalogBuilder = new SemanticCatalogBuilder(adapter);
      const driftManager = new SchemaDriftManager(
        snapshotService,
        catalogStore,
        catalogBuilder
      );

      let snapshot, catalog, driftSummary;
      if (options.forceSchemaRefresh) {
        ({ snapshot, catalog } = await driftManager.forceFullRefresh(
          userId,
          adapter
        ));
      } else {
        ({ snapshot, catalog, driftSummary } =
          await driftManager.checkAndRefresh(userId, adapter));
        if (driftSummary) trace.recordDrift(driftSummary);
      }
      console.log("snapshot, catalog;", snapshot, catalog);

      // Build catalog if not in store
      if (!catalog) {
        catalog = await catalogBuilder.build(userId, snapshot);
        catalogStore.set(userId, catalog);
      }

      // ── 3. Parse question ─────────────────────────────────────────────────
      const entityNames = (snapshot.objects || []).map((o) => o.name);
      const parser = new QuestionParser(this._llm);
      const intentIR = await parser.parse(question, entityNames, now);
      trace.recordParse(intentIR);

      // ── 4. Evidence fetch (before grounding) ──────────────────────────────
      // Ground a tentative target first (low cost)
      const groundingEngine = new GroundingEngine(catalog);
      const tentativeResult = groundingEngine.ground(intentIR);
      const evidenceFetcher = new EvidenceFetcher(adapter, catalog);
      const tier = evidenceFetcher.decideTier(intentIR, tentativeResult);
      const evidence = await evidenceFetcher.fetchEvidence(
        intentIR,
        tentativeResult.plan?.target_object || "",
        tier
      );
      trace.recordEvidence(tier, Object.keys(evidence));

      // ── 5. Final grounding (with evidence) ────────────────────────────────
      const {
        plan: groundedPlan,
        ambiguities,
        confidence,
      } = groundingEngine.ground(intentIR);
      trace.recordGrounding(groundedPlan, ambiguities, confidence);

      // Reject if grounding failed entirely
      if (!groundedPlan) {
        const msg =
          ambiguities[0] ||
          "I couldn't identify which data to query. Please be more specific.";
        return this._errorResult(msg, trace, options);
      }

      // Surface ambiguity to user instead of guessing
      if (confidence < 0.25 && ambiguities.length > 0) {
        const msg = `I'm not sure what you're asking about. ${ambiguities[0]} Please rephrase or use the Schema Browser to see available tables.`;
        return this._errorResult(msg, trace, options);
      }

      // ── 6. Logical plan ───────────────────────────────────────────────────
      const capabilities = adapter.detectCapabilities();
      const planner = new LogicalPlanner(capabilities);
      const logicalPlan = planner.build(groundedPlan);
      trace.recordPlan(logicalPlan);

      // ── 7. Verify ─────────────────────────────────────────────────────────
      const verifier = new PlanVerifier(catalog);
      const verification = verifier.verify(logicalPlan, groundedPlan);
      trace.recordVerification(verification);

      if (!verification.valid) {
        // Try drift recovery: refresh schema and retry once
        if (getFlag("DATA_MODE_ENABLE_DRIFT_RECOVERY") && !options._retrying) {
          trace.recordRetry("verification_failed");
          const { snapshot: newSnap, catalog: newCat } =
            await driftManager.forceFullRefresh(userId, adapter);
          return this.query(userId, question, dbConfig, {
            ...options,
            _retrying: true,
            _freshCatalog: newCat,
            _freshSnapshot: newSnap,
          });
        }
        const msg = `I couldn't verify the query plan. ${
          verification.errors[0] || "Please try rephrasing."
        }`;
        return this._errorResult(msg, trace, options);
      }

      // Log warnings but continue
      if (
        verification.warnings.length &&
        getFlag("DATA_MODE_ENABLE_TRACE_LOGGING")
      ) {
        console.warn("[DataMode] Plan warnings:", verification.warnings);
      }

      // ── 8. Compile ────────────────────────────────────────────────────────
      const physicalPlan = this._compile(
        logicalPlan,
        dbConfig.vendor,
        capabilities
      );
      trace.recordCompilation(physicalPlan);

      // ── 9. Execute ────────────────────────────────────────────────────────
      const execLayer = new ExecutionLayer(adapter);
      const execResult = await execLayer.execute(physicalPlan);
      trace.recordExecution(execResult);

      // Enrich raw rows for references / ObjectIds
      const enricher = new ReferenceEnricher(adapter, catalog);
      let enrichedRows = execResult.rows;
      try {
        enrichedRows = await enricher.enrichRows(
          execResult.rows,
          logicalPlan.source
        );
      } catch (error) {
        if (getFlag("DATA_MODE_ENABLE_TRACE_LOGGING")) {
          console.warn("[DataMode] Reference enrichment skipped:", error);
        }
      }

      const enrichedExecResult = {
        ...execResult,
        rows: enrichedRows,
      };

      const answerBuilder = new AnswerBuilder(
        getFlag("DATA_MODE_V2_ENABLED") ? this._llm : null
      );
      const reply = await answerBuilder.build(
        question,
        enrichedExecResult,
        logicalPlan,
        trace,
        { debugMode: options.debugMode, useLlm: options.useLlmAnswer !== false }
      );

      return {
        ok: true,
        reply,
        rows: enrichedExecResult.rows,
        rowCount: enrichedExecResult.rowCount,
        executionMs: enrichedExecResult.executionMs,
        executedQuery: enrichedExecResult.executedQuery,
        vendor: dbConfig.vendor,
        queryMeta: {
          intent: logicalPlan.intent,
          source: _shortName(logicalPlan.source),
          sourceQualified: logicalPlan.source,
          explanation: _displayExplanation(logicalPlan.explanation),
          confidence,
          latencyTier: tier,
          timeRange: logicalPlan.time_range,
          temporalField: groundedPlan.temporal_field?.field || null,
          joins: (logicalPlan.joins || []).map((j) => _shortName(j.to)),
          warnings: verification.warnings,
        },
        trace: options.debugMode ? trace.toDebugObject() : undefined,
      };
    } catch (err) {
      trace.recordError("orchestrator", err);
      console.log(err, "error");
      console.error("[DataModeOrchestrator] Error:", err.message);

      return this._errorResult(this._classifyError(err), trace, options);
    }
  }

  /**
   * Get the schema for a connected database (for schema browser, meta questions).
   */
  async getSchema(userId, dbConfig, options = {}) {
    const adapter = createAdapter(dbConfig);
    const snapshot = await snapshotService.getSnapshot(
      userId,
      adapter,
      options
    );
    return snapshot;
  }

  /**
   * Force refresh schema and catalog.
   */
  async refreshSchema(userId, dbConfig) {
    const adapter = createAdapter(dbConfig);
    const catalogBuilder = new SemanticCatalogBuilder(adapter);
    const driftManager = new SchemaDriftManager(
      snapshotService,
      catalogStore,
      catalogBuilder
    );
    return driftManager.forceFullRefresh(userId, adapter);
  }

  /**
   * Execute a raw query (separate from NL pipeline).
   */
  async rawQuery(userId, dbConfig, input) {
    const vendor = dbConfig.vendor;
    const validator = new RawQueryValidator(vendor);
    const validation = validator.validate(input);

    if (!validation.valid) {
      throw new Error(validation.errors[0] || "Invalid raw query.");
    }

    const adapter = createAdapter(dbConfig);
    const executor = new RawQueryExecutor(adapter);
    return executor.execute(input);
  }

  /**
   * Preview a table/collection (paginated).
   * Delegates to adapter directly — no NL pipeline needed.
   */
  async previewTable(userId, dbConfig, input = {}) {
    const adapter = createAdapter(dbConfig);
    const snapshot = await snapshotService.getSnapshot(userId, adapter);
    const target = String(input.target || "").trim();
    const obj = (snapshot.objects || []).find(
      (o) => o.name === target || o.name.split(".").pop() === target
    );
    if (!obj) throw new Error(`Table "${target}" not found in schema.`);
    // Delegate to adapter's profiling (simple sample)
    const profiles = await adapter.profileObjects([obj], {});
    const samples = profiles[obj.name]?.samples || {};
    // Build rows from samples
    const fieldNames = obj.fields.map((f) => f.name);
    const maxRows = Math.min(Number(input.pageSize) || 20, 100);
    const rows = [];
    const sampleArrays = Object.values(samples);
    const maxLen = Math.max(...sampleArrays.map((a) => a.length), 0);
    for (let i = 0; i < Math.min(maxLen, maxRows); i++) {
      const row = {};
      for (const fn of fieldNames) {
        row[fn] = (samples[fn] || [])[i] ?? null;
      }
      rows.push(row);
    }
    return { rows, rowCount: rows.length, table: obj };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INTERNAL HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  _compile(logicalPlan, vendor, capabilities) {
    if (vendor === "mongodb") {
      const compiler = new MongoCompiler(capabilities);
      return compiler.compile(logicalPlan);
    }
    const compiler = new SQLCompiler(vendor, capabilities);
    return compiler.compile(logicalPlan);
  }

  _errorResult(message, trace, options) {
    return {
      ok: false,
      reply: message,
      rows: [],
      rowCount: 0,
      executionMs: Date.now() - trace.startedAt,
      executedQuery: "",
      queryMeta: {},
      trace: options?.debugMode ? trace.toDebugObject() : undefined,
    };
  }

  _classifyError(err) {
    const msg = String(err?.message || "");
    if (/no database integration/i.test(msg))
      return "No database is connected yet. Go to **Settings → Integrations → Database** to connect one.";
    if (/ECONNREFUSED|serverSelectionTimeout|ETIMEDOUT|connection/i.test(msg))
      return "I couldn't reach your database — the connection timed out or was refused. Check your settings.";
    if (/read-only|SELECT|write/i.test(msg))
      return "That operation would modify data, which isn't allowed in Data Mode.";
    if (/not found in schema|no suitable/i.test(msg))
      return "I couldn't find the data you're asking about. Try the Schema Browser to see what's available.";
    if (/ambiguous|confidence/i.test(msg))
      return "I'm not sure what you're asking. Please try rephrasing with more specific details.";
    return "Something went wrong while querying your database. Try rephrasing your question.";
  }
}

function _shortName(name = "") {
  return String(name).split(".").pop() || String(name);
}

function _displayExplanation(text = "") {
  return String(text || "").replace(/\b([A-Za-z0-9_]+)\.([A-Za-z0-9_]+)\b/g, "$2");
}

module.exports = { DataModeOrchestrator };
