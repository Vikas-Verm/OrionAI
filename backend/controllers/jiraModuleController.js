/**
 * jiraModuleController.js
 * Complete Jira module — org-wide access, full pagination, all fields, ADF parsing
 */

const axios = require("axios");
const Integration = require("../models/Integration");

// ── Client factory ────────────────────────────────────────────────
async function getJiraConfig(userId) {
  const integ = await Integration.findOne({ userId, type: "jira" });
  if (!integ?.jira?.domain || !integ?.jira?.email || !integ?.jira?.apiToken) {
    throw new Error(
      "Jira not connected. Go to Settings → Integrations → Jira."
    );
  }
  const domain = integ.jira.domain
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "");
  const auth = Buffer.from(
    `${integ.jira.email}:${integ.jira.apiToken}`
  ).toString("base64");
  return {
    base: `https://${domain}/rest/api/3`,
    agile: `https://${domain}/rest/agile/1.0`,
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    domain,
  };
}

// ── Safe search with fallback ──────────────────────────────────────
// ── Jira Cloud search (POST /search/jql — CHANGE-2046 migration) ─────
// CRITICAL: new endpoint does NOT accept startAt — uses nextPageToken cursor.
// Fields must be an array in the body, NOT a comma-separated query param.
async function safeSearch(
  cfg,
  { jql, fields, maxResults, nextPageToken } = {}
) {
  const body = {
    jql,
    maxResults: maxResults ?? 100,
    fields: fields ? fields.split(",").map((f) => f.trim()) : undefined,
  };
  if (nextPageToken) body.nextPageToken = nextPageToken;
  return axios.post(`${cfg.base}/search/jql`, body, { headers: cfg.headers });
}

// Dedicated approximate count — does not fetch issue data.
async function fetchTotal(cfg, jql) {
  try {
    const r = await axios.post(
      `${cfg.base}/search/approximate-count`,
      { jql },
      { headers: cfg.headers }
    );
    return typeof r.data.count === "number" ? r.data.count : null;
  } catch {
    return null;
  }
}

// ── Fetch ALL issues with cursor-based pagination (nextPageToken) ─────
async function fetchAllIssues(cfg, jql, fields, maxTotal = 3000) {
  const pageSize = 100;
  let allIssues = [];
  let nextPageToken = undefined;
  while (true) {
    const r = await safeSearch(cfg, {
      jql,
      fields,
      maxResults: pageSize,
      nextPageToken,
    });
    const issues = r.data.issues || [];
    allIssues.push(...issues);
    nextPageToken = r.data.nextPageToken;
    console.log(`Fetched ${issues.length} issues, nextToken=${nextPageToken}`);
    if (!nextPageToken || issues.length === 0 || allIssues.length >= maxTotal)
      break;
  }
  return { issues: allIssues.slice(0, maxTotal), total: allIssues.length };
}

// ── ADF → readable text ────────────────────────────────────────────
function adfToText(node) {
  if (!node) return "";
  if (typeof node === "string") return node;
  if (node.type === "text") return node.text || "";
  if (node.type === "hardBreak" || node.type === "rule") return "\n";
  if (node.type === "mention") return `@${node.attrs?.displayName || "user"}`;
  if (node.type === "emoji")
    return node.attrs?.shortName || node.attrs?.text || "";
  if (node.type === "date") return node.attrs?.timestamp || "";
  if (node.type === "status") return `[${node.attrs?.text || ""}]`;
  if (node.type === "inlineCard" || node.type === "blockCard")
    return node.attrs?.url || "";
  if (node.type === "mediaGroup" || node.type === "mediaSingle")
    return "[Attachment]\n";

  const children = node.content || [];

  if (node.type === "paragraph") return children.map(adfToText).join("") + "\n";
  if (node.type === "heading")
    return (
      "#".repeat(node.attrs?.level || 1) +
      " " +
      children.map(adfToText).join("") +
      "\n"
    );
  if (node.type === "bulletList")
    return children.map((li) => "• " + adfToText(li).trim()).join("\n") + "\n";
  if (node.type === "orderedList")
    return (
      children.map((li, i) => `${i + 1}. ` + adfToText(li).trim()).join("\n") +
      "\n"
    );
  if (node.type === "listItem") return children.map(adfToText).join("");
  if (node.type === "blockquote")
    return children.map((c) => "> " + adfToText(c)).join("") + "\n";
  if (node.type === "codeBlock")
    return (
      "```" +
      (node.attrs?.language || "") +
      "\n" +
      children.map(adfToText).join("") +
      "\n```\n"
    );
  if (node.type === "table")
    return (
      children
        .map((row) =>
          (row.content || [])
            .map((cell) => (cell.content || []).map(adfToText).join("").trim())
            .join(" | ")
        )
        .join("\n") + "\n"
    );

  return children.map(adfToText).join("");
}

function descToText(desc) {
  if (!desc) return "";
  if (typeof desc === "string") return desc;
  return adfToText(desc).trim();
}

// ── Extract sprint from custom fields ────────────────────────────
function extractSprint(fields) {
  for (const [k, v] of Object.entries(fields || {})) {
    if (!k.startsWith("customfield_") || !v) continue;
    const arr = Array.isArray(v) ? v : [v];
    const sp = arr.find(
      (x) => x && typeof x === "object" && x.name && x.state !== undefined
    );
    if (sp) return { name: sp.name, id: sp.id, state: sp.state };
  }
  return null;
}

// ── Map issue to clean ticket ─────────────────────────────────────
function mapTicket(issue) {
  const f = issue.fields || {};
  const dueDate = f.duedate || null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const due = dueDate ? new Date(dueDate) : null;
  const isDone = /done|closed|resolved|complete|production/i.test(
    f.status?.name || ""
  );
  const overdue = !!(due && due < now && !isDone);
  const sprint = extractSprint(f);
  let startDate = f.customfield_10014 || f.customfield_10015 || null;
  let storyPts = f.customfield_10016 ?? f.customfield_10028 ?? null;

  return {
    key: issue.key,
    id: issue.id,
    title: f.summary || "",
    status: f.status?.name || "To Do",
    statusCategory: f.status?.statusCategory?.name || "",
    priority: f.priority?.name || "Medium",
    assignee: f.assignee?.displayName || null,
    assigneeId: f.assignee?.accountId || null,
    assigneeEmail: f.assignee?.emailAddress || null,
    reporter: f.reporter?.displayName || null,
    reporterEmail: f.reporter?.emailAddress || null,
    dueDate,
    startDate,
    overdue,
    daysOverdue: overdue ? Math.floor((now - due) / 86400000) : 0,
    type: f.issuetype?.name || "Task",
    sprint: sprint?.name || null,
    sprintId: sprint?.id || null,
    labels: f.labels || [],
    components: (f.components || []).map((c) => c.name),
    fixVersions: (f.fixVersions || []).map((v) => v.name),
    storyPoints: storyPts,
    created: f.created || null,
    updated: f.updated || null,
    description: descToText(f.description),
    project: { key: issue.key.split("-")[0], name: f.project?.name || "" },
  };
}

const LIST_FIELDS =
  "summary,status,priority,assignee,reporter,duedate,issuetype,labels,components,created,updated,customfield_10020,customfield_10016,customfield_10014,customfield_10028,project";
const DETAIL_FIELDS =
  LIST_FIELDS +
  ",description,comment,subtasks,issuelinks,parent,fixVersions,customfield_10015,customfield_10032";

// ── GET /api/jira/projects ────────────────────────────────────────
exports.getProjects = async (req, res) => {
  try {
    const cfg = await getJiraConfig(req.user?.username);
    const all = [];
    let startAt = 0;
    while (true) {
      const r = await axios.get(`${cfg.base}/project/search`, {
        headers: cfg.headers,
        params: { maxResults: 50, startAt },
      });
      all.push(
        ...(r.data.values || []).map((p) => ({
          key: p.key,
          name: p.name,
          type: p.projectTypeKey,
          avatarUrl: p.avatarUrls?.["24x24"] || null,
        }))
      );
      if ((r.data.values || []).length < 50 || all.length >= r.data.total)
        break;
      startAt += 50;
    }
    res.json({ projects: all });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── GET /api/jira/board ───────────────────────────────────────────
exports.getBoard = async (req, res) => {
  try {
    const cfg = await getJiraConfig(req.user?.username);
    const project = req.query.project || "";
    const startAt = parseInt(req.query.startAt) || 0;
    const maxResults = Math.min(parseInt(req.query.maxResults) || 100, 200);

    let jql = "";

    // FIX: removed statusCategory != Done (show all statuses incl. Done)
    // Jira requires a bound clause — always restrict by project or recency
    if (project) {
      jql = `project in (${project}) ORDER BY updated DESC`;
    } else {
      jql = 'created >= "2000-01-01" ORDER BY created DESC';
    }

    // Cursor-based pagination: first page has no token; subsequent pages pass
    // nextPageToken returned from previous response via req.query.nextPageToken.
    const pageToken = req.query.nextPageToken || undefined;

    const [r, approxTotal] = await Promise.all([
      safeSearch(cfg, {
        jql,
        fields: LIST_FIELDS,
        maxResults,
        nextPageToken: pageToken,
      }),
      pageToken ? Promise.resolve(null) : fetchTotal(cfg, jql), // count only on first load
    ]);

    const returnedNextToken = r.data.nextPageToken || null;
    const total = Number(approxTotal) || 0;
    console.log(
      "JIRA TOTAL:",
      total,
      "| page issues:",
      (r.data.issues || []).length,
      "| nextToken:",
      returnedNextToken
    );
    const tickets = (r.data.issues || []).map(mapTicket);

    let activeSprint = null,
      projectName = project || "All Projects";
    try {
      const firstKey =
        project.split(",")[0].trim() || tickets[0]?.key?.split("-")[0];
      if (firstKey) {
        const pr = await axios
          .get(`${cfg.base}/project/${firstKey}`, { headers: cfg.headers })
          .catch(() => null);
        if (pr) projectName = pr.data?.name || firstKey;
      }
    } catch {}

    try {
      const br = await axios.get(`${cfg.agile}/board`, {
        headers: cfg.headers,
        params: { maxResults: 5, type: "scrum" },
      });
      const brd = br.data?.values?.[0];
      if (brd) {
        const sr = await axios.get(`${cfg.agile}/board/${brd.id}/sprint`, {
          headers: cfg.headers,
          params: { state: "active", maxResults: 1 },
        });
        const sp = sr.data?.values?.[0];
        if (sp)
          activeSprint = {
            id: sp.id,
            name: sp.name,
            state: sp.state,
            startDate: sp.startDate || null,
            endDate: sp.endDate || null,
            daysLeft: sp.endDate
              ? Math.max(
                  0,
                  Math.ceil((new Date(sp.endDate) - new Date()) / 86400000)
                )
              : null,
          };
      }
    } catch {}

    res.json({
      tickets,
      total,
      nextPageToken: returnedNextToken,
      hasMore: !!returnedNextToken,
      count: tickets.length,
      projectKey: project || tickets[0]?.key?.split("-")[0] || "ALL",
      projectName,
      activeSprint,
    });
  } catch (err) {
    console.error("board:", err.response?.data || err.message);
    res.status(500).json({ error: err.message });
  }
};

// ── GET /api/jira/sprints ─────────────────────────────────────────
exports.getSprints = async (req, res) => {
  try {
    const cfg = await getJiraConfig(req.user?.username);
    const br = await axios.get(`${cfg.agile}/board`, {
      headers: cfg.headers,
      params: { maxResults: 10, type: "scrum" },
    });
    const boards = br.data?.values || [];
    const all = [];
    for (const board of boards.slice(0, 4)) {
      try {
        const sr = await axios.get(`${cfg.agile}/board/${board.id}/sprint`, {
          headers: cfg.headers,
          params: { state: "active,closed", maxResults: 6 },
        });
        for (const sp of sr.data?.values || []) {
          let tickets = [];
          try {
            const { issues } = await fetchAllIssues(
              cfg,
              `sprint = ${sp.id} ORDER BY updated DESC`,
              LIST_FIELDS,
              500
            );
            tickets = issues.map(mapTicket);
          } catch {}
          all.push({
            id: sp.id,
            name: sp.name,
            state: sp.state,
            startDate: sp.startDate || null,
            endDate: sp.endDate || null,
            daysLeft:
              sp.endDate && sp.state === "active"
                ? Math.max(
                    0,
                    Math.ceil((new Date(sp.endDate) - new Date()) / 86400000)
                  )
                : null,
            boardName: board.name,
            tickets,
          });
        }
      } catch {}
    }
    all.sort((a, b) => {
      if (a.state === "active" && b.state !== "active") return -1;
      if (b.state === "active" && a.state !== "active") return 1;
      return (b.endDate || "") > (a.endDate || "") ? 1 : -1;
    });
    res.json({ sprints: all.slice(0, 14) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── GET /api/jira/ticket/:key ─────────────────────────────────────
exports.getTicket = async (req, res) => {
  try {
    const cfg = await getJiraConfig(req.user?.username);
    const r = await axios.get(`${cfg.base}/issue/${req.params.key}`, {
      headers: cfg.headers,
      params: { fields: DETAIL_FIELDS },
    });
    const f = r.data.fields || {};
    const t = mapTicket(r.data);

    t.descriptionRich = descToText(f.description);
    t.comments = (f.comment?.comments || []).map((c) => ({
      id: c.id,
      author: c.author?.displayName || "Unknown",
      email: c.author?.emailAddress || "",
      created: c.created,
      updated: c.updated,
      body: descToText(c.body),
    }));
    t.subtasks = (f.subtasks || []).map((s) => ({
      key: s.key,
      title: s.fields?.summary || "",
      status: s.fields?.status?.name || "",
      type: s.fields?.issuetype?.name || "Subtask",
    }));
    t.linkedIssues = (f.issuelinks || []).map((l) => ({
      id: l.id,
      type: l.type?.outward || l.type?.inward || l.type?.name || "links to",
      direction: l.outwardIssue ? "outward" : "inward",
      key: l.outwardIssue?.key || l.inwardIssue?.key || "",
      title:
        l.outwardIssue?.fields?.summary || l.inwardIssue?.fields?.summary || "",
      status:
        l.outwardIssue?.fields?.status?.name ||
        l.inwardIssue?.fields?.status?.name ||
        "",
    }));
    if (f.parent)
      t.parent = {
        key: f.parent.key,
        title: f.parent.fields?.summary || "",
        type: f.parent.fields?.issuetype?.name || "Epic",
      };

    try {
      const tx = await axios.get(
        `${cfg.base}/issue/${req.params.key}/transitions`,
        { headers: cfg.headers }
      );
      t.transitions = (tx.data.transitions || []).map((tx) => ({
        id: tx.id,
        name: tx.name,
        to: tx.to?.name || tx.name,
      }));
    } catch {
      t.transitions = [];
    }

    res.json(t);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── PATCH /api/jira/ticket/:key ───────────────────────────────────
exports.updateTicket = async (req, res) => {
  try {
    const cfg = await getJiraConfig(req.user?.username);
    const key = req.params.key;
    const body = req.body;

    if (body.status) {
      const tx = await axios.get(`${cfg.base}/issue/${key}/transitions`, {
        headers: cfg.headers,
      });
      const match = (tx.data.transitions || []).find(
        (t) =>
          t.to?.name?.toLowerCase() === body.status.toLowerCase() ||
          t.name.toLowerCase() === body.status.toLowerCase() ||
          t.to?.name?.toLowerCase().includes(body.status.toLowerCase())
      );
      if (match)
        await axios.post(
          `${cfg.base}/issue/${key}/transitions`,
          { transition: { id: match.id } },
          { headers: cfg.headers }
        );
    }

    const uf = {};
    if (body.title) uf.summary = body.title;
    if (body.priority) uf.priority = { name: body.priority };
    if (body.dueDate !== undefined) uf.duedate = body.dueDate || null;
    if (body.labels !== undefined) uf.labels = body.labels || [];
    if (body.components !== undefined)
      uf.components = (body.components || []).map((n) => ({ name: n }));
    if (body.description !== undefined)
      uf.description = body.description
        ? {
            type: "doc",
            version: 1,
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: body.description }],
              },
            ],
          }
        : null;
    if (body.storyPoints !== undefined) {
      uf.customfield_10016 = body.storyPoints || null;
      uf.customfield_10028 = body.storyPoints || null;
    }
    if (body.startDate !== undefined) {
      uf.customfield_10014 = body.startDate || null;
      uf.customfield_10015 = body.startDate || null;
    }
    if (body.assigneeEmail) {
      try {
        const u = (
          await axios.get(`${cfg.base}/user/search`, {
            headers: cfg.headers,
            params: { query: body.assigneeEmail, maxResults: 1 },
          })
        ).data?.[0];
        if (u) uf.assignee = { accountId: u.accountId };
      } catch {}
    } else if (body.assigneeId !== undefined) {
      uf.assignee = body.assigneeId ? { accountId: body.assigneeId } : null;
    }

    if (Object.keys(uf).length)
      await axios.put(
        `${cfg.base}/issue/${key}`,
        { fields: uf },
        { headers: cfg.headers }
      );

    const tr = await axios.get(`${cfg.base}/issue/${key}`, {
      headers: cfg.headers,
      params: { fields: LIST_FIELDS },
    });
    res.json({ ok: true, key, ticket: mapTicket(tr.data) });
  } catch (err) {
    console.error("update:", err.response?.data || err.message);
    res.status(500).json({ error: err.message });
  }
};

// ── POST /api/jira/ticket ─────────────────────────────────────────
exports.createTicket = async (req, res) => {
  try {
    const cfg = await getJiraConfig(req.user?.username);
    const {
      title,
      description,
      type,
      priority,
      status,
      dueDate,
      startDate,
      assigneeEmail,
      labels,
      components,
      projectKey: rpk,
      storyPoints,
      parentKey,
    } = req.body;
    if (!title?.trim())
      return res.status(400).json({ error: "Title is required" });

    let pk = rpk;
    if (!pk) {
      const pr = await axios.get(`${cfg.base}/project/search`, {
        headers: cfg.headers,
        params: { maxResults: 1 },
      });
      pk = pr.data.values?.[0]?.key;
    }
    if (!pk) throw new Error("No Jira project found");

    const fields = {
      project: { key: pk },
      summary: title.trim(),
      issuetype: { name: type || "Task" },
      priority: { name: priority || "Medium" },
    };
    if (description?.trim())
      fields.description = {
        type: "doc",
        version: 1,
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: description.trim() }],
          },
        ],
      };
    if (labels?.length) fields.labels = labels;
    if (components?.length)
      fields.components = components.map((n) => ({ name: n }));
    if (dueDate) fields.duedate = dueDate;
    if (startDate) fields.customfield_10014 = startDate;
    if (storyPoints) fields.customfield_10016 = Number(storyPoints);
    if (parentKey) fields.parent = { key: parentKey };

    if (assigneeEmail || req.body.assigneeId) {
      try {
        if (req.body.assigneeId) {
          // Direct accountId supplied from name search
          fields.assignee = { accountId: req.body.assigneeId };
        } else {
          const u = (
            await axios.get(`${cfg.base}/user/search`, {
              headers: cfg.headers,
              params: { query: assigneeEmail, maxResults: 1 },
            })
          ).data?.[0];
          if (u) fields.assignee = { accountId: u.accountId };
        }
      } catch {}
    }

    const r = await axios.post(
      `${cfg.base}/issue`,
      { fields },
      { headers: cfg.headers }
    );
    const nk = r.data.key;

    if (status && !/to.?do/i.test(status)) {
      try {
        const tx = await axios.get(`${cfg.base}/issue/${nk}/transitions`, {
          headers: cfg.headers,
        });
        const m = (tx.data.transitions || []).find(
          (t) =>
            t.to?.name?.toLowerCase() === status.toLowerCase() ||
            t.name.toLowerCase() === status.toLowerCase()
        );
        if (m)
          await axios.post(
            `${cfg.base}/issue/${nk}/transitions`,
            { transition: { id: m.id } },
            { headers: cfg.headers }
          );
      } catch {}
    }

    const tr = await axios.get(`${cfg.base}/issue/${nk}`, {
      headers: cfg.headers,
      params: { fields: LIST_FIELDS },
    });
    res.json({
      key: nk,
      id: r.data.id,
      success: true,
      ticket: mapTicket(tr.data),
    });
  } catch (err) {
    console.error("create:", err.response?.data || err.message);
    res.status(500).json({ error: err.message });
  }
};

// ── POST /api/jira/ticket/:key/comment ───────────────────────────
exports.addComment = async (req, res) => {
  try {
    const cfg = await getJiraConfig(req.user?.username);
    if (!req.body.body?.trim())
      return res.status(400).json({ error: "Body required" });
    const r = await axios.post(
      `${cfg.base}/issue/${req.params.key}/comment`,
      {
        body: {
          type: "doc",
          version: 1,
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: req.body.body.trim() }],
            },
          ],
        },
      },
      { headers: cfg.headers }
    );
    res.json({
      id: r.data.id,
      author: r.data.author?.displayName || "Me",
      created: r.data.created,
      body: req.body.body.trim(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── DELETE /api/jira/ticket/:key ──────────────────────────────────
exports.deleteTicket = async (req, res) => {
  try {
    const cfg = await getJiraConfig(req.user?.username);
    await axios.delete(`${cfg.base}/issue/${req.params.key}`, {
      headers: cfg.headers,
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── GET /api/jira/users ───────────────────────────────────────────
exports.searchUsers = async (req, res) => {
  try {
    const cfg = await getJiraConfig(req.user?.username);
    const r = await axios.get(`${cfg.base}/user/search`, {
      headers: cfg.headers,
      params: { query: req.query.q || ".", maxResults: 20 },
    });
    res.json({
      users: (r.data || []).map((u) => ({
        accountId: u.accountId,
        displayName: u.displayName,
        email: u.emailAddress || null,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── GET /api/jira/components ──────────────────────────────────────
exports.getComponents = async (req, res) => {
  try {
    const cfg = await getJiraConfig(req.user?.username);
    if (!req.query.project) return res.json({ components: [] });
    const r = await axios.get(
      `${cfg.base}/project/${req.query.project}/components`,
      { headers: cfg.headers }
    );
    res.json({
      components: (r.data || []).map((c) => ({ id: c.id, name: c.name })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── GET /api/jira/search ──────────────────────────────────────────
exports.searchTickets = async (req, res) => {
  try {
    const cfg = await getJiraConfig(req.user?.username);
    const r = await safeSearch(cfg, {
      jql: req.query.jql || "order by updated DESC",
      fields: LIST_FIELDS,
      maxResults: Math.min(parseInt(req.query.max) || 50, 200),
    });
    res.json({
      tickets: (r.data.issues || []).map(mapTicket),
      total: r.data.total,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
