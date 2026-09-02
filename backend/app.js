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
const signalRoutes = require("./routes/signalRoutes");

const { gmailOAuthCallback } = require("./controllers/gmailOauthController");
const {
  googleDocsOAuthCallback,
} = require("./controllers/googleDocsOauthController");
const {
  googleSheetsOAuthCallback,
} = require("./controllers/googleSheetsOauthController");
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
const briefingRoutes = require("./routes/briefingRoutes");
const communicationRoutes = require("./routes/communicationRoutes");
const gifRoutes = require("./routes/gifRoutes");
const googleDocsRoutes = require("./routes/googleDocsRoutes");
const googleSheetsRoutes = require("./routes/googleSheetsRoutes");
const onboardingRoutes = require("./routes/onboardingRoutes");
const studyRoutes = require("./routes/studyRoutes");
const careerRoutes = require("./routes/careerRoutes");
const internalMessagingRoutes = require("./routes/internalMessagingRoutes");
const {
  initErrorMonitoring,
  attachErrorMonitoringContext,
  attachErrorMonitoringHandler,
} = require("./services/errorMonitoring");

const app = express();
initErrorMonitoring();

// ── CORS ──────────────────────────────────────────────────────────────────────
// Allow WebSocket upgrade requests from frontend
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    credentials: true,
  })
);

app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: true, limit: "25mb" }));
attachErrorMonitoringContext(app);

// Internal bridge callbacks authenticate with appservice credentials.
app.use("/internal/messaging", internalMessagingRoutes);

// ── Public ────────────────────────────────────────────────────────────────────
app.use("/auth", authRoutes);
app.get("/health", (req, res) => res.json({ status: "ok" }));

// ── OAuth callbacks (no auth — external services redirect here) ───────────────
app.get("/api/integrations/gmail/oauth/callback", gmailOAuthCallback);
app.get("/api/integrations/google-docs/oauth/callback", googleDocsOAuthCallback);
app.get("/api/integrations/google-sheets/oauth/callback", googleSheetsOAuthCallback);
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
app.use("/api/google-docs", authenticate, googleDocsRoutes);
app.use("/api/google-sheets", authenticate, googleSheetsRoutes);
app.use("/api/signal", signalRoutes);
app.post("/api/webhooks/gmail", handleGmailWebhook);
app.post("/api/webhooks/slack", handleSlackWebhook);

// ── Notifications REST (initial badge load + polling fallback) ────────────────
// WebSocket handles real-time; this handles the first page load
app.use("/api/notifications", notificationRoutes);
app.use("/api/briefing", authenticate, briefingRoutes);
app.use("/api/communications", authenticate, communicationRoutes);
app.use("/api/gifs", gifRoutes);
app.use("/api/whatsapp", whatsappRoutes);
app.use("/api/automations", automationRoutes);
app.use("/api/onboarding", authenticate, onboardingRoutes);
app.use("/api/study", authenticate, studyRoutes);
app.use("/api/career", authenticate, careerRoutes);
app.use("/auth/google", googleAuthRoutes);
app.use("/api/health", authenticate, healthRoutes);
app.get("/debug/gmail", async (req, res) => {
  const userId = req.user?.username;
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
    gmailFields: Object.keys(integration.gmail || {}),
  });
});

attachErrorMonitoringHandler(app);

module.exports = app;
