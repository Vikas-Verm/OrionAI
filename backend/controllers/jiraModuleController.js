const axios = require("axios");
const Integration = require("../models/Integration");

async function getJiraConfig(userId) {
  const integ = await Integration.findOne({ userId, type: "jira" });
  if (!integ?.jira?.domain || !integ?.jira?.email || !integ?.jira?.apiToken) {
    throw new Error("Jira not connected");
  }
  const domain = integ.jira.domain
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "");
  const auth = Buffer.from(
    `${integ.jira.email}:${integ.jira.apiToken}`
  ).toString("base64");
  return {
    base: `https://${domain}/rest/api/3`,
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    domain,
  };
}

function mapPriority(p) {
  const v = (p?.name || p || "").toLowerCase();
  if (v.includes("highest") || v.includes("critical")) return "highest";
  if (v.includes("high")) return "high";
  if (v.includes("medium")) return "medium";
  return "low";
}

function mapTicket(issue) {
  const f = issue.fields || {};
  const dueDate = f.duedate || null;
  const now = new Date();
  const due = dueDate ? new Date(dueDate) : null;
  const overdue =
    due &&
    due < now &&
    !["done", "closed", "resolved"].includes(
      (f.status?.name || "").toLowerCase()
    );
  const daysOverdue = overdue ? Math.floor((now - due) / 86400000) : 0;
  return {
    key: issue.key,
    title: f.summary || "",
    status: f.status?.name || "To Do",
    priority: mapPriority(f.priority),
    assignee: f.assignee?.displayName || null,
    dueDate: dueDate,
    overdue,
    daysOverdue,
    type: f.issuetype?.name || "Task",
    sprint: f.sprint?.name || null,
  };
}

// ── GET /api/jira/board ────────────────────────────────────
exports.getBoard = async (req, res) => {
  try {
    const userId = req.user?.username;
    const cfg = await getJiraConfig(userId);

    // Fetch open tickets across all statuses
    const jql = `project is not EMPTY AND statusCategory != Done ORDER BY updated DESC`;
    const r = await axios.get(`${cfg.base}/search`, {
      headers: cfg.headers,
      params: {
        jql,
        maxResults: 100,
        fields: "summary,status,priority,assignee,duedate,issuetype,sprint",
      },
    });

    const tickets = (r.data.issues || []).map(mapTicket);
    const projectKey = tickets[0]?.key?.split("-")[0] || "";

    res.json({ tickets, projectKey });
  } catch (err) {
    console.error("Jira board error:", err.response?.data || err.message);
    res.status(500).json({ error: err.message });
  }
};

// ── POST /api/jira/ticket ──────────────────────────────────
// body: { title, status, priority, assigneeEmail? }
exports.createTicket = async (req, res) => {
  try {
    const userId = req.user?.username;
    const cfg = await getJiraConfig(userId);
    const { title, priority, assigneeEmail } = req.body;

    // Get first available project key
    const projRes = await axios.get(`${cfg.base}/project/search`, {
      headers: cfg.headers,
      params: { maxResults: 1 },
    });
    const projectKey = projRes.data.values?.[0]?.key;
    if (!projectKey) throw new Error("No Jira project found");

    const body = {
      fields: {
        project: { key: projectKey },
        summary: title,
        issuetype: { name: "Task" },
        priority: { name: priority || "Medium" },
        ...(assigneeEmail ? { assignee: { emailAddress: assigneeEmail } } : {}),
      },
    };

    const r = await axios.post(`${cfg.base}/issue`, body, {
      headers: cfg.headers,
    });
    res.json({ key: r.data.key, success: true });
  } catch (err) {
    console.error("Jira create error:", err.response?.data || err.message);
    res.status(500).json({ error: err.message });
  }
};
