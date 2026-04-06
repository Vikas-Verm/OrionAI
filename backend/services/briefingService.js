"use strict";

const Integration = require("../models/Integration");
const { isConnectedIntegration } = require("./integrationConnectionState");
const { getUnreadSignals } = require("./inboxSignalsService");
const { getCommunicationActionStates } = require("./communicationActionService");
const { toolGetOverdueTickets } = require("./tools/toolJira");
const { calendarGetToday } = require("./tools/toolCalendar");

const APP_META = {
  gmail: { label: "Gmail", icon: "📧", module: "gmail" },
  slack: { label: "Slack", icon: "💬", module: "slack" },
  telegram: { label: "Telegram", icon: "✈️", module: "telegram" },
  signal: { label: "Signal", icon: "🛡️", module: "signal" },
  whatsapp: { label: "WhatsApp", icon: "🟢", module: "whatsapp" },
  jira: { label: "Jira", icon: "🔷", module: "jira" },
  google_calendar: { label: "Calendar", icon: "📅", module: "google_calendar" },
  database: { label: "Database", icon: "🗄️", module: "database" },
  razorpay: { label: "Razorpay", icon: "₹", module: "razorpay" },
};

function formatCount(value) {
  const count = Number(value || 0);
  if (count < 1000) return String(count);
  return new Intl.NumberFormat("en-IN", {
    notation: "compact",
    maximumFractionDigits: count >= 10000 ? 0 : 1,
  }).format(count);
}

function buildCommunicationStats(communicationCounts = {}, connectedSet = new Set()) {
  const stats = [
    {
      label: "Connected apps",
      value: String(connectedSet.size),
    },
  ];

  if (connectedSet.has("jira")) {
    stats.push(
      {
        label: "Waiting on you",
        value: formatCount(communicationCounts.replyRequiredCount || 0),
      },
      {
        label: "Approvals",
        value: formatCount(communicationCounts.approvalCount || 0),
      }
    );
  } else {
    stats.push({
      label: "Waiting on you",
      value: formatCount(communicationCounts.replyRequiredCount || 0),
    });
  }

  stats.push({
    label: "Follow-ups",
    value: formatCount(communicationCounts.followUpCount || 0),
  });

  return stats;
}

async function getMorningBriefing(userId) {
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
    }));

  const connectedSet = new Set(connectedApps.map((app) => app.id));

  const [unreadSignals, communicationResult, jiraResult, calendarResult] = await Promise.all([
    getUnreadSignals(userId),
    getCommunicationActionStates(userId, { source: "all" }).catch(() => null),
    connectedSet.has("jira")
      ? toolGetOverdueTickets({}, { userId }).catch(() => null)
      : Promise.resolve(null),
    connectedSet.has("google_calendar")
      ? calendarGetToday({ upcomingOnly: true }, { userId }).catch(() => null)
      : Promise.resolve(null),
  ]);

  const now = new Date();
  const hours = now.getHours();
  const timeOfDay =
    hours < 12 ? "morning" : hours < 17 ? "afternoon" : "evening";

  const communicationCounts = communicationResult?.counts || {};
  const signalEntries = Object.entries(unreadSignals).filter(
    ([, value]) => (value?.count || 0) > 0
  );
  const unreadEntries = signalEntries.filter(
    ([app]) => app !== "google_calendar"
  );
  const totalUnread = unreadEntries.reduce(
    (sum, [, value]) => sum + (value?.count || 0),
    0
  );
  const overdueCount = jiraResult?.count || 0;
  const myOverdueCount = jiraResult?.myCount || 0;
  const calendarEvents = calendarResult?.events || [];
  const upcomingEvent = findUpcomingEvent(calendarEvents, now);

  const stats = buildCommunicationStats(communicationCounts, connectedSet);

  const alerts = [];

  if (overdueCount > 0) {
    alerts.push({
      id: "jira-overdue",
      severity: overdueCount >= 5 ? "high" : "medium",
      icon: "⚠️",
      title: `${overdueCount} overdue Jira ticket${overdueCount === 1 ? "" : "s"}`,
      detail: buildJiraDetail(jiraResult),
      appId: "jira",
      prompt:
        "Show my overdue Jira tickets, group them by urgency, and tell me what to tackle first.",
    });
  }

  if ((communicationCounts.actionableCount || 0) > 0) {
    alerts.push({
      id: "unanswered-messages",
      severity: (communicationCounts.actionableCount || 0) >= 8 ? "high" : "medium",
      icon: "💬",
      title: `${formatCount(communicationCounts.actionableCount || 0)} conversations are waiting on you`,
      detail:
        communicationResult?.summaryText ||
        unreadEntries
          .map(
            ([app, value]) =>
              `${APP_META[app]?.label || app} ${formatCount(value.count)}`
          )
          .join(" · "),
      appId: "gmail",
      prompt:
        "Summarize the messages waiting for a reply across my connected apps and draft responses for the urgent ones.",
    });
  }

  if (upcomingEvent) {
    alerts.push({
      id: "upcoming-event",
      severity: upcomingEvent.minutesUntil <= 30 ? "high" : "medium",
      icon: "🕒",
      title: `${upcomingEvent.title} starts in ${upcomingEvent.minutesUntil} min`,
      detail: upcomingEvent.timeLabel,
      appId: "google_calendar",
      prompt:
        `Prep me for "${upcomingEvent.title}" and tell me anything I should have ready before it starts.`,
    });
  }

  const summary = buildSummary({
    connectedCount: connectedApps.length,
    totalUnread: communicationCounts.actionableCount || totalUnread,
    overdueCount,
    myOverdueCount,
    calendarCount: calendarEvents.length,
  });

  return {
    generatedAt: now.toISOString(),
    timeOfDay,
    title: timeOfDay === "morning" ? "Morning briefing" : "Daily briefing",
    greeting: buildGreeting(timeOfDay),
    dateLabel: now.toLocaleDateString("en-IN", {
      weekday: "long",
      day: "numeric",
      month: "long",
    }),
    summary,
    stats,
    alerts,
    calendar: {
      count: calendarEvents.length,
      events: calendarEvents.slice(0, 4).map((event) => ({
        id: event.id,
        title: event.title,
        time: event.time,
        date: event.date,
        location: event.location,
        meet: event.meet,
      })),
    },
    connectedApps,
    suggestions: buildSuggestions({
      connectedSet,
      unreadSignals,
      jiraResult,
      calendarEvents,
    }),
  };
}

function buildGreeting(timeOfDay) {
  if (timeOfDay === "morning") return "Your workspace is already warmed up.";
  if (timeOfDay === "afternoon") return "Here’s the state of play right now.";
  return "A quick end-of-day scan is ready.";
}

function buildSummary({ connectedCount, totalUnread, overdueCount, myOverdueCount, calendarCount }) {
  if (!connectedCount) {
    return "Connect Gmail, Slack, Jira, or Calendar and OrionAI will start briefing you automatically.";
  }

  const parts = [];
  if (totalUnread) {
    parts.push(
      `${formatCount(totalUnread)} conversation${totalUnread === 1 ? "" : "s"} waiting`
    );
  }
  if (overdueCount) {
    if (myOverdueCount) {
      parts.push(
        `${formatCount(myOverdueCount)} of your Jira ticket${myOverdueCount === 1 ? "" : "s"} overdue`
      );
    }
    parts.push(
      `${formatCount(overdueCount)} total overdue Jira ticket${overdueCount === 1 ? "" : "s"}`
    );
  }
  if (calendarCount) {
    parts.push(
      `${calendarCount} upcoming meeting${calendarCount === 1 ? "" : "s"} today`
    );
  }

  if (!parts.length) {
    return "Everything looks calm across your connected apps right now.";
  }

  return `You have ${joinParts(parts)}. OrionAI can take you straight into the highest-leverage next step.`;
}

function buildJiraDetail(jiraResult) {
  const tickets = jiraResult?.tickets || [];
  const myCount = jiraResult?.myCount || 0;
  const detail = tickets
    .slice(0, 2)
    .map((ticket) => `${ticket.key} · ${ticket.daysOverdue}d overdue`)
    .join(" · ");
  const split = `Yours ${formatCount(myCount)} · Total ${formatCount(jiraResult?.count || tickets.length)}`;
  if (!tickets.length) return `${split} · Past due work needs attention.`;
  return `${split} · ${detail}`;
}

function buildSuggestions({ connectedSet, unreadSignals, jiraResult, calendarEvents }) {
  const suggestions = [];
  const totalUnread = Object.entries(unreadSignals)
    .filter(([app]) => app !== "google_calendar")
    .reduce(
      (sum, [, value]) => sum + (value?.count || 0),
      0
    );

  if ((jiraResult?.count || 0) > 0) {
    suggestions.push({
      id: "suggestion-jira-overdue",
      label: "Fix overdue Jira",
      appId: "jira",
      mode: "agent",
      prompt:
        "Show my overdue Jira tickets, rank them by urgency, and suggest the first actions I should take.",
    });
  }

  if (totalUnread > 0) {
    suggestions.push({
      id: "suggestion-replies",
      label: "Catch up on replies",
      appId: firstActiveUnreadApp(unreadSignals),
      mode: "agent",
      prompt:
        "Summarize the messages waiting for a reply across my connected apps and draft responses for anything urgent.",
    });
  }

  if (connectedSet.has("gmail")) {
    suggestions.push({
      id: "suggestion-gmail",
      label: "Review Gmail priorities",
      appId: "gmail",
      mode: "agent",
      prompt:
        "Show my unread Gmail emails, highlight the urgent ones, and draft replies for the top threads.",
    });
  }

  if (connectedSet.has("slack")) {
    suggestions.push({
      id: "suggestion-slack",
      label: "Review Slack backlog",
      appId: "slack",
      mode: "agent",
      prompt:
        "Show the Slack DMs or channels with unread messages and tell me what needs a response first.",
    });
  }

  if (connectedSet.has("telegram")) {
    suggestions.push({
      id: "suggestion-telegram",
      label: "Check Telegram",
      appId: "telegram",
      mode: "agent",
      prompt:
        "Summarize my unread Telegram chats and point out anything that looks urgent.",
    });
  }

  if (connectedSet.has("signal")) {
    suggestions.push({
      id: "suggestion-signal",
      label: "Review Signal",
      appId: "signal",
      mode: "agent",
      prompt:
        "Summarize my unread Signal conversations, highlight anything urgent, and tell me where I should reply first.",
    });
  }

  if (connectedSet.has("database")) {
    suggestions.push({
      id: "suggestion-database",
      label: "Query my database",
      appId: "database",
      mode: "db",
      prompt:
        "Show me the most important business insights from my connected database today.",
    });
  }

  if (connectedSet.has("razorpay")) {
    suggestions.push({
      id: "suggestion-razorpay",
      label: "Review payouts",
      appId: "razorpay",
      mode: "agent",
      prompt:
        "Show my recent Razorpay payouts, flag anything pending, and summarize what finance should review.",
    });
  }

  if (connectedSet.has("google_calendar")) {
    suggestions.push({
      id: "suggestion-calendar",
      label: "Prep my day",
      appId: "google_calendar",
      mode: "agent",
      prompt:
        calendarEvents.length > 0
          ? "Summarize today’s calendar, tell me what to prepare for, and flag any gaps between meetings."
          : "Check my calendar for today and tell me how much free time I have.",
    });
  }

  if (!suggestions.length) {
    suggestions.push(
      {
        id: "suggestion-general-research",
        label: "Plan my day",
        appId: "orion",
        mode: "chat",
        prompt: "Help me plan the highest-impact work for today.",
      },
      {
        id: "suggestion-general-brainstorm",
        label: "Brainstorm with Orion",
        appId: "orion",
        mode: "chat",
        prompt: "Give me three meaningful ways to use OrionAI today.",
      }
    );
  }

  return dedupeSuggestions(suggestions).slice(0, 4);
}

function dedupeSuggestions(suggestions) {
  const seen = new Set();
  return suggestions.filter((suggestion) => {
    if (seen.has(suggestion.label)) return false;
    seen.add(suggestion.label);
    return true;
  });
}

function firstActiveUnreadApp(unreadSignals) {
  const app = Object.entries(unreadSignals).find(
    ([key, value]) => key !== "google_calendar" && (value?.count || 0) > 0
  );
  return app?.[0] || "gmail";
}

function findUpcomingEvent(events, now) {
  for (const event of events) {
    if (!event.start) continue;
    const start = new Date(event.start);
    const diffMs = start.getTime() - now.getTime();
    const minutesUntil = Math.round(diffMs / 60000);
    if (minutesUntil >= 0 && minutesUntil <= 120) {
      return {
        title: event.title,
        minutesUntil,
        timeLabel: `${event.time}${event.location ? ` · ${event.location}` : ""}`,
      };
    }
  }
  return null;
}

function joinParts(parts) {
  if (parts.length <= 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
}

module.exports = {
  getMorningBriefing,
  APP_META,
  __test: {
    buildCommunicationStats,
    buildSummary,
  },
};
