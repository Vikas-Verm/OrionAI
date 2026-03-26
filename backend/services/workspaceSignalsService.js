"use strict";

const { google } = require("googleapis");
const Integration = require("../models/Integration");
const { getOAuthConfig } = require("./googleOAuthConfig");
const { calendarGetToday } = require("./tools/toolCalendar");

const DAY_MS = 24 * 60 * 60 * 1000;
const GMAIL_PRIORITY_24H_QUERY = [
  "in:inbox",
  "newer_than:1d",
  "-from:me",
  "-category:promotions",
  "-category:social",
  "-category:updates",
  "-category:forums",
].join(" ");
const GMAIL_PRIORITY_RECENT_QUERY = [
  "in:inbox",
  "newer_than:20m",
  "-from:me",
  "-category:promotions",
  "-category:social",
  "-category:updates",
  "-category:forums",
].join(" ");

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

function isAutomatedSender(fromValue, headers = []) {
  const haystack = [
    fromValue,
    getHeader(headers, "Reply-To"),
    getHeader(headers, "Auto-Submitted"),
    getHeader(headers, "Precedence"),
    getHeader(headers, "X-Auto-Response-Suppress"),
  ]
    .join(" ")
    .toLowerCase();

  if (
    /no-?reply|do-?not-?reply|donotreply|mailer-daemon|auto-?reply|bounce/.test(
      haystack
    )
  ) {
    return true;
  }

  const autoSubmitted = getHeader(headers, "Auto-Submitted").toLowerCase();
  if (autoSubmitted && autoSubmitted !== "no") return true;

  return false;
}

function isInvalidGrantError(err) {
  const haystack = [
    err?.response?.data?.error,
    err?.response?.data?.error_description,
    err?.errors?.[0]?.message,
    err?.message,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes("invalid_grant");
}

async function markGmailReconnectRequired(userId) {
  await Integration.findOneAndUpdate(
    { userId, type: "gmail" },
    {
      $set: {
        enabled: false,
        "gmail.accessToken": "",
        "gmail.expiresAt": null,
        lastTestOk: false,
        updatedAt: new Date(),
      },
    }
  ).catch(() => {});
}

async function getGmailClient(userId) {
  const integration = await Integration.findOne({
    userId,
    type: "gmail",
    enabled: true,
  });
  if (!integration?.gmail?.refreshToken && !integration?.gmail?.accessToken) {
    return null;
  }

  const oauth = getOAuthConfig("gmail", integration.gmail || {});
  const oauth2 = new google.auth.OAuth2(
    oauth.clientId,
    oauth.clientSecret,
    oauth.redirectUri
  );
  oauth2.setCredentials({
    access_token: integration.gmail.accessToken,
    refresh_token: integration.gmail.refreshToken,
    expiry_date: integration.gmail.expiresAt
      ? new Date(integration.gmail.expiresAt).getTime()
      : undefined,
  });

  return {
    integration,
    gmail: google.gmail({ version: "v1", auth: oauth2 }),
  };
}

async function listRecentPriorityGmailMessages(gmail, maxResults = 15) {
  const result = await gmail.users.messages.list({
    userId: "me",
    maxResults,
    q: GMAIL_PRIORITY_RECENT_QUERY,
    fields: "messages/id,nextPageToken",
  });
  return result.data.messages || [];
}

async function listPriorityThreadIds(gmail, maxThreads = 80) {
  const threads = [];
  let pageToken = null;

  do {
    const res = await gmail.users.threads.list({
      userId: "me",
      q: GMAIL_PRIORITY_24H_QUERY,
      maxResults: Math.min(100, maxThreads - threads.length),
      pageToken: pageToken || undefined,
      fields: "threads/id,nextPageToken",
    });

    threads.push(...(res.data.threads || []));
    pageToken = res.data.nextPageToken || null;
  } while (pageToken && threads.length < maxThreads);

  return threads;
}

function threadNeedsReply(thread, selfEmail, nowMs = Date.now()) {
  const messages = thread.messages || [];
  const latestMessage = messages[messages.length - 1];
  if (!latestMessage) return null;

  const headers = latestMessage.payload?.headers || [];
  const from = getHeader(headers, "From") || "Unknown";
  const senderEmail = extractEmailAddress(from);
  if (!senderEmail || senderEmail === selfEmail) return null;
  if (isAutomatedSender(from, headers)) return null;

  const latestMs =
    Number(latestMessage.internalDate || 0) ||
    Date.parse(getHeader(headers, "Date") || "");
  if (!latestMs || nowMs - latestMs > DAY_MS) return null;

  return {
    id: thread.id,
    subject: getHeader(headers, "Subject") || "(no subject)",
    from,
    unread: (latestMessage.labelIds || []).includes("UNREAD"),
    lastMs: latestMs,
  };
}

function buildGmailSignalSummary(count) {
  if (!count) return null;
  return `${count} priority email${count === 1 ? "" : "s"} from the last 24h`;
}

async function getGmailAttentionFromClient(
  gmail,
  integration,
  { previewLimit = 3, maxThreads = 80 } = {}
) {
  const threadIds = await listPriorityThreadIds(gmail, maxThreads);
  if (!threadIds.length) {
    return {
      app: "gmail",
      count: 0,
      previews: [],
      items: [],
      summary: null,
    };
  }

  const threadResults = await Promise.all(
    threadIds.map((thread) =>
      gmail.users.threads
        .get({
          userId: "me",
          id: thread.id,
          format: "metadata",
          metadataHeaders: [
            "Subject",
            "From",
            "To",
            "Date",
            "Reply-To",
            "Auto-Submitted",
            "Precedence",
            "X-Auto-Response-Suppress",
          ],
        })
        .then((result) => result.data)
        .catch(() => null)
    )
  );

  const selfEmail = (integration?.gmail?.userEmail || "").toLowerCase();
  const threads = threadResults
    .map((thread) => (thread ? threadNeedsReply(thread, selfEmail) : null))
    .filter(Boolean)
    .sort((a, b) => b.lastMs - a.lastMs);

  const previews = threads
    .slice(0, previewLimit)
    .map(({ id, subject, from, unread }) => ({
      id,
      subject,
      from,
      unread,
    }));

  return {
    app: "gmail",
    count: threads.length,
    previews,
    items: previews,
    summary: buildGmailSignalSummary(threads.length),
  };
}

async function getGmailAttentionSignal(userId, options = {}) {
  const client = await getGmailClient(userId);
  if (!client) return null;
  try {
    return await getGmailAttentionFromClient(
      client.gmail,
      client.integration,
      options
    );
  } catch (err) {
    if (isInvalidGrantError(err)) {
      await markGmailReconnectRequired(userId);
      const reconnectError = new Error("Gmail reconnect needed.");
      reconnectError.code = "GMAIL_RECONNECT_REQUIRED";
      throw reconnectError;
    }
    throw err;
  }
}

function isUpcomingTimedEvent(event, now = new Date()) {
  if (!event?.start || !String(event.start).includes("T")) return false;
  const endValue =
    event.end && String(event.end).includes("T") ? event.end : event.start;
  return new Date(endValue).getTime() > now.getTime();
}

function filterUpcomingTimedEvents(events = [], now = new Date()) {
  return events.filter((event) => isUpcomingTimedEvent(event, now));
}

async function getCalendarUpcomingSignal(userId, { previewLimit = 3 } = {}) {
  const result = await calendarGetToday({ upcomingOnly: true }, { userId });
  const events = result?.events || [];
  const previews = events.slice(0, previewLimit).map((event) => ({
    id: event.id,
    title: event.title,
    time: event.time,
    date: event.date,
  }));

  return {
    app: "google_calendar",
    count: events.length,
    previews,
    items: previews,
    summary: events.length
      ? `${events.length} upcoming meeting${events.length === 1 ? "" : "s"} today`
      : null,
  };
}

module.exports = {
  GMAIL_PRIORITY_24H_QUERY,
  GMAIL_PRIORITY_RECENT_QUERY,
  getGmailClient,
  getGmailAttentionSignal,
  getGmailAttentionFromClient,
  listRecentPriorityGmailMessages,
  getCalendarUpcomingSignal,
  filterUpcomingTimedEvents,
  isUpcomingTimedEvent,
};
