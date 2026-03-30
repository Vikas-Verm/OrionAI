"use strict";

const { google } = require("googleapis");
const Integration = require("../models/Integration");
const { getOAuthConfig } = require("./googleOAuthConfig");
const { calendarGetToday } = require("./tools/toolCalendar");
const {
  GMAIL_PRIORITY_24H_QUERY,
  GMAIL_PRIORITY_HEADERS,
  GMAIL_PRIORITY_RECENT_QUERY,
  buildGmailSignalSummary,
  classifyPriorityThread,
} = require("./gmailPriorityRules");

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
  const result = await gmail.users.threads.list({
    userId: "me",
    maxResults,
    q: GMAIL_PRIORITY_RECENT_QUERY,
    fields: "threads/id,nextPageToken",
  });
  return result.data.threads || [];
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
          metadataHeaders: GMAIL_PRIORITY_HEADERS,
        })
        .then((result) => result.data)
        .catch(() => null)
    )
  );

  const selfEmail = (integration?.gmail?.userEmail || "").toLowerCase();
  const threads = threadResults
    .map((thread) => (thread ? classifyPriorityThread(thread, selfEmail) : null))
    .filter(Boolean)
    .sort((a, b) => b.lastMs - a.lastMs);

  const previews = threads
    .slice(0, previewLimit)
    .map(({ id, subject, from, unread, highConfidence, latestMessageId, lastMs }) => ({
      id,
      subject,
      from,
      unread,
      highConfidence,
      latestMessageId: latestMessageId || id,
      latestMessageAt: lastMs ? new Date(lastMs).toISOString() : null,
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
  const windowHours = 12;
  const result = await calendarGetToday(
    { upcomingOnly: true, windowHours },
    { userId }
  );
  const events = result?.events || [];
  const items = events.map((event) => ({
    id: event.id,
    title: event.title,
    time: event.time,
    date: event.date,
    start: event.start,
  }));
  const previews = items.slice(0, previewLimit);

  return {
    app: "google_calendar",
    count: events.length,
    previews,
    items,
    events,
    summary: events.length
      ? `${events.length} upcoming meeting${events.length === 1 ? "" : "s"} in the next ${windowHours} hours`
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
