const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/authRoutes");
const chatRoutes = require("./routes/chatRoutes");
const sessionRoutes = require("./routes/sessionRoutes");
const ragRoutes = require("./routes/ragRoutes");
const memoryRoutes = require("./routes/memoryRoutes");
const { authenticate } = require("./middleware/auth");
const dbQueryRoutes = require("./routes/dbQueryRoutes");
const fileRoutes = require("./routes/fileRoutes");
const chartRoutes = require("./routes/chartRoutes");
const searchRoutes = require("./routes/searchRoutes");
const agentRoutes = require("./routes/agentRoutes");
const integrationRoutes = require("./routes/integrationRoutes");
const telegramRoutes = require("./routes/telegramRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const gmailModuleRoutes = require("./routes/gmailModuleRoutes");
const jiraModuleRoutes = require("./routes/jiraModuleRoutes");
const calendarModuleRoutes = require("./routes/calendarModuleRoutes");
const slackModuleRoutes = require("./routes/slackModuleRoutes");

const { gmailOAuthCallback } = require("./controllers/gmailOauthController");
const {
  googleCalendarOAuthCallback,
} = require("./controllers/googleCalenderOauthController");
const {
  slackOAuthStart,
  slackOAuthCallback,
} = require("./controllers/slackOAuthController");
const whatsappRoutes = require("./routes/whatsappRoutes");
const automationRoutes = require("./routes/automationRoutes");
const {
  handleGmailWebhook,
  handleSlackWebhook,
} = require("./services/websocketServer");
const googleAuthRoutes = require("./routes/googleAuthRoutes");
const healthRoutes = require("./routes/healthRoutes");

const app = express();

// ── CORS ──────────────────────────────────────────────────────────────────────
// Allow WebSocket upgrade requests from frontend
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    credentials: true,
  })
);

app.use(express.json());

// ── Public ────────────────────────────────────────────────────────────────────
app.use("/auth", authRoutes);
app.get("/health", (req, res) => res.json({ status: "ok" }));

// ── OAuth callbacks (no auth — external services redirect here) ───────────────
app.get("/api/integrations/gmail/oauth/callback", gmailOAuthCallback);
app.get(
  "/api/integrations/google-calendar/oauth/callback",
  googleCalendarOAuthCallback
);
app.get("/api/integrations/slack/oauth/start", authenticate, slackOAuthStart);
app.get("/api/integrations/slack/oauth/callback", slackOAuthCallback);

// ── Protected routes ──────────────────────────────────────────────────────────
app.use("/chat", authenticate, chatRoutes);
app.use("/sessions", authenticate, sessionRoutes);
app.use("/rag", authenticate, ragRoutes);
app.use("/memory", authenticate, memoryRoutes);
app.use("/db-chat", authenticate, dbQueryRoutes);
app.use("/files", authenticate, fileRoutes);
app.use("/chart", authenticate, chartRoutes);
app.use("/api", authenticate, searchRoutes);
app.use("/api/agent", authenticate, agentRoutes);
app.use("/api/integrations", authenticate, integrationRoutes);
app.use("/api/telegram", telegramRoutes);
app.use("/api/gmail", gmailModuleRoutes);
app.use("/api/jira", jiraModuleRoutes);
app.use("/api/calendar", calendarModuleRoutes);
app.use("/api/slack", slackModuleRoutes);
app.post("/api/webhooks/gmail", handleGmailWebhook);
app.post("/api/webhooks/slack", handleSlackWebhook);

// ── Notifications REST (initial badge load + polling fallback) ────────────────
// WebSocket handles real-time; this handles the first page load
app.use("/api/notifications", notificationRoutes);
app.use("/api/whatsapp", whatsappRoutes);
app.use("/api/automations", automationRoutes);
app.use("/auth/google", googleAuthRoutes);
app.use("/api/health", authenticate, healthRoutes);
app.get("/debug/gmail", async (req, res) => {
  const userId = req.user?.username;
  const mongoose = require("mongoose");
  const Integration = require("./models/Integration");

  const integration = await Integration.findOne({ userId, type: "gmail" });
  if (!integration)
    return res.json({ error: "No Gmail integration found", userId });

  res.json({
    userId,
    found: true,
    enabled: integration.enabled,
    hasRefreshToken: !!integration.gmail?.refreshToken,
    hasAccessToken: !!integration.gmail?.accessToken,
    userEmail: integration.gmail?.userEmail || "NOT STORED ← THIS IS THE BUG",
    historyId: integration.gmail?.historyId || "not set",
    // Check what fields exist on the gmail sub-object
    gmailFields: Object.keys(integration.gmail || {}),
  });
});

module.exports = app;
