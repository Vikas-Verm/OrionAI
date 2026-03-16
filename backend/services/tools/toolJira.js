/**
 * toolJira.js — Complete Jira integration for OrionAI
 *
 * Tools:
 * - getBacklog()           — all open tickets grouped by priority
 * - getOverdueTickets()    — tickets past due date, suggests new dates
 * - updateDueDates()       — bulk update overdue ticket due dates
 * - createTicket()         — create new ticket
 * - getMyTickets()         — tickets assigned to current user / specific user
 * - getSprintSummary()     — current sprint status
 * - moveTicket()           — change ticket status/transition  ← NEW
 * - assignTicket()         — reassign a ticket to someone     ← NEW
 * - addComment()           — add comment to a ticket          ← NEW
 * - getShippedLastSprint() — what the team shipped last sprint ← NEW
 * - getMostOverdue()       — who has the most overdue tickets  ← NEW
 * - getSprintBugs()        — all bugs in current sprint        ← NEW
 * - searchTickets()        — free-form NL → JQL search         ← NEW
 * - notifyOverdue()        — Slack + Email notify for overdue  ← NEW
 */

const axios = require("axios");
const Integration = require("../../models/Integration");

// ── Jira client factory ───────────────────────────────────
async function getJiraClient(userId) {
  if (userId) {
    const integration = await Integration.findOne({
      userId,
      type: "jira",
      enabled: true,
    });
    if (integration?.jira?.domain && integration?.jira?.apiToken) {
      return buildClient(integration.jira);
    }
  }
  if (process.env.JIRA_DOMAIN && process.env.JIRA_API_TOKEN) {
    return buildClient({
      domain: process.env.JIRA_DOMAIN,
      email: process.env.JIRA_EMAIL,
      apiToken: process.env.JIRA_API_TOKEN,
      projectKey: process.env.JIRA_PROJECT_KEY || "ENGG",
    });
  }
  throw new Error("Jira not configured. Go to Settings → Integrations → Jira.");
}

function buildClient(cfg) {
  const domain = cfg.domain.replace("https://", "").replace(/\/$/, "");
  const auth = Buffer.from(`${cfg.email}:${cfg.apiToken}`).toString("base64");
  const headers = {
    Authorization: `Basic ${auth}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  const client = axios.create({
    baseURL: `https://${domain}/rest/api/3`,
    headers,
  });
  const agileClient = axios.create({
    baseURL: `https://${domain}/rest/agile/1.0`,
    headers,
  });
  const errHandler = (err) => {
    const status = err.response?.status;
    const url = err.config?.url;
    const detail = JSON.stringify(err.response?.data);
    return Promise.reject(err);
  };
  client.interceptors.response.use((r) => r, errHandler);
  agileClient.interceptors.response.use((r) => r, errHandler);
  return { client, agileClient, domain, projectKey: cfg.projectKey || "ENGG" };
}

// ─────────────────────────────────────────────
// SAFE JIRA SEARCH (handles API changes)
// ─────────────────────────────────────────────

async function jiraSearch(client, params) {
  try {
    // Preferred (new API)
    return await client.get("/search/jql", { params });
  } catch (err) {
    const msg = err.response?.data?.errorMessages?.join(" ") || "";

    // Atlassian removed endpoint → fallback automatically
    if (
      msg.includes("requested API has been removed") ||
      err.response?.status === 404
    ) {
      console.warn("⚠️ Falling back to /search endpoint");

      return await client.get("/search", { params });
    }

    throw err;
  }
}
const userCache = new Map();

async function resolveJiraUser(client, name) {
  if (!name) return null;

  const key = name.toLowerCase();

  if (userCache.has(key)) {
    return userCache.get(key);
  }

  try {
    const res = await client.get("/user/search", {
      params: { query: name, maxResults: 5 },
    });

    const users = res.data || [];
    if (!users.length) return null;

    const lower = name.toLowerCase();

    const best =
      users.find((u) => u.displayName.toLowerCase().startsWith(lower)) ||
      users.find((u) => u.displayName.toLowerCase().includes(lower)) ||
      users[0];

    const result = {
      accountId: best.accountId,
      displayName: best.displayName,
    };

    userCache.set(key, result);

    return result;
  } catch (e) {
    console.error("User resolve failed:", e.message);
    return null;
  }
}

async function safeJira(fn, retries = 2) {
  try {
    return await fn();
  } catch (err) {
    const status = err.response?.status;

    if (retries > 0 && [429, 500, 502, 503].includes(status)) {
      await new Promise((r) => setTimeout(r, 1200));
      return safeJira(fn, retries - 1);
    }

    throw err;
  }
}

// ── Helper: format ticket ─────────────────────────────────
function formatTicket(issue) {
  const f = issue.fields;
  const dueDate = f.duedate || null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = dueDate ? new Date(dueDate) : null;
  const overdue = due && due < today;
  const daysOverdue = due ? Math.floor((today - due) / 86400000) : 0;
  return {
    key: issue.key,
    id: issue.id,
    title: f.summary,
    status: f.status?.name || "Unknown",
    priority: f.priority?.name || "Medium",
    assignee: f.assignee?.displayName || "Unassigned",
    assigneeId: f.assignee?.accountId || null,
    assigneeEmail: issue.fields.assignee?.emailAddress || null,
    dueDate,
    overdue,
    daysOverdue,
    suggestedDueDate: overdue
      ? new Date(today.getTime() + (daysOverdue + 7) * 86400000)
          .toISOString()
          .split("T")[0]
      : null,
    type: f.issuetype?.name || "Task",
    sprint: null,
    labels: f.labels || [],

    created: f.created,
    updated: f.updated,
  };
}

function priorityEmoji(priority) {
  return (
    { Highest: "🔴", High: "🟠", Medium: "🟡", Low: "🟢", Lowest: "⚪" }[
      priority
    ] || "⚪"
  );
}

// ─────────────────────────────────────────────────────────
// TOOL 1: getBacklog
// ─────────────────────────────────────────────────────────
async function toolGetBacklog(params, ctx) {
  const { projectKey: overrideKey, maxResults = 50 } = params;
  const { client, projectKey } = await getJiraClient(ctx.userId);

  const key = overrideKey || projectKey;

  const jql = `
    project = ${key}
    AND statusCategory != Done
    ORDER BY priority ASC, created DESC
  `;

  const res = await safeJira(() =>
    jiraSearch(client, {
      jql,
      maxResults,
      fields:
        "summary,status,priority,assignee,duedate,issuetype,labels,created,updated",
    })
  );

  const tickets = (res.data.issues || []).map(formatTicket);

  return {
    projectKey: key,
    totalOpen: tickets.length,
    tickets,
    summary: `📋 ${key} backlog — ${tickets.length} open tickets`,
  };
}

// ─────────────────────────────────────────────────────────
// TOOL 2: getOverdueTickets
// ─────────────────────────────────────────────────────────
async function toolGetOverdueTickets(params, ctx) {
  const { projectKey: overrideKey } = params;
  const { client, projectKey } = await getJiraClient(ctx.userId);

  const key = overrideKey || projectKey;
  const today = new Date().toISOString().split("T")[0];

  const jql = `
    project = ${key}
    AND statusCategory != Done
    AND duedate < "${today}"
    ORDER BY duedate ASC
  `;

  const res = await safeJira(() =>
    jiraSearch(client, {
      jql,
      maxResults: 50,
      fields: "summary,status,priority,assignee,duedate,issuetype",
    })
  );

  const tickets = (res.data.issues || []).map(formatTicket);

  return {
    projectKey: key,
    count: tickets.length,
    tickets,
    summary: tickets.length
      ? `⚠️ ${tickets.length} overdue tickets`
      : `✅ No overdue tickets`,
  };
}

// ─────────────────────────────────────────────────────────
// TOOL 3: updateDueDates
// ─────────────────────────────────────────────────────────
async function toolUpdateDueDates(params, ctx) {
  const {
    tickets: ticketList,
    projectKey: overrideKey,
    daysToAdd = 7,
  } = params;
  const { client, projectKey } = await getJiraClient(ctx.userId);
  const key = overrideKey || projectKey;

  let toUpdate = ticketList;
  if (!toUpdate || !toUpdate.length) {
    const overdueResult = await toolGetOverdueTickets({ projectKey: key }, ctx);
    toUpdate = overdueResult.tickets;
  }
  if (!toUpdate.length)
    return { updated: 0, summary: "✅ No overdue tickets to update!" };

  const updated = [],
    failed = [];
  for (const ticket of toUpdate) {
    const newDate =
      ticket.suggestedDueDate ||
      new Date(Date.now() + daysToAdd * 86400000).toISOString().split("T")[0];
    try {
      await client.put(`/issue/${ticket.key}`, {
        fields: { duedate: newDate },
      });
      updated.push({ key: ticket.key, title: ticket.title, newDate });
    } catch (err) {
      failed.push({
        key: ticket.key,
        error: err.response?.data?.errorMessages?.[0] || err.message,
      });
    }
  }

  const lines = [
    `✅ Updated ${updated.length} ticket${
      updated.length > 1 ? "s" : ""
    } in Jira\n`,
  ];
  for (const t of updated)
    lines.push(`• ${t.key}: new due date → ${t.newDate}`);
  if (failed.length) {
    lines.push(`\n❌ Failed to update ${failed.length} tickets:`);
    for (const f of failed) lines.push(`• ${f.key}: ${f.error}`);
  }

  return {
    updated: updated.length,
    failed: failed.length,
    tickets: updated,
    summary: lines.join("\n"),
  };
}

// ─────────────────────────────────────────────────────────
// TOOL 4: createTicket
// ─────────────────────────────────────────────────────────
async function toolCreateTicket(params, ctx) {
  const {
    title,
    description = "",
    priority = "Medium",
    issueType = "Task",
    dueDate = null,
    labels = [],
    projectKey: overrideKey,
  } = params;
  // ← removed assigneeId from destructuring

  if (!title) throw new Error("Ticket title is required");

  const { client, projectKey, domain } = await getJiraClient(ctx.userId);
  const key = overrideKey || projectKey;

  // Handle "assign to me/myself" edge case
  if (
    params.assigneeName &&
    ["me", "myself", "i", "my"].includes(
      params.assigneeName.toLowerCase().trim()
    )
  ) {
    params.assigneeName = null;
    params.assigneeId = null;
  }

  if (params.assigneeName && !params.assigneeId) {
    try {
      const userRes = await client.get("/user/search", {
        params: { query: params.assigneeName, maxResults: 5 },
      });
      const users = userRes.data || [];
      const matched =
        users.find((u) =>
          u.displayName
            ?.toLowerCase()
            .includes(params.assigneeName.toLowerCase())
        ) || users[0];

      if (matched) {
        params.assigneeId = matched.accountId;
        console.log(
          `✅ Resolved "${params.assigneeName}" → ${matched.displayName}`
        );
      }
    } catch (err) {
      console.warn("User lookup failed:", err.message);
    }
  } else if (!params.assigneeName && !params.assigneeId) {
    try {
      const meRes = await client.get("/myself");
      params.assigneeId = meRes.data.accountId;
      console.log(
        `✅ Auto-assigned to current user: ${meRes.data.displayName}`
      );
    } catch (err) {
      console.warn("Could not fetch current user:", err.message);
    }
  }

  const body = {
    fields: {
      project: { key },
      summary: title,
      issuetype: { name: issueType },
      priority: { name: priority },
      labels,
      description: {
        type: "doc",
        version: 1,
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: description || title }],
          },
        ],
      },
    },
  };

  // ✅ Use params.assigneeId — always has the latest resolved value
  if (params.assigneeId)
    body.fields.assignee = { accountId: params.assigneeId };
  if (dueDate) body.fields.duedate = dueDate;

  const res = await client.post("/issue", body);
  const ticketKey = res.data.key;
  const url = `https://${domain}/browse/${ticketKey}`;

  return {
    key: ticketKey,
    url,
    title,
    priority,
    dueDate,
    summary: `🎫 Created *${ticketKey}* — ${title}\n🔗 ${url}`,
  };
}

// ─────────────────────────────────────────────────────────
// TOOL 5: getMyTickets
// ─────────────────────────────────────────────────────────
async function toolGetMyTickets(params, ctx) {
  const {
    projectKey: overrideKey,
    maxResults = 100,
    assignee = null,
    showAll = false,
  } = params;

  const { client, projectKey } = await getJiraClient(ctx.userId);
  const key = overrideKey || projectKey;

  /* -------------------------------------------------- */
  /* 1️⃣ CONNECTION HEALTH CHECK */
  /* -------------------------------------------------- */
  try {
    await client.get("/myself"); // verifies token validity
  } catch (err) {
    if ([401, 403].includes(err.response?.status)) {
      return {
        success: false,
        needsReconnect: true,
        tickets: [],
        count: 0,
        summary:
          "🔐 Your Jira connection has expired. Please reconnect your Jira account.",
      };
    }

    return {
      success: false,
      tickets: [],
      count: 0,
      summary: "⚠️ Unable to verify Jira connection right now.",
    };
  }

  /* -------------------------------------------------- */
  /* 2️⃣ BUILD ASSIGNEE FILTER */
  /* -------------------------------------------------- */
  let assigneeFilter = "assignee = currentUser()";
  let label = "Your";

  if (showAll || assignee === "all" || assignee === "everyone") {
    assigneeFilter = "assignee is not EMPTY";
    label = "All users";
  } else if (assignee) {
    const resolvedUser = await resolveJiraUser(client, assignee);

    if (!resolvedUser) {
      return {
        success: true,
        tickets: [],
        count: 0,
        summary: `❌ No Jira user found matching "${assignee}"`,
      };
    }

    assigneeFilter = `assignee = ${resolvedUser.accountId}`;
    label = resolvedUser.displayName;
  }

  const jql = `
    project = ${key}
    AND ${assigneeFilter}
    AND statusCategory != Done
    ORDER BY duedate ASC
  `;

  /* -------------------------------------------------- */
  /* 3️⃣ FETCH TICKETS SAFELY */
  /* -------------------------------------------------- */
  let res;

  try {
    res = await safeJira(() =>
      jiraSearch(client, {
        jql,
        maxResults,
        fields: "summary,status,priority,assignee,duedate,issuetype",
      })
    );
  } catch (err) {
    const status = err.response?.status;

    if (status === 401 || status === 403) {
      return {
        success: false,
        needsReconnect: true,
        tickets: [],
        count: 0,
        summary:
          "🔐 Jira authentication expired. Please reconnect your account.",
      };
    }

    if (status === 400) {
      return {
        success: false,
        tickets: [],
        count: 0,
        summary: "⚠️ Jira query failed (JQL error or API change).",
      };
    }

    console.error("Jira API Error:", err.message);

    return {
      success: false,
      tickets: [],
      count: 0,
      summary: "⚠️ Unable to fetch Jira tickets right now.",
    };
  }

  /* -------------------------------------------------- */
  /* 4️⃣ FORMAT RESULTS */
  /* -------------------------------------------------- */
  const issues = res.data?.issues || [];
  const tickets = issues.map(formatTicket);
  const count = tickets.length;

  if (!count) {
    return {
      success: true,
      tickets: [],
      count: 0,
      summary: `✅ No open tickets for ${label} in ${key}!`,
    };
  }

  const overdueTickets = tickets.filter((t) => t.overdue);

  /* -------------------------------------------------- */
  /* 5️⃣ GROUP BY ASSIGNEE (SHOW ALL MODE) */
  /* -------------------------------------------------- */
  if (showAll || assignee === "all" || assignee === "everyone") {
    const byAssignee = {};

    for (const t of tickets) {
      const name = t.assignee || "Unassigned";
      if (!byAssignee[name]) byAssignee[name] = [];
      byAssignee[name].push(t);
    }

    const lines = [
      `👥 *All open tickets in ${key}* — ${count} total`,
      overdueTickets.length ? `⚠️ ${overdueTickets.length} overdue` : "",
    ];

    for (const [person, pts] of Object.entries(byAssignee)) {
      const pOverdue = pts.filter((t) => t.overdue).length;

      lines.push(
        `\n👤 *${person}* — ${pts.length} ticket${pts.length > 1 ? "s" : ""}${
          pOverdue ? ` (${pOverdue} overdue)` : ""
        }`
      );

      for (const t of pts.slice(0, 5)) {
        const due = t.dueDate ? `Due: ${t.dueDate}` : "No due date";

        lines.push(
          `  ${priorityEmoji(t.priority)} ${t.key}: ${t.title.slice(
            0,
            50
          )} • ${due}${t.overdue ? " ⚠️" : ""}`
        );
      }

      if (pts.length > 5) lines.push(`  ... and ${pts.length - 5} more`);
    }

    return {
      success: true,
      tickets,
      count,
      byAssignee,
      summary: lines.join("\n"),
    };
  }

  /* -------------------------------------------------- */
  /* 6️⃣ SINGLE USER SUMMARY */
  /* -------------------------------------------------- */
  const lines = [
    `👤 *${label}'s open tickets in ${key}* — ${count} total`,
    overdueTickets.length ? `⚠️ ${overdueTickets.length} overdue` : "",
  ];

  for (const t of tickets) {
    const due = t.dueDate ? `Due: ${t.dueDate}` : "No due date";

    lines.push(
      `${priorityEmoji(t.priority)} *${t.key}* — ${t.title.slice(0, 55)}`
    );

    lines.push(
      `   ${t.status} • ${due}${
        t.overdue ? ` ⚠️ ${t.daysOverdue}d overdue` : ""
      } • ${t.assignee}`
    );
  }

  return {
    success: true,
    tickets,
    count,
    summary: lines.join("\n"),
  };
}

// Helper to fetch email by accountId
// async function getAssigneeEmail(client, accountId) {
//     if (!accountId) return null;
//     try {

//     } catch {
//       return null;
//     }
//   }

// ─────────────────────────────────────────────────────────
// TOOL 6: getSprintSummary
// ─────────────────────────────────────────────────────────
async function toolGetSprintSummary(params, ctx) {
  const { projectKey: overrideKey } = params;
  const { client, agileClient, projectKey } = await getJiraClient(ctx.userId);
  const key = overrideKey || projectKey;
  let tickets = [];

  try {
    const boardsRes = await agileClient.get("/board", {
      params: { projectKeyOrId: key },
    });
    const board = boardsRes.data.values?.[0];
    if (board) {
      const sprintsRes = await agileClient.get(`/board/${board.id}/sprint`, {
        params: { state: "active" },
      });
      const activeSprint = sprintsRes.data.values?.[0];
      if (activeSprint) {
        const issuesRes = await agileClient.get(
          `/sprint/${activeSprint.id}/issue`,
          {
            params: {
              maxResults: 100,
              fields: "summary,status,priority,assignee,duedate,issuetype",
            },
          }
        );
        tickets = issuesRes.data.issues.map(formatTicket);
      }
    }
  } catch {
    const jql = `project = ${key} AND statusCategory != Done ORDER BY created DESC`;
    const res = await safeJira(() =>
      jiraSearch(client, {
        jql,
        maxResults: 50,
        fields: "summary,status,priority,assignee,duedate,issuetype",
      })
    );
    tickets = res.data.issues.map(formatTicket);
  }

  if (!tickets.length)
    return {
      tickets: [],
      summary: `No active sprint or open tickets found in ${key}.`,
    };

  const done = tickets.filter((t) => t.status === "Done");
  const inProgress = tickets.filter((t) => t.status === "In Progress");
  const toDo = tickets.filter((t) => t.status === "To Do");
  const overdue = tickets.filter((t) => t.overdue);
  const total = tickets.length;
  const donePct = Math.round((done.length / total) * 100);

  const lines = [
    `🏃 *Sprint Summary — ${key}*`,
    `Progress: ${"█".repeat(Math.floor(donePct / 10))}${"░".repeat(
      10 - Math.floor(donePct / 10)
    )} ${donePct}%\n`,
    `✅ Done:        ${done.length}`,
    `🔄 In Progress: ${inProgress.length}`,
    `📋 To Do:       ${toDo.length}`,
    overdue.length ? `⚠️ Overdue:     ${overdue.length}` : "",
    `\n*Total:* ${total} tickets`,
  ].filter(Boolean);

  if (inProgress.length) {
    lines.push("\n*In Progress:*");
    for (const t of inProgress.slice(0, 5))
      lines.push(`• ${t.key}: ${t.title.slice(0, 55)} — ${t.assignee}`);
  }
  if (overdue.length) {
    lines.push("\n*⚠️ Overdue tickets need attention:*");
    for (const t of overdue.slice(0, 3))
      lines.push(
        `• ${t.key}: ${t.title.slice(0, 55)} (${t.daysOverdue}d overdue)`
      );
  }

  return {
    total,
    done: done.length,
    inProgress: inProgress.length,
    toDo: toDo.length,
    overdue: overdue.length,
    tickets,
    summary: lines.join("\n"),
  };
}

// ─────────────────────────────────────────────────────────
// TOOL 7: moveTicket — change ticket status via transition ← NEW
// ─────────────────────────────────────────────────────────
async function toolMoveTicket(params, ctx) {
  const { ticketKey, targetStatus } = params;
  if (!ticketKey || !targetStatus)
    throw new Error("ticketKey and targetStatus are required");

  const { client, domain } = await getJiraClient(ctx.userId);

  // Fetch available transitions for this ticket
  const transRes = await client.get(`/issue/${ticketKey}/transitions`);
  const transitions = transRes.data.transitions || [];

  // Find best matching transition (case-insensitive fuzzy match)
  const target = targetStatus.toLowerCase();
  const match = transitions.find(
    (t) =>
      t.name.toLowerCase() === target ||
      t.name.toLowerCase().includes(target) ||
      target.includes(t.name.toLowerCase())
  );

  if (!match) {
    const available = transitions.map((t) => t.name).join(", ");
    return {
      success: false,
      ticketKey,
      summary: `❌ Could not find transition "${targetStatus}" for ${ticketKey}.\nAvailable transitions: ${available}`,
    };
  }

  await client.post(`/issue/${ticketKey}/transitions`, {
    transition: { id: match.id },
  });

  return {
    success: true,
    ticketKey,
    newStatus: match.name,
    url: `https://${domain}/browse/${ticketKey}`,
    summary: `✅ Moved *${ticketKey}* → *${match.name}*\n🔗 https://${domain}/browse/${ticketKey}`,
  };
}

// ─────────────────────────────────────────────────────────
// TOOL 8: assignTicket — reassign a ticket ← NEW
// ─────────────────────────────────────────────────────────
async function toolAssignTicket(params, ctx) {
  const { ticketKey, assigneeName, assigneeEmail } = params;
  if (!ticketKey) throw new Error("ticketKey is required");
  if (!assigneeName && !assigneeEmail)
    throw new Error("assigneeName or assigneeEmail is required");

  const { client, domain } = await getJiraClient(ctx.userId);

  // Search for user by name or email
  const query = assigneeEmail || assigneeName;
  const userRes = await client.get("/user/search", {
    params: { query, maxResults: 5 },
  });
  const users = userRes.data || [];

  if (!users.length) {
    return {
      success: false,
      ticketKey,
      summary: `❌ No Jira user found matching "${query}". Check the name or email and try again.`,
    };
  }

  // Pick best match
  const user =
    users.find(
      (u) =>
        u.displayName
          ?.toLowerCase()
          .includes((assigneeName || "").toLowerCase()) ||
        u.emailAddress?.toLowerCase() === (assigneeEmail || "").toLowerCase()
    ) || users[0];

  await client.put(`/issue/${ticketKey}/assignee`, {
    accountId: user.accountId,
  });

  return {
    success: true,
    ticketKey,
    assignee: user.displayName,
    assigneeId: user.accountId,
    url: `https://${domain}/browse/${ticketKey}`,
    summary: `✅ Assigned *${ticketKey}* to *${user.displayName}*\n🔗 https://${domain}/browse/${ticketKey}`,
  };
}

// ─────────────────────────────────────────────────────────
// TOOL 9: addComment — add a comment to a ticket ← NEW
// ─────────────────────────────────────────────────────────
async function toolAddComment(params, ctx) {
  const { ticketKey, comment } = params;
  if (!ticketKey || !comment)
    throw new Error("ticketKey and comment are required");

  const { client, domain } = await getJiraClient(ctx.userId);

  await client.post(`/issue/${ticketKey}/comment`, {
    body: {
      type: "doc",
      version: 1,
      content: [
        { type: "paragraph", content: [{ type: "text", text: comment }] },
      ],
    },
  });

  return {
    success: true,
    ticketKey,
    comment,
    url: `https://${domain}/browse/${ticketKey}`,
    summary: `💬 Comment added to *${ticketKey}*\n"${comment.slice(0, 80)}${
      comment.length > 80 ? "…" : ""
    }"\n🔗 https://${domain}/browse/${ticketKey}`,
  };
}

// ─────────────────────────────────────────────────────────
// TOOL 10: getShippedLastSprint — what team shipped ← NEW
// ─────────────────────────────────────────────────────────
async function toolGetShippedLastSprint(params, ctx) {
  const { projectKey: overrideKey } = params;
  const { client, agileClient, projectKey } = await getJiraClient(ctx.userId);
  const key = overrideKey || projectKey;
  let tickets = [];
  let sprintName = "Last Sprint";

  try {
    const boardsRes = await agileClient.get("/board", {
      params: { projectKeyOrId: key },
    });
    const board = boardsRes.data.values?.[0];

    if (board) {
      // Get closed sprints, sorted by end date descending
      const sprintsRes = await agileClient.get(`/board/${board.id}/sprint`, {
        params: { state: "closed" },
      });
      const sprints = sprintsRes.data.values || [];
      // Most recently closed sprint
      const lastSprint = sprints.sort(
        (a, b) => new Date(b.endDate) - new Date(a.endDate)
      )[0];

      if (lastSprint) {
        sprintName = lastSprint.name;
        const issuesRes = await agileClient.get(
          `/sprint/${lastSprint.id}/issue`,
          {
            params: {
              maxResults: 100,
              fields:
                "summary,status,priority,assignee,duedate,issuetype,resolutiondate",
            },
          }
        );
        // Only Done tickets = shipped
        tickets = issuesRes.data.issues
          .map(formatTicket)
          .filter(
            (t) =>
              t.status.toLowerCase().includes("done") ||
              t.status.toLowerCase().includes("closed")
          );
      }
    }
  } catch {
    // Fallback: recently resolved via JQL
    const jql = `project = ${key} AND statusCategory = Done AND updated >= -14d ORDER BY updated DESC`;
    const res = await safeJira(() =>
      jiraSearch(client, {
        jql,
        maxResults,
        fields: "summary,status,priority,assignee,duedate,issuetype",
      })
    );
    tickets = res.data.issues.map(formatTicket);
    sprintName = "Last 2 Weeks";
  }

  if (!tickets.length) {
    return {
      tickets: [],
      sprintName,
      summary: `No shipped tickets found for ${sprintName} in ${key}.`,
    };
  }

  // Group by assignee to show individual contributions
  const byAssignee = {};
  for (const t of tickets) {
    const name = t.assignee || "Unassigned";
    if (!byAssignee[name]) byAssignee[name] = [];
    byAssignee[name].push(t);
  }

  const lines = [
    `🚀 *Shipped in ${sprintName}* — ${tickets.length} tickets completed\n`,
  ];
  for (const [person, pts] of Object.entries(byAssignee)) {
    lines.push(
      `👤 *${person}* — ${pts.length} ticket${pts.length !== 1 ? "s" : ""}`
    );
    for (const t of pts) {
      lines.push(`  ✅ ${t.key}: ${t.title.slice(0, 60)}`);
    }
  }

  // Breakdown by type
  const bugs = tickets.filter((t) => t.type?.toLowerCase().includes("bug"));
  const stories = tickets.filter((t) =>
    t.type?.toLowerCase().includes("story")
  );
  const tasks = tickets.filter((t) => t.type?.toLowerCase().includes("task"));
  lines.push(
    `\n📊 *Breakdown:* ${bugs.length} bugs fixed • ${stories.length} stories • ${tasks.length} tasks`
  );

  return {
    tickets,
    sprintName,
    byAssignee,
    total: tickets.length,
    summary: lines.join("\n"),
  };
}

// ─────────────────────────────────────────────────────────
// TOOL 11: getMostOverdue — who has most overdue ← NEW
// ─────────────────────────────────────────────────────────
async function toolGetMostOverdue(params, ctx) {
  const { projectKey: overrideKey } = params;
  const { client, projectKey } = await getJiraClient(ctx.userId);
  const key = overrideKey || projectKey;

  const today = new Date().toISOString().split("T")[0];
  const jql = `project = ${key} AND statusCategory != Done AND duedate < "${today}" ORDER BY duedate ASC`;
  const res = await safeJira(() =>
    jiraSearch(client, {
      jql,
      maxResults,
      fields: "summary,status,priority,assignee,duedate,issuetype",
    })
  );

  const tickets = res.data.issues.map(formatTicket);
  if (!tickets.length) {
    return {
      tickets: [],
      summary: `✅ No overdue tickets in ${key}! Everyone is on track.`,
    };
  }

  // Group by assignee with total overdue days as severity score
  const byAssignee = {};
  for (const t of tickets) {
    const name = t.assignee || "Unassigned";
    if (!byAssignee[name])
      byAssignee[name] = { tickets: [], totalDaysOverdue: 0 };
    byAssignee[name].tickets.push(t);
    byAssignee[name].totalDaysOverdue += t.daysOverdue;
  }

  // Sort by ticket count descending
  const sorted = Object.entries(byAssignee).sort(
    (a, b) => b[1].tickets.length - a[1].tickets.length
  );

  const lines = [
    `⚠️ *Overdue Tickets by Assignee — ${key}*\n`,
    `${tickets.length} total overdue across ${sorted.length} people\n`,
  ];
  for (const [person, data] of sorted) {
    const worst = data.tickets.reduce((a, b) =>
      a.daysOverdue > b.daysOverdue ? a : b
    );
    lines.push(
      `👤 *${person}* — ${data.tickets.length} overdue (worst: ${worst.daysOverdue}d)`
    );
    for (const t of data.tickets.slice(0, 3)) {
      lines.push(
        `  ${priorityEmoji(t.priority)} ${t.key}: ${t.title.slice(0, 50)} • ${
          t.daysOverdue
        }d overdue`
      );
    }
    if (data.tickets.length > 3)
      lines.push(`  ... and ${data.tickets.length - 3} more`);
  }

  // Top offender
  const [topPerson, topData] = sorted[0];
  lines.push(
    `\n🏆 Most overdue: *${topPerson}* with ${topData.tickets.length} tickets (${topData.totalDaysOverdue} total days overdue)`
  );

  return {
    tickets,
    byAssignee: Object.fromEntries(sorted.map(([k, v]) => [k, v.tickets])),
    sorted,
    summary: lines.join("\n"),
  };
}

// ─────────────────────────────────────────────────────────
// TOOL 12: getSprintBugs — all bugs in current sprint ← NEW
// ─────────────────────────────────────────────────────────
async function toolGetSprintBugs(params, ctx) {
  const { projectKey: overrideKey } = params;
  const { client, agileClient, projectKey } = await getJiraClient(ctx.userId);
  const key = overrideKey || projectKey;
  let tickets = [];
  let sprintName = "Current Sprint";

  try {
    const boardsRes = await agileClient.get("/board", {
      params: { projectKeyOrId: key },
    });
    const board = boardsRes.data.values?.[0];
    if (board) {
      const sprintsRes = await agileClient.get(`/board/${board.id}/sprint`, {
        params: { state: "active" },
      });
      const activeSprint = sprintsRes.data.values?.[0];
      if (activeSprint) {
        sprintName = activeSprint.name;
        const issuesRes = await agileClient.get(
          `/sprint/${activeSprint.id}/issue`,
          {
            params: {
              maxResults: 100,
              fields: "summary,status,priority,assignee,duedate,issuetype",
            },
          }
        );
        tickets = issuesRes.data.issues
          .map(formatTicket)
          .filter((t) => t.type?.toLowerCase().includes("bug"));
      }
    }
  } catch {
    // Fallback JQL
    const jql = `project = ${key} AND issuetype = Bug AND statusCategory != Done ORDER BY priority ASC`;
    const res = await safeJira(() =>
      jiraSearch(client, {
        jql,
        maxResults,
        fields: "summary,status,priority,assignee,duedate,issuetype",
      })
    );
    tickets = res.data.issues.map(formatTicket);
    sprintName = "Backlog";
  }

  if (!tickets.length) {
    return {
      tickets: [],
      sprintName,
      summary: `✅ No bugs found in ${sprintName} for ${key}!`,
    };
  }

  const open = tickets.filter((t) => !t.status.toLowerCase().includes("done"));
  const fixed = tickets.filter((t) => t.status.toLowerCase().includes("done"));
  const critical = tickets.filter((t) =>
    ["highest", "high", "critical"].includes(t.priority?.toLowerCase())
  );
  const overdue = tickets.filter((t) => t.overdue);

  const lines = [
    `🐛 *Bugs in ${sprintName} — ${key}*`,
    `${tickets.length} total • ${open.length} open • ${fixed.length} fixed${
      overdue.length ? ` • ⚠️ ${overdue.length} overdue` : ""
    }\n`,
  ];

  if (critical.length) {
    lines.push(`🔴 *Critical/High Priority (${critical.length}):*`);
    for (const t of critical) {
      lines.push(
        `  ${priorityEmoji(t.priority)} ${t.key}: ${t.title.slice(0, 55)} — ${
          t.status
        } • ${t.assignee}`
      );
    }
  }

  const others = open.filter(
    (t) => !["highest", "high", "critical"].includes(t.priority?.toLowerCase())
  );
  if (others.length) {
    lines.push(`\n🟡 *Other Open Bugs (${others.length}):*`);
    for (const t of others) {
      lines.push(
        `  ${priorityEmoji(t.priority)} ${t.key}: ${t.title.slice(0, 55)} — ${
          t.status
        } • ${t.assignee}`
      );
    }
  }

  if (fixed.length) {
    lines.push(`\n✅ *Fixed (${fixed.length}):*`);
    for (const t of fixed.slice(0, 5))
      lines.push(`  ${t.key}: ${t.title.slice(0, 55)}`);
    if (fixed.length > 5) lines.push(`  ... and ${fixed.length - 5} more`);
  }

  return {
    tickets,
    sprintName,
    open: open.length,
    fixed: fixed.length,
    critical: critical.length,
    summary: lines.join("\n"),
  };
}

// ─────────────────────────────────────────────────────────
// TOOL 13: searchTickets — NL → JQL search ← NEW
// ─────────────────────────────────────────────────────────
async function toolSearchTickets(params, ctx) {
  const {
    query,
    jql: rawJql,
    projectKey: overrideKey,
    maxResults = 30,
  } = params;
  const { client, projectKey } = await getJiraClient(ctx.userId);
  const key = overrideKey || projectKey;

  // Build JQL from natural language query if no raw JQL provided
  let jql = rawJql;
  if (!jql && query) {
    jql = buildJqlFromQuery(query, key);
  }
  if (!jql) throw new Error("query or jql is required");

  const res = await safeJira(() =>
    jiraSearch(client, {
      jql,
      maxResults,
      fields: "summary,status,priority,assignee,duedate,issuetype",
    })
  );

  const tickets = res.data.issues.map(formatTicket);
  if (!tickets.length) {
    return {
      tickets: [],
      jql,
      summary: `No tickets found for: "${query || jql}"`,
    };
  }

  const lines = [
    `🔍 *Search Results* — "${query || "JQL query"}"`,
    `${tickets.length} ticket${tickets.length !== 1 ? "s" : ""} found\n`,
  ];
  for (const t of tickets) {
    const due = t.dueDate ? ` • Due: ${t.dueDate}` : "";
    const overdue = t.overdue ? ` ⚠️ ${t.daysOverdue}d overdue` : "";
    lines.push(
      `${priorityEmoji(t.priority)} *${t.key}* — ${t.title.slice(0, 55)}`
    );
    lines.push(`   ${t.status} • ${t.assignee}${due}${overdue}`);
  }

  return { tickets, jql, count: tickets.length, summary: lines.join("\n") };
}

/**
 * Converts natural language queries into JQL
 * Handles common patterns like "bugs assigned to X", "overdue tickets", etc.
 */
function buildJqlFromQuery(query, projectKey) {
  const q = query.toLowerCase();
  const parts = [`project = ${projectKey}`];

  // Status filters
  if (q.includes("open") || q.includes("unresolved"))
    parts.push("statusCategory != Done");
  else if (q.includes("closed") || q.includes("done") || q.includes("resolved"))
    parts.push("statusCategory = Done");
  else if (q.includes("in progress")) parts.push('status = "In Progress"');
  else if (q.includes("in review")) parts.push('status = "In Review"');
  else if (q.includes("to do")) parts.push('status = "To Do"');
  else parts.push("statusCategory != Done"); // default: open

  // Issue type filters
  if (q.includes("bug")) parts.push("issuetype = Bug");
  else if (q.includes("story")) parts.push("issuetype = Story");
  else if (q.includes("task")) parts.push("issuetype = Task");
  else if (q.includes("epic")) parts.push("issuetype = Epic");

  // Priority filters
  if (q.includes("critical") || q.includes("highest"))
    parts.push("priority = Highest");
  else if (q.includes("high priority") || q.includes("high-priority"))
    parts.push("priority = High");
  else if (q.includes("low priority")) parts.push("priority = Low");

  // Assignee filters
  const assignedToMatch = q.match(
    /assigned to ([a-z\s]+?)(?:\s+in|\s+with|\s+that|$)/i
  );
  if (assignedToMatch) {
    const name = assignedToMatch[1].trim();
    parts.push(`assignee ~ "${name}"`);
  } else if (q.includes("my tickets") || q.includes("assigned to me")) {
    parts.push("assignee = currentUser()");
  } else if (q.includes("unassigned")) {
    parts.push("assignee is EMPTY");
  }

  // Due date filters
  if (q.includes("overdue"))
    parts.push(`duedate < "${new Date().toISOString().split("T")[0]}"`);
  else if (q.includes("due today"))
    parts.push(`duedate = "${new Date().toISOString().split("T")[0]}"`);
  else if (q.includes("due this week")) parts.push("duedate <= endOfWeek()");

  // Label / keyword search
  const labelMatch = q.match(/label[led]?\s+([a-z0-9_-]+)/i);
  if (labelMatch) parts.push(`labels = "${labelMatch[1]}"`);

  // Text search for remaining keywords
  const stopWords = new Set([
    "show",
    "me",
    "all",
    "the",
    "find",
    "get",
    "list",
    "tickets",
    "issues",
    "open",
    "closed",
    "done",
    "bugs",
    "stories",
    "tasks",
    "in",
    "with",
    "that",
    "are",
    "is",
    "a",
    "an",
  ]);
  const keywords = q
    .split(/\s+/)
    .filter(
      (w) =>
        w.length > 3 &&
        !stopWords.has(w) &&
        !/^(bug|story|task|epic|high|low|open|done|overdue|sprint|assignee|assigned|to|me|my)$/.test(
          w
        )
    );
  if (keywords.length) parts.push(`text ~ "${keywords.slice(0, 2).join(" ")}"`);

  return parts.join(" AND ") + " ORDER BY priority ASC, updated DESC";
}

// ─────────────────────────────────────────────────────────
// TOOL 14: notifyOverdue — Slack + Email for overdue ← NEW
// ─────────────────────────────────────────────────────────
async function toolNotifyOverdue(params, ctx) {
  const {
    assigneeName,
    channels = ["slack", "email"],
    projectKey: overrideKey,
    customMessage = null,
    slackChannel = process.env.DEFAULT_SLACK_CHANNEL || "#engineering",
  } = params;

  const { client, projectKey, domain } = await getJiraClient(ctx.userId);
  const key = overrideKey || projectKey;

  // Fetch overdue tickets
  const today = new Date().toISOString().split("T")[0];
  const filters = [
    `project = ${key}`,
    `statusCategory != Done`,
    `duedate < "${today}"`,
  ];
  if (assigneeName) filters.push(`assignee = "${assigneeName}"`);

  const jql = filters.join(" AND ") + " ORDER BY duedate ASC";
  const res = await safeJira(() =>
    jiraSearch(client, {
      jql,
      maxResults,
      fields: "summary,status,priority,assignee,duedate,issuetype",
    })
  );

  const tickets = res.data.issues.map(formatTicket);
  if (!tickets.length) {
    return {
      notified: 0,
      summary: `✅ No overdue tickets found${
        assigneeName ? ` for ${assigneeName}` : ""
      } — no notifications sent.`,
    };
  }

  // Group by assignee
  const byAssignee = {};
  for (const t of tickets) {
    const name = t.assignee || "Unassigned";
    if (!byAssignee[name]) byAssignee[name] = [];
    byAssignee[name].push(t);
  }

  const targets = assigneeName
    ? Object.entries(byAssignee).filter(([name]) =>
        name.toLowerCase().includes(assigneeName.toLowerCase())
      )
    : Object.entries(byAssignee);

  if (!targets.length) {
    return {
      notified: 0,
      summary: `No overdue tickets found for "${assigneeName}".`,
    };
  }

  const notificationsSent = [];

  for (const [person, personTickets] of targets) {
    // ── Auto-fetch email from Jira user API ──────────────
    let emailAddress = null;
    try {
      const userRes = await client.get("/user/search", {
        params: { query: person, maxResults: 5 },
      });
      const users = userRes.data || [];

      // Best match: exact display name or closest
      const matched =
        users.find(
          (u) => u.displayName?.toLowerCase() === person.toLowerCase()
        ) || users[0];

      emailAddress = matched?.emailAddress || null;

      if (emailAddress) {
        console.log(`📧 Found Jira email for ${person}: ${emailAddress}`);
      } else {
        console.warn(`⚠️ No email found in Jira for "${person}"`);
      }
    } catch (err) {
      console.warn(
        `Could not fetch Jira user email for ${person}:`,
        err.message
      );
    }

    const ticketList = personTickets
      .map(
        (t) =>
          `• ${t.key}: ${t.title.slice(0, 60)} (${
            t.daysOverdue
          }d overdue) — https://${domain}/browse/${t.key}`
      )
      .join("\n");

    const firstName = person.split(" ")[0];

    const emailBody = customMessage
      ? `${customMessage}\n\n${ticketList}`
      : `Hi ${firstName},\n\nYou have ${personTickets.length} overdue ticket${
          personTickets.length > 1 ? "s" : ""
        } in Jira that need attention:\n\n${ticketList}\n\nPlease review and update the due dates or status.\n\nThanks,\nOrionAI 🤖`;

    const slackBody = customMessage
      ? `${customMessage}\n\n${ticketList}`
      : `👋 Hi *${firstName}*, you have *${
          personTickets.length
        } overdue ticket${
          personTickets.length > 1 ? "s" : ""
        }* in Jira:\n\n${ticketList}\n\nPlease update them when you get a chance!`;

    notificationsSent.push({
      person,
      emailAddress, // ← fetched from Jira automatically
      slackChannel,
      ticketCount: personTickets.length,
      tickets: personTickets,
      emailBody,
      slackBody,
      channels,
    });
  }

  const lines = [
    `📢 *Overdue Notification Summary*`,
    `Notifying ${notificationsSent.length} person${
      notificationsSent.length > 1 ? "s" : ""
    } about ${tickets.length} overdue tickets\n`,
  ];
  for (const n of notificationsSent) {
    lines.push(`👤 *${n.person}*`);
    if (n.emailAddress) lines.push(`  📧 Email: ${n.emailAddress}`);
    else lines.push(`  📧 Email: not found in Jira`);
    lines.push(`  🎫 ${n.ticketCount} overdue tickets`);
  }

  return {
    notifications: notificationsSent,
    totalTickets: tickets.length,
    totalPeople: notificationsSent.length,
    channels,
    emailSubject: `⚠️ You have overdue Jira tickets — action needed`,
    summary: lines.join("\n"),
  };
}

async function toolLinkTicket(params, ctx) {
  const { ticketKey, linkedTo, linkType = "relates to" } = params;
  if (!ticketKey || !linkedTo)
    throw new Error("ticketKey and linkedTo are required");

  const { client, domain } = await getJiraClient(ctx.userId);

  // Fetch available link types
  const linkTypesRes = await client.get("/issueLinkType");
  const linkTypes = linkTypesRes.data.issueLinkTypes || [];

  // Find best matching link type
  const matched =
    linkTypes.find(
      (t) =>
        t.name.toLowerCase().includes(linkType.toLowerCase()) ||
        t.inward.toLowerCase().includes(linkType.toLowerCase()) ||
        t.outward.toLowerCase().includes(linkType.toLowerCase())
    ) || linkTypes[0]; // fallback to first available

  await client.post("/issueLink", {
    type: { name: matched.name },
    inwardIssue: { key: ticketKey },
    outwardIssue: { key: linkedTo },
  });

  return {
    success: true,
    ticketKey,
    linkedTo,
    linkType: matched.name,
    summary: `🔗 Linked *${ticketKey}* → *${linkedTo}* (${matched.name})`,
  };
}

module.exports = {
  toolGetBacklog,
  toolGetOverdueTickets,
  toolUpdateDueDates,
  toolCreateTicket,
  toolGetMyTickets,
  toolGetSprintSummary,
  toolMoveTicket, // ← NEW
  toolAssignTicket, // ← NEW
  toolAddComment, // ← NEW
  toolGetShippedLastSprint, // ← NEW
  toolGetMostOverdue, // ← NEW
  toolGetSprintBugs, // ← NEW
  toolSearchTickets, // ← NEW
  toolNotifyOverdue, // ← NEW
  toolLinkTicket,
};
