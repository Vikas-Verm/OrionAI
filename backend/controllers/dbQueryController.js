"use strict";

const {
  getDatabaseIntegration,
  getDatabaseDisplayName,
  requireDatabaseConfig,
  loadDatabaseSchema,
  queryConnectedDatabase,
  previewConnectedDatabase,
  mutateConnectedDatabase,
  runRawConnectedDatabaseQuery,
} = require("../services/connectedDatabaseService");

const {
  loadConversation,
  saveConversation,
  updateSessionTitle,
  appendActivityLog,
} = require("../services/conversationService");

// ─── Error classification ─────────────────────────────────────────────────────
// Maps internal error messages to user-friendly replies so the frontend never
// shows a raw stack trace or a generic "something went wrong".

const ERROR_REPLY_MAP = [
  {
    match: /no database integration/i,
    reply:
      "No database is connected yet. Go to **Settings → Integrations → Database** to connect one.",
    status: 200,
  },
  {
    match: /no suitable table or collection/i,
    reply:
      "I couldn't match your question to a table or collection in your database. Try being more specific, or use the **Schema Browser** to see what's available.",
    status: 200,
  },
  {
    match: /not found in the schema/i,
    reply:
      "That table or collection doesn't appear in your connected database. Open the **Schema Browser** to see all available tables.",
    status: 200,
  },
  {
    match: /connection string|ECONNREFUSED|serverSelectionTimeout|ETIMEDOUT/i,
    reply:
      "I couldn't reach your database — the connection timed out or was refused. Check your connection settings in **Settings → Integrations**.",
    status: 200,
  },
  {
    match: /only read-only SELECT|not read-only|multiple SQL statements/i,
    reply:
      "That query would modify data, which isn't allowed in Data Mode. Use the **Table Browser** to insert, update, or delete rows.",
    status: 200,
  },
  {
    match: /unsupported database vendor/i,
    reply:
      "Your connected database type isn't supported yet. Supported vendors are MongoDB, PostgreSQL, MySQL, and SQLite.",
    status: 200,
  },
  {
    match: /connection string is required|file path|sqlite requires/i,
    reply:
      "Your database integration is missing required connection details. Update it in **Settings → Integrations**.",
    status: 200,
  },
];

function classifyError(error) {
  const message = String(error?.message || "");
  for (const entry of ERROR_REPLY_MAP) {
    if (entry.match.test(message)) {
      return { reply: entry.reply, status: entry.status };
    }
  }
  return {
    reply:
      "Something went wrong while querying your database. Try rephrasing your question or checking the Schema Browser.",
    status: 500,
  };
}

// ─── Schema meta-question detector ───────────────────────────────────────────
// If the user asks about the structure of their data rather than the data itself,
// answer from the schema directly — no query execution needed.

const SCHEMA_QUESTION_RE =
  /\b(what (collections?|tables?|fields?|columns?|schemas?)|list (all )?(collections?|tables?)|describe (my |the )?(database|db|schema|collection|table)|show (me )?(my |the )?(schema|collections?|tables?|fields?|structure)|what (data|info) (do i have|is available)|what (can you|can i) (query|ask)|available (tables?|collections?)|database structure|schema info)\b/i;

function isSchemaQuestion(message) {
  return SCHEMA_QUESTION_RE.test(String(message || ""));
}

async function buildSchemaReply(schema) {
  const tables = Array.isArray(schema?.tables) ? schema.tables : [];
  if (!tables.length) {
    return "Your connected database appears to have no tables or collections yet.";
  }
  const lines = tables.slice(0, 40).map((t) => {
    const fields = (t.fields || [])
      .slice(0, 8)
      .map((f) => f.name)
      .join(", ");
    const extra =
      (t.fields || []).length > 8 ? ` …+${t.fields.length - 8} more` : "";
    const rowHint =
      t.estimatedRows != null
        ? ` (~${t.estimatedRows.toLocaleString()} rows)`
        : "";
    return `• **${t.name}**${rowHint}: ${
      fields || "no sampled fields"
    }${extra}`;
  });
  const overflow =
    tables.length > 40 ? `\n\n_…and ${tables.length - 40} more tables._` : "";
  return (
    `Your connected database has **${tables.length}** table${
      tables.length === 1 ? "" : "s"
    } or collection${tables.length === 1 ? "" : "s"}:\n\n` +
    lines.join("\n") +
    overflow +
    "\n\nAsk me anything about the data in any of these — counts, recent records, filters, and more."
  );
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

function validateMessage(message) {
  const value = String(message || "").trim();
  if (!value)
    throw Object.assign(new Error("Message is required."), { status: 400 });
  if (value.length > 2000)
    throw Object.assign(
      new Error("Message is too long (max 2000 characters)."),
      {
        status: 400,
      }
    );
  return value;
}

async function persistConversationTurn(
  sessionId,
  conversationHistory,
  reply,
  message
) {
  conversationHistory.push({ role: "assistant", content: reply });
  await saveConversation(sessionId, conversationHistory);

  const userMessageCount = conversationHistory.filter(
    (m) => m.role === "user"
  ).length;
  if (userMessageCount === 1) {
    const truncated =
      message.substring(0, 35) + (message.length > 35 ? "…" : "");
    await updateSessionTitle(sessionId, `🗄️ ${truncated}`).catch(() => {});
  }
}

// ─── handleDbChat ─────────────────────────────────────────────────────────────

async function handleDbChat(req, res) {
  const startedAt = Date.now();
  const userId = req.user.username;

  // ── Input validation ────────────────────────────────────────────────────────
  let message;
  try {
    message = validateMessage(req.body?.message);
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message });
  }

  const sessionId =
    String(req.body?.sessionId || "default").trim() || "default";

  // ── Load conversation history ───────────────────────────────────────────────
  let conversationHistory = [];
  try {
    conversationHistory = await loadConversation(sessionId);
  } catch {
    conversationHistory = [];
  }
  conversationHistory.push({ role: "user", content: message });

  // ── Verify database is connected ────────────────────────────────────────────
  let databaseIntegration;
  try {
    databaseIntegration = await getDatabaseIntegration(userId);
  } catch (err) {
    const { reply, status } = classifyError(err);
    await persistConversationTurn(
      sessionId,
      conversationHistory,
      reply,
      message
    ).catch(() => {});
    return res.status(status).json({ reply, error: reply });
  }

  if (!databaseIntegration) {
    const reply =
      "No database is connected yet. Go to **Integrations → Database** to connect one.";
    await persistConversationTurn(
      sessionId,
      conversationHistory,
      reply,
      message
    ).catch(() => {});
    return res.json({ reply });
  }

  const integrationName = getDatabaseDisplayName(databaseIntegration);

  // ── Handle schema / meta questions ─────────────────────────────────────────
  // Questions like "what collections do I have?" or "what fields does Bills have?"
  // are answered directly from the cached schema — no query execution needed.
  if (isSchemaQuestion(message)) {
    try {
      const config = requireDatabaseConfig(databaseIntegration.database || {});
      const schema = await loadDatabaseSchema(config);
      const reply = await buildSchemaReply(schema);
      await persistConversationTurn(
        sessionId,
        conversationHistory,
        reply,
        message
      ).catch(() => {});
      return res.json({
        reply,
        rows: [],
        recordCount: 0,
        executionMs: Date.now() - startedAt,
        vendor: config.vendor,
        integrationName,
        queryMeta: { kind: "schema_introspection" },
      });
    } catch {
      // If schema load or config fails, fall through to the normal query path.
    }
  }
  // ── Execute natural language query ──────────────────────────────────────────
  let result;
  try {
    result = await queryConnectedDatabase(userId, message);
    // console.log(result, "klsdflkjsfljdsdlfjljk");
  } catch (err) {
    const { reply, status } = classifyError(err);
    await persistConversationTurn(
      sessionId,
      conversationHistory,
      reply,
      message
    ).catch(() => {});
    return res
      .status(status === 500 ? 200 : status)
      .json({ reply, error: reply });
  }

  const reply =
    result.reply || "I ran the query but couldn't format a response.";
  const analysis = result.queryPlan?.queryAnalysis || {};
  // ── Persist conversation turn ───────────────────────────────────────────────
  await persistConversationTurn(
    sessionId,
    conversationHistory,
    reply,
    message
  ).catch(() => {});

  // ── Activity log (rich — includes query analysis details) ──────────────────
  await appendActivityLog(sessionId, {
    message,
    integrationName,
    vendor: result.vendor || databaseIntegration.database?.vendor,
    // Actual target collection/table — not the integration name
    collection:
      analysis.target ||
      result.queryPlan?.collection ||
      result.queryPlan?.target ||
      integrationName,
    // Actual operation type — count, find, aggregate, sql, etc.
    queryType:
      result.queryPlan?.operation ||
      result.queryPlan?.kind ||
      analysis.questionType ||
      "unknown",
    explanation: result.queryPlan?.explanation || "",
    executedQuery: result.executedQuery || "",
    recordCount: result.rowCount ?? 0,
    // Temporal range used — useful for debugging / audit
    temporalRange: analysis.relativeRange
      ? {
          kind: analysis.relativeRange.kind,
          start:
            analysis.relativeRange.startDateOnly ||
            analysis.relativeRange.startDateTime,
          end:
            analysis.relativeRange.endDateOnly ||
            analysis.relativeRange.endDateTime,
        }
      : null,
    temporalField: analysis.temporalField?.name || null,
  }).catch(() => {});
  console.log(result.rows, "klsdflkjsfljdsdlfjljk");
  // ── Response ────────────────────────────────────────────────────────────────
  return res.json({
    reply,
    rows: result.rows || [],
    recordCount: result.rowCount ?? 0,
    executionMs: Date.now() - startedAt,
    vendor: result.vendor,
    integrationName,
    generatedQuery: result.executedQuery,
    queryMeta: {
      kind: result.queryPlan?.kind || "unknown",
      operation: result.queryPlan?.operation || null,
      collection:
        result.queryPlan?.collection || result.queryPlan?.target || null,
      explanation: result.queryPlan?.explanation || "",
      // Temporal context — lets the frontend display "filtered for last 12 hours" etc.
      relativeRange: analysis.relativeRange || null,
      temporalField: analysis.temporalField?.name || null,
      questionType: analysis.questionType || null,
    },
  });
}

// ─── handleRawDbQuery ─────────────────────────────────────────────────────────

async function handleRawDbQuery(req, res) {
  const userId = req.user.username;
  const startedAt = Date.now();
  const collection = String(req.body?.collection || "").trim();
  const query = String(req.body?.query || "").trim();

  if (!query) {
    return res.status(400).json({ error: "Query is required." });
  }

  try {
    const result = await runRawConnectedDatabaseQuery(userId, {
      collection,
      query,
    });

    return res.json({
      ok: true,
      rows: result.rows || [],
      recordCount: result.rowCount ?? 0,
      executionMs: Date.now() - startedAt,
      executedQuery: result.executedQuery,
      vendor: result.vendor,
      integrationName: result.integrationName,
    });
  } catch (error) {
    console.error("[handleRawDbQuery]", error.message);
    return res
      .status(400)
      .json({ error: error.message || "Raw query failed." });
  }
}

// ─── handleDbPreview ──────────────────────────────────────────────────────────

async function handleDbPreview(req, res) {
  const userId = req.user.username;
  const startedAt = Date.now();
  const target = String(req.body?.target || "").trim();
  const page = Math.max(1, Number(req.body?.page) || 1);
  const pageSize = Math.max(1, Math.min(Number(req.body?.pageSize) || 20, 100));
  const searchTerm = String(req.body?.searchTerm || "").trim();
  // console.log(userId, startedAt, target, page, pageSize, "klsdjfjdsfjlsldfjk");
  if (!target) {
    return res
      .status(400)
      .json({ error: "Target table or collection is required." });
  }

  try {
    const result = await previewConnectedDatabase(userId, {
      target,
      page,
      pageSize,
      searchTerm,
    });
    // console.log(result, "klsdjfjdsfjlsldfjk");
    return res.json({
      ok: true,
      rows: result.rows || [],
      hasNext: result.hasNext === true,
      page: result.page || 1,
      pageSize: result.pageSize || 20,
      totalCount:
        Number.isFinite(Number(result.totalCount)) &&
        Number(result.totalCount) >= 0
          ? Number(result.totalCount)
          : null,
      executionMs: Date.now() - startedAt,
      executedQuery: result.executedQuery,
      vendor: result.vendor,
      integrationName: result.integrationName,
      canWrite: result.canWrite === true,
      permissions: result.permissions || {
        insert: false,
        update: false,
        delete: false,
      },
      table: result.table || null,
    });
  } catch (error) {
    console.error("[handleDbPreview]", error.message);
    return res.status(400).json({ error: error.message || "Preview failed." });
  }
}

// ─── handleDbMutation ─────────────────────────────────────────────────────────

async function handleDbMutation(req, res) {
  const userId = req.user.username;

  const action = String(req.body?.action || "").trim();
  if (!["insert", "update", "delete"].includes(action)) {
    return res
      .status(400)
      .json({ error: "action must be insert, update, or delete." });
  }

  const target = String(req.body?.target || "").trim();
  if (!target) {
    return res
      .status(400)
      .json({ error: "target table or collection is required." });
  }

  try {
    const result = await mutateConnectedDatabase(userId, req.body || {});
    return res.json({
      ok: true,
      action: result.action,
      affectedRows: result.affectedRows ?? 0,
      executedQuery: result.executedQuery || "",
      vendor: result.vendor,
      integrationName: result.integrationName,
    });
  } catch (error) {
    console.error("[handleDbMutation]", error.message);
    return res.status(400).json({ error: error.message || "Mutation failed." });
  }
}

module.exports = {
  handleDbChat,
  handleRawDbQuery,
  handleDbPreview,
  handleDbMutation,
};
