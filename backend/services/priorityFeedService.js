"use strict";

const Integration = require("../models/Integration");
const PriorityFeedAction = require("../models/PriorityFeedAction");
const { isConnectedIntegration } = require("./integrationConnectionState");
const { getGmailClient } = require("./workspaceSignalsService");
const {
  GMAIL_PRIORITY_24H_QUERY,
  GMAIL_PRIORITY_HEADERS,
  classifyPriorityThread,
} = require("./gmailPriorityRules");
const {
  ACTION_STATES,
  getCommunicationPriorityItems,
} = require("./communicationActionService");
const { calendarGetToday } = require("./tools/toolCalendar");
const {
  toolGetMyTickets,
  toolGetOverdueTickets,
} = require("./tools/toolJira");
const { checkSlack, checkTelegram } = require("./inboxSignalsService");

const APP_META = {
  gmail: { label: "Gmail", icon: "📧", module: "gmail" },
  slack: { label: "Slack", icon: "💬", module: "slack" },
  telegram: { label: "Telegram", icon: "✈️", module: "telegram" },
  jira: { label: "Jira", icon: "🔷", module: "jira" },
  google_calendar: { label: "Calendar", icon: "📅", module: "google_calendar" },
  database: { label: "Database", icon: "🗄️", module: "database" },
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function toPriorityLevel(score) {
  if (score >= 72) return "High";
  if (score >= 42) return "Medium";
  return "Low";
}

function formatDateLabel(date = new Date()) {
  return date.toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function getTimeOfDay(now = new Date()) {
  const hours = now.getHours();
  if (hours < 12) return "morning";
  if (hours < 17) return "afternoon";
  return "evening";
}

function buildGreeting(timeOfDay) {
  if (timeOfDay === "morning") return "OrionAI has ranked the work that is personally yours to move.";
  if (timeOfDay === "afternoon") return "Here is the live operating picture around your own work.";
  return "Only the work still likely to need you is surfaced here.";
}

function getHeader(headers = [], name) {
  return (
    headers.find((header) => header.name?.toLowerCase() === name.toLowerCase())
      ?.value || ""
  );
}

function extractEmailAddress(value = "") {
  const bracketMatch = value.match(/<([^>]+)>/);
  const raw = bracketMatch?.[1] || value;
  const emailMatch = raw.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return (emailMatch?.[0] || "").trim().toLowerCase();
}

function extractSenderName(value = "") {
  const bracketMatch = value.match(/^(.+?)\s*</);
  return (bracketMatch?.[1] || value.split("@")[0] || value).replace(/"/g, "").trim();
}

function isAutomatedSender(fromValue, headers = []) {
  const haystack = [
    fromValue,
    getHeader(headers, "Reply-To"),
    getHeader(headers, "Auto-Submitted"),
    getHeader(headers, "Precedence"),
    getHeader(headers, "X-Auto-Response-Suppress"),
    getHeader(headers, "List-Unsubscribe"),
  ]
    .join(" ")
    .toLowerCase();

  if (
    /no-?reply|do-?not-?reply|donotreply|mailer-daemon|auto-?reply|bounce|newsletter|digest/.test(
      haystack
    )
  ) {
    return true;
  }

  const autoSubmitted = getHeader(headers, "Auto-Submitted").toLowerCase();
  return autoSubmitted && autoSubmitted !== "no";
}

function formatAgeHours(hours) {
  if (hours < 1) return "less than an hour";
  if (hours < 2) return "1 hour";
  return `${Math.round(hours)} hours`;
}

function hoursAgo(value) {
  const diffMs = Date.now() - value;
  return Math.max(0, diffMs / 3600000);
}

function minutesUntil(value) {
  return Math.round((value - Date.now()) / 60000);
}

function formatMinutesWindow(minutes) {
  if (minutes <= 1) return "now";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (!remainder) return `${hours}h`;
  return `${hours}h ${remainder}m`;
}

function todayIso() {
  return new Date().toISOString().split("T")[0];
}

function normalizeText(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function isLikelyImportantSender(from = "", selfEmail = "") {
  const senderEmail = extractEmailAddress(from);
  const senderName = extractSenderName(from).toLowerCase();
  const selfDomain = selfEmail.split("@")[1] || "";
  const senderDomain = senderEmail.split("@")[1] || "";

  if (selfDomain && senderDomain && senderDomain === selfDomain) return true;
  if (/(founder|ceo|cto|finance|billing|manager|director|lead|client|partner)/.test(senderName)) {
    return true;
  }
  return false;
}

function buildSourceBadge(sourceApp) {
  const meta = APP_META[sourceApp] || { label: sourceApp, icon: "•", module: sourceApp };
  return {
    sourceApp,
    sourceLabel: meta.label,
    sourceIcon: meta.icon,
    module: meta.module,
  };
}

function dedupeById(items = []) {
  const seen = new Set();
  return items.filter((item) => {
    if (!item?.id || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function sortByPriority(items = []) {
  return [...items].sort((a, b) => {
    if ((b.priorityScore || 0) !== (a.priorityScore || 0)) {
      return (b.priorityScore || 0) - (a.priorityScore || 0);
    }
    return String(a.title || "").localeCompare(String(b.title || ""));
  });
}

function countItemsForFilter(items = [], filterId = "all") {
  if (filterId === "all") return items.length;
  if (filterId === "urgent") {
    return items.filter((item) => item.priority === "High").length;
  }
  if (filterId === "communication") {
    return items.filter((item) => item.category === "communication").length;
  }
  if (
    [
      ACTION_STATES.WAITING_ON_YOUR_REPLY,
      ACTION_STATES.NEEDS_APPROVAL,
      ACTION_STATES.NEEDS_FOLLOW_UP,
      ACTION_STATES.WAITING_ON_OTHERS,
    ].includes(filterId)
  ) {
    return items.filter((item) => item.actionState === filterId).length;
  }
  return items.filter((item) => item.category === filterId).length;
}

function buildPriorityFeedFilters(items = []) {
  const definitions = [
    { id: "all", label: "All" },
    { id: "urgent", label: "Urgent" },
    { id: "communication", label: "Comms" },
    { id: ACTION_STATES.WAITING_ON_YOUR_REPLY, label: "Replies" },
    { id: ACTION_STATES.NEEDS_APPROVAL, label: "Approvals" },
    { id: ACTION_STATES.NEEDS_FOLLOW_UP, label: "Follow-ups" },
    { id: "meetings", label: "Meetings" },
    { id: "tasks", label: "Tasks" },
  ];

  return definitions.map((definition) => ({
    ...definition,
    count: countItemsForFilter(items, definition.id),
  }));
}

function isItemReactivatedSinceAction(item, latestAction) {
  const latestRelevant =
    item?.meta?.latestMessageAt ||
    item?.meta?.latestInboundAt ||
    item?.meta?.lastMessageAt ||
    null;
  if (!latestRelevant || !latestAction?.createdAt) return false;
  return new Date(latestRelevant).getTime() > new Date(latestAction.createdAt).getTime();
}

function createPromptAction({ label, prompt, mode = "agent" }) {
  return {
    label,
    kind: "prompt",
    prompt,
    mode,
  };
}

function createModuleAction(label, module, context = null) {
  return {
    label,
    kind: "module",
    module,
    context: context || undefined,
  };
}

function buildAppShortcutAction(type) {
  if (type === "gmail") {
    return createModuleAction("Open Gmail", "gmail", {
      activeFolder: "inbox",
      focus: "needs-reply",
    });
  }

  if (type === "jira") {
    return createModuleAction("Open Jira", "jira", {
      activeTab: "list",
      focus: "priority",
    });
  }

  if (type === "google_calendar") {
    return createModuleAction("Open Calendar", "google_calendar", {
      focus: "today",
    });
  }

  if (type === "database") {
    return createModuleAction("Open Database", "database");
  }

  if (type === "slack") {
    return createModuleAction("Open Slack", "slack", {
      focus: "unread",
    });
  }

  if (type === "telegram") {
    return createModuleAction("Open Telegram", "telegram", {
      focus: "unread",
    });
  }

  return createModuleAction(`Open ${APP_META[type]?.label || type}`, APP_META[type]?.module || type);
}

function isHighPriority(priority = "") {
  return /highest|high|critical/i.test(String(priority || ""));
}

function isBlockedTicket(ticket = {}) {
  const haystack = [
    ticket.status,
    ...(ticket.labels || []),
    ticket.title,
  ]
    .join(" ")
    .toLowerCase();
  return /blocked|waiting|dependency|stuck/.test(haystack);
}

function toModuleSearchableSubject(subject = "") {
  return String(subject || "").replace(/"/g, "").slice(0, 80);
}

async function buildGmailPriorityItems(userId) {
  const client = await getGmailClient(userId);
  if (!client) return [];

  const { gmail, integration } = client;
  const selfEmail = (integration?.gmail?.userEmail || "").toLowerCase();
  const threadList = await gmail.users.threads.list({
    userId: "me",
    q: GMAIL_PRIORITY_24H_QUERY,
    maxResults: 18,
  });

  const threads = threadList.data.threads || [];
  if (!threads.length) return [];

  const details = await Promise.all(
    threads.map((thread) =>
      gmail.users.threads
        .get({
          userId: "me",
          id: thread.id,
          format: "metadata",
          metadataHeaders: GMAIL_PRIORITY_HEADERS,
        })
        .then((result) => result.data)
        .catch(() => null)
    )
  );

  return sortByPriority(
    details
      .map((thread) => mapGmailThreadToPriorityItem(thread, selfEmail))
      .filter(Boolean)
      .slice(0, 5)
  );
}

function mapGmailThreadToPriorityItem(thread, selfEmail) {
  const classified = classifyPriorityThread(thread, selfEmail);
  if (!classified) return null;

  const priority = toPriorityLevel(classified.priorityScore);

  return {
    id: `gmail:${classified.id}`,
    title: classified.subject,
    category: "replies",
    priority,
    priorityScore: classified.priorityScore,
    reason: classified.reasonBits.join(" · "),
    whyThisMatters: classified.whyThisMatters,
    suggestedNextAction: "Open the thread and send the reply while the ask is still fresh.",
    action: createPromptAction({
      label: "Draft reply",
      prompt: `Draft a concise reply for the Gmail thread "${classified.subject}" from ${classified.from}. Explain the direct ask and propose the best response.`,
    }),
    secondaryAction: createModuleAction("Review now", "gmail", {
      activeFolder: "inbox",
      searchQuery: `"${toModuleSearchableSubject(classified.subject)}"`,
      focus: "needs-reply",
    }),
    canClearQuickly:
      classified.unread &&
      classified.includeScore >= 12 &&
      (thread.messages || []).length <= 3,
    needsAttentionSoon: true,
    meta: {
      from: classified.from,
      snippet: thread.snippet || "",
      unread: classified.unread,
      ageHours: classified.ageHours,
      latestMessageAt: classified.lastMs
        ? new Date(classified.lastMs).toISOString()
        : null,
      highConfidence: classified.highConfidence,
    },
    ...buildSourceBadge("gmail"),
  };
}

async function buildCalendarPriorityItems(userId) {
  const result = await calendarGetToday(
    { upcomingOnly: true, windowHours: 12 },
    { userId }
  );
  const events = result?.events || [];
  const items = events
    .map((event) => mapCalendarEventToPriorityItem(event))
    .filter(Boolean);

  return sortByPriority(items).slice(0, 4);
}

function mapCalendarEventToPriorityItem(event) {
  if (!event?.start || !String(event.start).includes("T")) return null;
  const startMs = new Date(event.start).getTime();
  if (!startMs || Number.isNaN(startMs)) return null;

  const minsUntil = minutesUntil(startMs);
  if (minsUntil < 0) return null;

  const attendeeCount = Array.isArray(event.attendees) ? event.attendees.length : 0;
  const missingContext = !event.description;
  const missingJoinInfo = !event.location && !event.meet;
  const needsRsvp = event.responseStatus === "needsAction";

  let score = 22;
  if (minsUntil <= 20) score += 34;
  else if (minsUntil <= 60) score += 26;
  else if (minsUntil <= 180) score += 18;
  else if (minsUntil <= 480) score += 10;
  if (attendeeCount >= 8) score += 14;
  else if (attendeeCount >= 4) score += 10;
  if (missingContext) score += 10;
  if (missingJoinInfo) score += 6;
  if (needsRsvp) score += 8;
  score = clamp(score, 0, 99);

  const priority = toPriorityLevel(score);
  const reasons = [`starts in ${formatMinutesWindow(minsUntil)}`];
  if (attendeeCount >= 4) reasons.push(`${attendeeCount} attendees`);
  if (missingContext) reasons.push("no prep context");
  if (needsRsvp) reasons.push("RSVP pending");

  const whyParts = [`This meeting starts in ${formatMinutesWindow(minsUntil)}`];
  if (attendeeCount >= 4) whyParts.push(`has ${attendeeCount} attendees`);
  if (missingContext) whyParts.push("has no prep context in the invite");

  return {
    id: `calendar:${event.id}`,
    title: event.title,
    category: "meetings",
    priority,
    priorityScore: score,
    reason: reasons.join(" · "),
    whyThisMatters: `${whyParts.join(", ")}.`,
    suggestedNextAction: needsRsvp
      ? "Confirm attendance, gather the context, and walk in prepared."
      : "Pull together the agenda, attendees, and talking points before the meeting starts.",
    action: createPromptAction({
      label: "Prep meeting",
      prompt: `Prep me for the meeting "${event.title}" starting in ${formatMinutesWindow(minsUntil)}. Summarize what I should know, what I should bring, and what questions I should ask.`,
    }),
    secondaryAction: createModuleAction("Open Calendar", "google_calendar", {
      focus: "today",
    }),
    canClearQuickly: needsRsvp || (minsUntil > 180 && attendeeCount <= 3),
    needsAttentionSoon: minsUntil <= 180,
    meta: {
      startsAt: event.start,
      time: event.time,
      date: event.date,
      attendeeCount,
    },
    ...buildSourceBadge("google_calendar"),
  };
}

async function buildJiraWorkspaceSignals(userId) {
  const [myTicketsResult, overdueResult] = await Promise.allSettled([
    toolGetMyTickets({ maxResults: 100 }, { userId }),
    toolGetOverdueTickets({}, { userId }),
  ]);

  const myTickets =
    myTicketsResult.status === "fulfilled" && myTicketsResult.value?.success !== false
      ? myTicketsResult.value?.tickets || []
      : [];
  const myTotalCount =
    myTicketsResult.status === "fulfilled" && myTicketsResult.value?.success !== false
      ? Number(myTicketsResult.value?.count || myTickets.length)
      : myTickets.length;
  const overdueInfo =
    overdueResult.status === "fulfilled" ? overdueResult.value || null : null;

  const ticketMap = new Map();

  function upsertTickets(tickets = [], flags = {}) {
    for (const ticket of tickets) {
      if (!ticket?.key) continue;
      const existing = ticketMap.get(ticket.key) || { ...ticket, flags: {} };
      existing.flags = { ...existing.flags, ...flags };
      ticketMap.set(ticket.key, existing);
    }
  }

  upsertTickets(myTickets, { assignedToMe: true });
  upsertTickets(overdueInfo?.myTickets || [], { assignedToMe: true, overdue: true });
  upsertTickets(
    myTickets.filter((ticket) => isHighPriority(ticket.priority)),
    { assignedToMe: true, highPriority: true }
  );
  upsertTickets(
    myTickets.filter((ticket) => isBlockedTicket(ticket)),
    { assignedToMe: true, blocked: true }
  );

  const personalItems = sortByPriority(
    [...ticketMap.values()]
      .map((ticket) => mapJiraTicketToPriorityItem(ticket))
      .filter(Boolean)
  ).slice(0, 6);

  const overdueTickets = overdueInfo?.tickets || [];
  const blockedOverdueCount = overdueTickets.filter((ticket) => isBlockedTicket(ticket)).length;
  const highPriorityOverdueCount = overdueTickets.filter((ticket) =>
    isHighPriority(ticket.priority)
  ).length;

  return {
    personalItems,
    insight: overdueInfo
      ? {
          myTotalCount,
          myOverdueCount: overdueInfo.myCount || 0,
          orgOverdueCount: overdueInfo.count || 0,
          blockedOverdueCount,
          highPriorityOverdueCount,
          definition: "Using the existing Jira due-date overdue logic in your current integration.",
        }
      : null,
  };
}

function mapJiraTicketToPriorityItem(ticket) {
  if (!ticket?.key) return null;

  const overdue = Boolean(ticket.overdue || ticket.flags?.overdue);
  const blocked = Boolean(ticket.flags?.blocked);
  const highPriority = Boolean(ticket.flags?.highPriority || isHighPriority(ticket.priority));
  const assignedToMe = Boolean(ticket.flags?.assignedToMe);

  if (!assignedToMe) {
    return null;
  }

  let score = 22;
  if (overdue) score += Math.min(30, 16 + (ticket.daysOverdue || 0) * 3);
  if (blocked) score += 18;
  if (highPriority) score += 16;
  score = clamp(score, 0, 99);

  const priority = toPriorityLevel(score);
  const reasons = [];
  reasons.push("assigned to you");
  if (overdue) reasons.push(`${ticket.daysOverdue || 1}d overdue`);
  if (blocked) reasons.push("blocked");
  if (highPriority) reasons.push(ticket.priority || "high priority");

  let whyThisMatters = "This Jira item is personally relevant to your work.";
  let suggestedNextAction = "Open the ticket and decide the next move.";
  let action = createModuleAction("Review now", "jira", {
    scope: "mine",
    activeTab: "list",
    searchQuery: ticket.key,
    focus: "my-ticket",
  });

  if (assignedToMe && overdue) {
    whyThisMatters = `This ticket is assigned to you and overdue by ${ticket.daysOverdue || 1} day${ticket.daysOverdue === 1 ? "" : "s"}.`;
    suggestedNextAction = "Open the ticket, confirm the blocker, and reset the next step.";
  } else if (assignedToMe && blocked) {
    whyThisMatters = "This ticket is assigned to you and appears blocked, so it likely needs escalation or a clear unblocker.";
    suggestedNextAction = "Notify the right owner, capture the blocker, and unblock the next move.";
    action = createPromptAction({
      label: "Notify team",
      prompt: `Draft a concise blocker update for Jira ticket ${ticket.key} (${ticket.title}). Explain what is blocked, who should help next, and the immediate unblock step.`,
    });
  } else if (assignedToMe && highPriority) {
    whyThisMatters = "This high-priority ticket is assigned to you and still unresolved.";
    suggestedNextAction = "Review the status, confirm urgency, and decide the next concrete step.";
  }

  return {
    id: `jira:${ticket.key}`,
    title: `${ticket.key} · ${ticket.title}`,
    category: "tasks",
    priority,
    priorityScore: score,
    reason: reasons.join(" · ") || (ticket.status || "needs review"),
    whyThisMatters,
    suggestedNextAction,
    action,
    secondaryAction: createPromptAction({
      label: "Create task",
      prompt: `Turn Jira ticket ${ticket.key} (${ticket.title}) into a concrete next-step checklist with owners, due dates, and the fastest path to unblock it.`,
    }),
    canClearQuickly: !overdue && !blocked && !highPriority,
    needsAttentionSoon: overdue || blocked || highPriority,
    meta: {
      ticketKey: ticket.key,
      assignee: ticket.assignee || "Unassigned",
      status: ticket.status,
      dueDate: ticket.dueDate || null,
    },
    ...buildSourceBadge("jira"),
  };
}

async function buildMessagingPriorityItems(userId) {
  const [slackResult, telegramResult] = await Promise.allSettled([
    checkSlack(userId),
    checkTelegram(userId),
  ]);

  const items = [];

  if (slackResult.status === "fulfilled" && slackResult.value?.previews?.length) {
    items.push(...mapMessageSourceToItems("slack", slackResult.value.previews));
  }

  if (telegramResult.status === "fulfilled" && telegramResult.value?.previews?.length) {
    items.push(...mapMessageSourceToItems("telegram", telegramResult.value.previews));
  }

  return sortByPriority(items).slice(0, 3);
}

function mapMessageSourceToItems(sourceApp, previews = []) {
  return previews.slice(0, 2).map((preview, index) => {
    const unread = Number(preview.unread || 0);
    const isDirect = String(preview.type || "").toLowerCase() === "dm";
    let score = 18;
    if (isDirect) score += 16;
    if (unread >= 8) score += 18;
    else if (unread >= 4) score += 12;
    else if (unread >= 2) score += 7;
    score = clamp(score, 0, 80);

    return {
      id: `${sourceApp}:${preview.name || index}`,
      title: preview.name || `${APP_META[sourceApp]?.label || sourceApp} conversation`,
      category: "replies",
      priority: toPriorityLevel(score),
      priorityScore: score,
      reason: `${unread} unread ${isDirect ? "DM messages" : "messages"}`,
      whyThisMatters: isDirect
        ? "This direct conversation likely still needs your reply."
        : "This unread backlog may be hiding a message that needs your response.",
      suggestedNextAction: "Open the conversation and clear the messages that are blocking a response.",
      action: createModuleAction("Review now", APP_META[sourceApp]?.module || sourceApp, {
        focus: isDirect ? "direct" : "unread",
      }),
      secondaryAction: null,
      canClearQuickly: unread <= 3,
      needsAttentionSoon: unread >= 6 || isDirect,
      meta: { unread },
      ...buildSourceBadge(sourceApp),
    };
  });
}

function buildPrioritySummary(items = []) {
  const communicationItems = items.filter((item) => item.category === "communication");
  const approvals = communicationItems.filter(
    (item) => item.actionState === ACTION_STATES.NEEDS_APPROVAL
  ).length;
  const waitingOnYou = communicationItems.filter(
    (item) => item.actionState === ACTION_STATES.WAITING_ON_YOUR_REPLY
  ).length;
  const followUps = communicationItems.filter(
    (item) => item.actionState === ACTION_STATES.NEEDS_FOLLOW_UP
  ).length;

  return {
    urgentCount: items.filter((item) => item.priority === "High").length,
    quickClearCount: items.filter((item) => item.canClearQuickly).length,
    upcomingCount: items.filter(
      (item) =>
        item.category === "meetings" ||
        (item.category === "tasks" && item.needsAttentionSoon)
    ).length,
    waitingOnYouCount: waitingOnYou,
    approvalCount: approvals,
    followUpCount: followUps,
  };
}

function buildHeadline(items = [], jiraInsight = null) {
  if (!items.length) {
    if (jiraInsight?.myOverdueCount) {
      return `You have ${jiraInsight.myOverdueCount} overdue Jira ticket${jiraInsight.myOverdueCount === 1 ? "" : "s"}, but no urgent replies or meetings were detected right now.`;
    }
    return "You're clear right now. No urgent replies or personal blockers detected.";
  }

  const counts = {
    communication: items.filter((item) => item.category === "communication").length,
    approvals: items.filter((item) => item.actionState === ACTION_STATES.NEEDS_APPROVAL).length,
    followUps: items.filter((item) => item.actionState === ACTION_STATES.NEEDS_FOLLOW_UP).length,
    meetings: items.filter((item) => item.category === "meetings").length,
    tasks: items.filter((item) => item.category === "tasks").length,
  };

  const parts = [];
  if (counts.communication) {
    parts.push(
      `${counts.communication} communication thread${counts.communication === 1 ? "" : "s"} needing judgment`
    );
  }
  if (counts.approvals) {
    parts.push(`${counts.approvals} approval${counts.approvals === 1 ? "" : "s"}`);
  }
  if (counts.followUps) {
    parts.push(`${counts.followUps} follow-up${counts.followUps === 1 ? "" : "s"}`);
  }
  if (jiraInsight?.myOverdueCount) {
    parts.push(`${jiraInsight.myOverdueCount} of your Jira ticket${jiraInsight.myOverdueCount === 1 ? "" : "s"} overdue`);
  } else if (counts.tasks) {
    parts.push(`${counts.tasks} personal Jira item${counts.tasks === 1 ? "" : "s"}`);
  }
  if (counts.meetings) {
    parts.push(`${counts.meetings} upcoming meeting${counts.meetings === 1 ? "" : "s"}`);
  }

  return `${parts.join(" · ")}. OrionAI has already lined up the next operational move for each one.`;
}

function buildSuggestedActions(items = [], connectedApps = []) {
  if (!items.length) {
    if (connectedApps.length) {
      return connectedApps.slice(0, 4).map((app) => ({
        id: `suggestion:${app.id}`,
        label: app.action?.label || `Open ${app.label}`,
        description: `Go straight into ${app.label} and review the latest context.`,
        action: app.action || buildAppShortcutAction(app.id),
      }));
    }

    return [
      {
        id: "suggestion-connect-gmail",
        label: "Connect workspace apps",
        description: "Bring your inbox, calendar, and Jira into OrionAI so it can rank real work.",
        action: createPromptAction({
          label: "Connect workspace apps",
          prompt: "Show me which integrations to connect first so OrionAI can manage my day better.",
          mode: "chat",
        }),
      },
    ];
  }

  return items.slice(0, 4).map((item) => ({
    id: `suggestion:${item.id}`,
    label: item.action?.label || "Review now",
    description: item.title,
    action: item.action || createModuleAction("Review now", item.module),
  }));
}

async function getLatestActionsByItem(userId) {
  const actions = await PriorityFeedAction.find({ userId })
    .sort({ createdAt: -1 })
    .limit(150)
    .lean();

  const latestByItem = new Map();
  for (const action of actions) {
    if (!latestByItem.has(action.itemId)) {
      latestByItem.set(action.itemId, action);
    }
  }

  return latestByItem;
}

function mapAuditEntry(action) {
  return {
    id: String(action._id),
    itemId: action.itemId,
    title: action.title,
    action: action.action,
    actionLabel: action.actionLabel || "",
    note: action.note || "",
    createdAt: action.createdAt,
    ...buildSourceBadge(action.sourceApp),
  };
}

function filterActiveItems(items, latestActionsByItem) {
  const now = Date.now();
  return items.filter((item) => {
    const latest = latestActionsByItem.get(item.id);
    if (!latest) return true;
    if (isItemReactivatedSinceAction(item, latest)) {
      return true;
    }
    if (latest.action === "snoozed") {
      return !latest.snoozedUntil || new Date(latest.snoozedUntil).getTime() <= now;
    }
    return false;
  });
}

async function getHomeDashboard(userId) {
  const integrations = await Integration.find({ userId }).lean();
  const connectedApps = integrations
    .filter((integration) => isConnectedIntegration(integration))
    .map((integration) => integration.type)
    .filter((type) => APP_META[type])
    .map((type) => ({
      id: type,
      label: APP_META[type].label,
      icon: APP_META[type].icon,
      module: APP_META[type].module,
      action: buildAppShortcutAction(type),
    }));

  const [
    communicationItems,
    calendarItems,
    jiraSignals,
    latestActionsByItem,
    recentActions,
  ] = await Promise.all([
    getCommunicationPriorityItems(userId).catch(() => []),
    buildCalendarPriorityItems(userId).catch(() => []),
    buildJiraWorkspaceSignals(userId).catch(() => ({ personalItems: [], insight: null })),
    getLatestActionsByItem(userId),
    PriorityFeedAction.find({ userId }).sort({ createdAt: -1 }).limit(8).lean(),
  ]);

  const allItems = dedupeById([
    ...communicationItems,
    ...calendarItems,
    ...jiraSignals.personalItems,
  ]);
  const activeItems = sortByPriority(filterActiveItems(allItems, latestActionsByItem));
  const summary = buildPrioritySummary(activeItems);
  const now = new Date();
  const timeOfDay = getTimeOfDay(now);

  return {
    generatedAt: now.toISOString(),
    dailyBriefing: {
      title: timeOfDay === "morning" ? "Daily Briefing" : "Workspace Briefing",
      timeOfDay,
      greeting: buildGreeting(timeOfDay),
      dateLabel: formatDateLabel(now),
      summary: buildHeadline(activeItems, jiraSignals.insight),
      stats: [
        { label: "Waiting on you", value: String(summary.waitingOnYouCount || 0) },
        { label: "Approvals", value: String(summary.approvalCount || 0) },
        { label: "Follow-ups", value: String(summary.followUpCount || 0) },
      ],
      connectedApps,
      jiraInsight: jiraSignals.insight,
    },
    prioritySummary: summary,
    priorityFeed: {
      title: "Priority Feed",
      items: activeItems,
      filters: buildPriorityFeedFilters(activeItems),
      auditTrail: recentActions.map(mapAuditEntry),
      emptyState: {
        title: "You're clear right now.",
        description: "No urgent replies or personal blockers were detected across your connected work apps.",
      },
    },
    suggestedActions: buildSuggestedActions(activeItems, connectedApps),
  };
}

async function recordPriorityFeedAction(userId, payload = {}) {
  const {
    itemId,
    sourceApp,
    title,
    action,
    actionLabel,
    note = "",
    snoozeMinutes = 0,
  } = payload;

  if (!itemId || !action) {
    throw new Error("itemId and action are required");
  }

  let snoozedUntil = null;
  if (action === "snoozed") {
    const minutes = clamp(Number(snoozeMinutes || 120), 15, 7 * 24 * 60);
    snoozedUntil = new Date(Date.now() + minutes * 60000);
  }

  const entry = await PriorityFeedAction.create({
    userId,
    itemId,
    sourceApp,
    title,
    action,
    actionLabel: actionLabel || "",
    note: String(note || "").trim().slice(0, 500),
    snoozedUntil,
  });

  return mapAuditEntry(entry.toObject());
}

module.exports = {
  getHomeDashboard,
  recordPriorityFeedAction,
  __test: {
    buildPriorityFeedFilters,
    countItemsForFilter,
  },
};
