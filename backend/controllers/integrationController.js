const axios = require("axios");
const Integration = require("../models/Integration");
const {
  testDatabaseConnection,
  getDatabaseIntegration,
  loadDatabaseSchema,
  getSchemaTableCounts,
  requireDatabaseConfig,
} = require("../services/connectedDatabaseService");
const { testRazorpayConnection } = require("../services/tools/toolRazorpay");
const { toolRazorpayGetPayouts } = require("../services/tools/toolRazorpay");
const {
  buildSignalClientIntegration,
} = require("../services/signalMatrixService");
const {
  buildWhatsAppClientIntegration,
} = require("../services/whatsappMatrixService");

function sanitizeIntegrationForClient(integration) {
  if (!integration) return integration;
  if (integration.type === "signal") {
    return buildSignalClientIntegration(integration);
  }
  if (integration.type === "whatsapp") {
    return buildWhatsAppClientIntegration(integration);
  }
  return integration;
}

// ── GET /api/integrations ─────────────────────────────────
async function getIntegrations(req, res) {
  const userId = req.user?.username;
  const integrations = await Integration.find({ userId });
  res.json(integrations.map(sanitizeIntegrationForClient));
}

// ── POST /api/integrations/:type ──────────────────────────
async function saveIntegration(req, res) {
  const userId = req.user?.username;
  const { type } = req.params;
  const payload = req.body;

  try {
    if (type === "signal") {
      const {
        connectSignalIntegration,
      } = require("../services/signalMatrixService");
      const result = await connectSignalIntegration(userId, payload || {});
      return res.json({
        ok: true,
        integration: result.clientIntegration || result.integration || null,
        status: result.status || null,
      });
    }

    if (type === "whatsapp") {
      const {
        connectWhatsAppIntegration,
      } = require("../services/whatsappMatrixService");
      const result = await connectWhatsAppIntegration(userId, payload || {});
      return res.json({
        ok: true,
        integration: result.clientIntegration || result.integration || null,
        status: result.status || null,
      });
    }

    const doc = await Integration.findOneAndUpdate(
      { userId, type },
      {
        $set: {
          userId,
          type,
          name: payload.name || "",
          enabled: payload.enabled !== false,
          [type]: payload[type] || {},
          updatedAt: new Date(),
        },
      },
      { upsert: true, new: true }
    );
    res.json({ ok: true, integration: sanitizeIntegrationForClient(doc) });
  } catch (err) {
    console.error("Save integration error:", err.message);
    res.status(500).json({ error: err.message });
  }
}

// ── DELETE /api/integrations/:type ───────────────────────
async function deleteIntegration(req, res) {
  const userId = req.user?.username;
  const { type } = req.params;
  await Integration.findOneAndDelete({ userId, type });
  if (type === "signal") {
    const { invalidateSignalCache } = require("../services/signalMatrixService");
    invalidateSignalCache(userId);
  }
  if (type === "whatsapp") {
    const {
      invalidateWhatsAppCache,
    } = require("../services/whatsappMatrixService");
    invalidateWhatsAppCache(userId);
  }
  res.json({ ok: true });
}

// ── POST /api/integrations/:type/test ────────────────────
async function testIntegration(req, res) {
  const userId = req.user?.username;
  const { type } = req.params;

  const integration = await Integration.findOne({ userId, type });
  if (!integration)
    return res.status(404).json({ error: "Integration not found" });

  let ok = false;
  let message = "";

  try {
    if (type === "slack") {
      const { webhookUrl } = integration.slack;
      if (!webhookUrl) throw new Error("Webhook URL is required");

      await axios.post(webhookUrl, {
        text: "✅ *OrionAI Integration Test*\nSlack is connected successfully! 🔭",
      });
      ok = true;
      message = "Test message sent to Slack!";
    } else if (type === "google_docs") {
      const { listRecentDocuments } = require("../services/googleDocsService");
      await listRecentDocuments(userId, { limit: 1 });
      ok = true;
      message = "Google Docs connection verified!";
    } else if (type === "google_sheets") {
      const { listRecentSpreadsheets } = require("../services/googleSheetsService");
      await listRecentSpreadsheets(userId, { limit: 1 });
      ok = true;
      message = "Google Sheets connection verified!";
    } else if (type === "notion") {
      const { apiToken, databaseId } = integration.notion;
      if (!apiToken) throw new Error("API token is required");

      const endpoint = databaseId
        ? `https://api.notion.com/v1/databases/${databaseId}`
        : "https://api.notion.com/v1/users/me";

      await axios.get(endpoint, {
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Notion-Version": "2022-06-28",
        },
      });
      ok = true;
      message = "Notion connection verified!";
    } else if (type === "jira") {
      const { domain, email, apiToken } = integration.jira;
      if (!domain || !email || !apiToken)
        throw new Error("Domain, email and API token required");

      const auth = Buffer.from(`${email}:${apiToken}`).toString("base64");
      await axios.get(`https://${domain}/rest/api/3/myself`, {
        headers: { Authorization: `Basic ${auth}` },
      });
      ok = true;
      message = "Jira connection verified!";
    } else if (type === "webhook") {
      const { url, method = "POST", secret } = integration.webhook;
      if (!url) throw new Error("Webhook URL is required");

      const headers = { "Content-Type": "application/json" };
      if (secret) headers["X-OrionAI-Secret"] = secret;

      await axios({
        method,
        url,
        headers,
        data: { test: true, source: "OrionAI", timestamp: new Date() },
      });
      ok = true;
      message = "Webhook responded successfully!";
    } else if (type === "database") {
      const result = await testDatabaseConnection(integration.database || {});
      ok = true;
      message = result.message;
    } else if (type === "razorpay") {
      const result = await testRazorpayConnection(integration.razorpay || {});
      ok = true;
      message = result.message;
    } else if (type === "signal") {
      const { getSignalStatus } = require("../services/signalMatrixService");
      const status = await getSignalStatus(userId);
      if (!status.connected) {
        throw new Error(status.lastError || status.error || "Signal not connected");
      }
      ok = true;
      message = `Signal connected${
        status.profile?.displayName ? ` for ${status.profile.displayName}` : ""
      }${
        status.roomCount
          ? ` with ${status.roomCount} chat${status.roomCount === 1 ? "" : "s"}`
          : ""
      }.`;
    } else if (type === "whatsapp") {
      const { getWhatsAppStatus } = require("../services/whatsappMatrixService");
      const status = await getWhatsAppStatus(userId);
      if (!status.connected) {
        throw new Error(status.lastError || status.error || "WhatsApp not connected");
      }
      ok = true;
      message = `WhatsApp connected${
        status.profile?.displayName ? ` for ${status.profile.displayName}` : ""
      }${
        status.roomCount
          ? ` with ${status.roomCount} chat${status.roomCount === 1 ? "" : "s"}`
          : ""
      }.`;
    } else {
      message = `Test not implemented yet for ${type}`;
      ok = true;
    }

    // Save test result
    await Integration.findOneAndUpdate(
      { userId, type },
      { $set: { lastTestedAt: new Date(), lastTestOk: ok } }
    );

    res.json({ ok, message });
  } catch (err) {
    await Integration.findOneAndUpdate(
      { userId, type },
      { $set: { lastTestedAt: new Date(), lastTestOk: false } }
    );
    res
      .status(400)
      .json({ ok: false, error: err.response?.data?.message || err.message });
  }
}

async function getDatabaseSchemaPreview(req, res) {
  const userId = req.user?.username;

  try {
    const integration = await getDatabaseIntegration(userId);
    if (!integration) {
      return res.status(404).json({ error: "Database integration not found" });
    }

    const schema = await loadDatabaseSchema(
      requireDatabaseConfig(integration.database || {}),
      { force: true }
    );
    const config = requireDatabaseConfig(integration.database || {});
    const tableCounts = await getSchemaTableCounts(config, schema).catch(
      () => ({})
    );

    res.json({
      ok: true,
      vendor: integration.database?.vendor || null,
      name: integration.name || "Database",
      connection: {
        vendor:
          integration.database?.vendor === "postgres"
            ? "PostgreSQL"
            : integration.database?.vendor === "mysql"
              ? "MySQL"
              : integration.database?.vendor === "mongodb"
                ? "MongoDB"
                : integration.database?.vendor === "sqlite"
                  ? "SQLite"
                  : "Database",
        alias: integration.name || "Database",
        status: "ok",
        canWrite: integration.database?.readOnly === false,
      },
      tables: (schema.tables || []).map((table) => ({
        ...table,
        count:
          tableCounts[table.name] ??
          table.estimatedRows ??
          null,
        fieldNames:
          Array.isArray(table.fields) && table.fields.length
            ? table.fields.map((field) => field.name)
            : undefined,
      })),
    });
  } catch (err) {
    console.error("Database schema preview error:", err.message);
    res.status(400).json({ ok: false, error: err.message });
  }
}

async function getRazorpayOverview(req, res) {
  const userId = req.user?.username;

  try {
    const result = await toolRazorpayGetPayouts({ limit: 8 }, { userId });
    res.json({
      ok: true,
      count: result.count || 0,
      payouts: result.payouts || [],
      summary: result.summary || null,
    });
  } catch (err) {
    console.error("Razorpay overview error:", err.message);
    res.status(400).json({ ok: false, error: err.message });
  }
}

module.exports = {
  getIntegrations,
  saveIntegration,
  deleteIntegration,
  testIntegration,
  getDatabaseSchemaPreview,
  getRazorpayOverview,
};
