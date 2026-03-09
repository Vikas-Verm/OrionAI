const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/authRoutes");
const chatRoutes = require("./routes/chatRoutes");
const sessionRoutes = require("./routes/sessionRoutes");
const ragRoutes = require("./routes/ragRoutes");
const memoryRoutes = require("./routes/memoryRoutes");
const { authenticate } = require("./middleware/auth");
const dbQueryRoutes = require("./routes/dbQueryRoutes");
const app = express();
const fileRoutes = require("./routes/fileRoutes");
const chartRoutes = require("./routes/chartRoutes");
const searchRoutes = require("./routes/searchRoutes");
const agentRoutes = require("./routes/agentRoutes");
const integrationRoutes = require("./routes/integrationRoutes");
const { gmailOAuthCallback } = require("./controllers/gmailOauthController");
app.use(cors({ origin: process.env.FRONTEND_URL || "http://localhost:5173" }));
app.use(express.json());

app.use("/auth", authRoutes);
app.get("/health", (req, res) => res.json({ status: "ok" }));
// Protected routes — token required
app.get("/api/integrations/gmail/oauth/callback", gmailOAuthCallback);
app.use("/chat", authenticate, chatRoutes);
app.use("/sessions", authenticate, sessionRoutes);
app.use("/rag", authenticate, ragRoutes);
app.use("/memory", authenticate, memoryRoutes);
app.use("/db-chat", authenticate, dbQueryRoutes);
app.use("/files", authenticate, fileRoutes);
app.use("/chart", authenticate, chartRoutes);
app.use("/api", authenticate, searchRoutes);
app.use("/api/agent", agentRoutes);
app.use("/api/integrations", integrationRoutes);

// Health check
app.get("/health", (req, res) => res.json({ status: "ok" }));

module.exports = app;
