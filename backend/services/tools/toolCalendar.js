const { google } = require("googleapis");
const Integration = require("../../models/Integration");
const Fuse = require("fuse.js");
const { getOAuthConfig } = require("../googleOAuthConfig");
const { resolveCalendarAttendees } = require("../calendarAttendeeResolver");
const { refreshUsersSignals } = require("../liveSignalRefresh");
const {
  buildKolkataDayBounds,
  APP_TIMEZONE,
} = require("../calendarWindowUtils");

// ── Helper: build authorized Google Calendar client ──────────────────────────
async function getCalendarClient(userId) {
  const int = await Integration.findOne({ userId, type: "google_calendar" });
  if (!int?.googleCalendar?.accessToken)
    throw new Error(
      "Google Calendar is not connected. Connect it in Integrations first."
    );

  const oauth = getOAuthConfig("google_calendar", int.googleCalendar || {});
  const oauth2 = new google.auth.OAuth2(
    oauth.clientId,
    oauth.clientSecret,
    oauth.redirectUri
  );
  oauth2.setCredentials({
    access_token: int.googleCalendar.accessToken,
    refresh_token: int.googleCalendar.refreshToken,
  });
  return { calendar: google.calendar({ version: "v3", auth: oauth2 }), int };
}

// ── Helper: format event for rich card ───────────────────────────────────────
function extractMeetLink(event = {}) {
  const entryPoints = Array.isArray(event.conferenceData?.entryPoints)
    ? event.conferenceData.entryPoints
    : [];

  const meetEntryPoint = entryPoints.find((entryPoint) =>
    String(entryPoint?.uri || "").includes("meet.google.com")
  )?.uri;
  if (meetEntryPoint) return meetEntryPoint;

  const directEntryPoint = entryPoints.find(
    (entryPoint) => entryPoint.entryPointType === "video"
  )?.uri;
  if (directEntryPoint) return directEntryPoint;

  if (event.hangoutLink) return event.hangoutLink;

  const conferenceId = String(event.conferenceData?.conferenceId || "").trim();
  const conferenceType = String(
    event.conferenceData?.conferenceSolution?.key?.type ||
      event.conferenceData?.conferenceSolution?.name ||
      ""
  ).toLowerCase();
  if (
    conferenceId &&
    (conferenceType.includes("hangoutsmeet") ||
      conferenceType.includes("google meet"))
  ) {
    return `https://meet.google.com/${conferenceId}`;
  }

  const textSources = [event.location, event.description]
    .map((value) => String(value || ""))
    .filter(Boolean);

  for (const source of textSources) {
    const match = source.match(
      /https:\/\/meet\.google\.com\/[a-z0-9-]+(?:[/?][^\s<>"')\]]*)?/i
    );
    if (match) return match[0];
  }

  return null;
}

function fmtEvent(e) {
  const start = e.start?.dateTime || e.start?.date || "";
  const end = e.end?.dateTime || e.end?.date || "";
  const dt = start ? new Date(start) : null;
  return {
    id: e.id,
    title: e.summary || "(No title)",
    start,
    end,
    description: e.description || null,
    date: dt
      ? dt.toLocaleDateString("en-IN", {
          weekday: "short",
          day: "numeric",
          month: "short",
          year: "numeric",
        })
      : "",
    time:
      dt && e.start?.dateTime
        ? dt.toLocaleTimeString("en-IN", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: true,
          })
        : "All day",
    location: e.location || null,
    meet: extractMeetLink(e),
    attendees: (e.attendees || []).map((a) => ({
      email: a.email,
      name: a.displayName || a.email,
      rsvp: a.responseStatus,
    })),
    status: e.status,
    responseStatus: e.attendees?.find((a) => a.self)?.responseStatus || null,
  };
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

// ── TOOL 1: calendar_get_today ────────────────────────────────────────────────
async function calendarGetToday(params, ctx) {
  const { calendar } = await getCalendarClient(ctx.userId);
  const now = new Date();
  const windowHours = Number(params?.windowHours || 0);
  const useUpcomingWindow = params?.upcomingOnly && windowHours > 0;
  const bounds = buildKolkataDayBounds(now);
  const end = useUpcomingWindow
    ? new Date(now.getTime() + windowHours * 60 * 60 * 1000)
    : null;

  const res = await calendar.events.list({
    calendarId: "primary",
    conferenceDataVersion: 1,
    timeMin: useUpcomingWindow ? now.toISOString() : bounds.timeMin,
    timeMax: useUpcomingWindow ? end.toISOString() : bounds.timeMax,
    singleEvents: true,
    orderBy: "startTime",
    maxResults: 20,
  });

  const events = (res.data.items || []).map(fmtEvent);
  const visibleEvents = params?.upcomingOnly
    ? filterUpcomingTimedEvents(events, now)
    : events;
  const lines = visibleEvents.length
    ? visibleEvents.map((e) => `• ${e.time} — ${e.title}${e.meet ? " 📹" : ""}`)
    : ["No events today"];

  return {
    events: visibleEvents,
    count: visibleEvents.length,
    summary: `📅 Today (${now.toLocaleDateString("en-IN", {
      weekday: "long",
      day: "numeric",
      month: "short",
    })}):\n${lines.join("\n")}`,
  };
}

// ── TOOL 2: calendar_get_week ─────────────────────────────────────────────────
async function calendarGetWeek(params, ctx) {
  const { calendar } = await getCalendarClient(ctx.userId);
  const now = new Date();
  const mon = new Date(now);
  mon.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  mon.setHours(0, 0, 0, 0);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  sun.setHours(23, 59, 59, 999);

  const res = await calendar.events.list({
    calendarId: "primary",
    conferenceDataVersion: 1,
    timeMin: mon.toISOString(),
    timeMax: sun.toISOString(),
    singleEvents: true,
    orderBy: "startTime",
    maxResults: 50,
  });

  const events = (res.data.items || []).map(fmtEvent);
  // Group by day label
  const byDay = {};
  for (const e of events) {
    const d = e.start
      ? new Date(e.start).toLocaleDateString("en-IN", {
          weekday: "short",
          day: "numeric",
          month: "short",
        })
      : "Unknown";
    if (!byDay[d]) byDay[d] = [];
    byDay[d].push(e);
  }
  const lines = Object.entries(byDay).map(
    ([d, evs]) => `${d}: ${evs.map((e) => e.title).join(", ")}`
  );
  return {
    events,
    byDay,
    count: events.length,
    summary: events.length
      ? `📅 This week — ${events.length} events:\n${lines.join("\n")}`
      : "No events this week",
  };
}

// ── TOOL 3: calendar_get_events ───────────────────────────────────────────────
async function calendarGetEvents(params, ctx) {
  const { calendar } = await getCalendarClient(ctx.userId);
  const { query, dateFrom, dateTo, maxResults = 10 } = params;

  // ── FIX: append IST offset so Google gets the correct day ────────────────
  // new Date("2026-03-23")            → 2026-03-23T00:00:00Z  ← UTC midnight
  // new Date("2026-03-23T00:00:00+05:30") → 2026-03-22T18:30:00Z ← correct IST start
  const timeMin = dateFrom
    ? new Date(`${dateFrom}T00:00:00+05:30`).toISOString()
    : new Date().toISOString();

  // For single-day queries, if dateTo is missing default it to dateFrom
  const effectiveDateTo = dateTo || dateFrom;
  const timeMax = effectiveDateTo
    ? new Date(`${effectiveDateTo}T23:59:59+05:30`).toISOString()
    : undefined;

  const listParams = {
    calendarId: "primary",
    conferenceDataVersion: 1,
    timeMin,
    singleEvents: true,
    orderBy: "startTime",
    maxResults,
  };
  if (timeMax) listParams.timeMax = timeMax;
  if (query) listParams.q = query;

  const res = await calendar.events.list(listParams);
  const events = (res.data.items || []).map(fmtEvent);
  const lines = events.map((e) => `• ${e.date} ${e.time} — ${e.title}`);

  return {
    events,
    count: events.length,
    summary: events.length
      ? `📅 Found ${events.length} events:\n${lines.join("\n")}`
      : "No events found",
  };
}

// ── TOOL 4: calendar_create ───────────────────────────────────────────────────
async function calendarCreate(params, ctx) {
  const { calendar, int } = await getCalendarClient(ctx.userId);
  const {
    title,
    startDateTime,
    endDateTime,
    durationMinutes = 60,
    attendees = [],
    addMeet = false,
    description = "",
  } = params;

  const start = new Date(startDateTime);
  const end = endDateTime
    ? new Date(endDateTime)
    : new Date(start.getTime() + durationMinutes * 60000);

  const attendeeResolution = await resolveCalendarAttendees(attendees, {
    selfEmail: int?.googleCalendar?.userEmail || "",
  });
  const attendeeObjs = attendeeResolution.attendees;

  const event = {
    summary: title,
    description,
    start: { dateTime: start.toISOString(), timeZone: "Asia/Kolkata" },
    end: { dateTime: end.toISOString(), timeZone: "Asia/Kolkata" },
    attendees: attendeeObjs,
    sendUpdates: attendeeObjs.length ? "all" : "none",
  };

  if (addMeet) {
    event.conferenceData = {
      createRequest: { requestId: `meet-${Date.now()}` },
    };
  }

  const res = await calendar.events.insert({
    calendarId: "primary",
    resource: event,
    conferenceDataVersion: addMeet ? 1 : 0,
    sendUpdates: attendeeObjs.length ? "all" : "none",
  });

  const created = fmtEvent(res.data);
  await refreshUsersSignals([ctx.userId, ...attendeeResolution.resolvedUserIds]);
  return {
    ...created,
    summary: `✅ Created "${created.title}" on ${created.date} at ${
      created.time
    }${
      attendeeObjs.length
        ? ` · Invited ${attendeeObjs.map((a) => a.email).join(", ")}`
        : ""
    }${
      attendeeResolution.unresolved.length
        ? ` · Could not resolve ${attendeeResolution.unresolved.join(", ")}`
        : ""
    }`,
  };
}

// ── TOOL 5: calendar_update ───────────────────────────────────────────────────
async function calendarUpdate(params, ctx) {
  const { calendar, int } = await getCalendarClient(ctx.userId);
  const { eventId, title, startDateTime, endDateTime, attendees } = params;

  let targetId = eventId;
  if (!targetId && title) {
    // Find by title
    const res = await calendar.events.list({
      calendarId: "primary",
      conferenceDataVersion: 1,
      q: title,
      timeMin: new Date().toISOString(),
      singleEvents: true,
      maxResults: 5,
    });
    const match = (res.data.items || []).find((e) =>
      e.summary?.toLowerCase().includes(title.toLowerCase())
    );
    if (!match) throw new Error(`No event found matching "${title}"`);
    targetId = match.id;
  }

  const existing = await calendar.events.get({
    calendarId: "primary",
    eventId: targetId,
    conferenceDataVersion: 1,
  });
  const patch = { ...existing.data };
  if (title) patch.summary = title;
  if (startDateTime)
    patch.start = {
      dateTime: new Date(startDateTime).toISOString(),
      timeZone: APP_TIMEZONE,
    };
  if (endDateTime)
    patch.end = {
      dateTime: new Date(endDateTime).toISOString(),
      timeZone: APP_TIMEZONE,
    };
  let attendeeResolution = null;
  if (attendees) {
    attendeeResolution = await resolveCalendarAttendees(attendees, {
      selfEmail: int?.googleCalendar?.userEmail || "",
    });
    patch.attendees = attendeeResolution.attendees;
  }

  const updated = await calendar.events.update({
    calendarId: "primary",
    eventId: targetId,
    conferenceDataVersion: 1,
    resource: patch,
  });
  const evt = fmtEvent(updated.data);
  await refreshUsersSignals([
    ctx.userId,
    ...(attendeeResolution?.resolvedUserIds || []),
  ]);
  return {
    ...evt,
    summary: `✅ Updated "${evt.title}"${
      attendeeResolution?.unresolved?.length
        ? ` · Could not resolve ${attendeeResolution.unresolved.join(", ")}`
        : ""
    }`,
  };
}
function normalizeTitle(title) {
  if (!title) return title;

  const noiseWords = [
    "meeting",
    "call",
    "event",
    "session",
    "appointment",
    "schedule",
  ];

  let cleaned = title.toLowerCase();

  noiseWords.forEach((word) => {
    const regex = new RegExp(`\\b${word}\\b`, "gi");
    cleaned = cleaned.replace(regex, "");
  });

  return cleaned.trim();
}
// ── TOOL 6: calendar_delete ───────────────────────────────────────────────────
async function calendarDelete(params, ctx) {
  let { eventId, title, dateFrom, dateTo } = params;

  let targetId = eventId;

  if (!targetId && !title) {
    throw new Error(
      "Event title or eventId is required to delete a calendar event."
    );
  }

  const { calendar } = await getCalendarClient(ctx.userId);

  if (!targetId && title) {
    const normalizedTitle = normalizeTitle(title);
    if (!normalizedTitle) {
      throw new Error(
        "Please include a specific event title to delete a calendar event."
      );
    }
    const effectiveDateTo = dateTo || dateFrom;
    const listParams = {
      calendarId: "primary",
      conferenceDataVersion: 1,
      timeMin: dateFrom
        ? new Date(`${dateFrom}T00:00:00+05:30`).toISOString()
        : new Date().toISOString(),
      singleEvents: true,
      maxResults: 20,
      orderBy: "startTime",
    };

    if (effectiveDateTo) {
      listParams.timeMax = new Date(
        `${effectiveDateTo}T23:59:59+05:30`
      ).toISOString();
    }

    const res = await calendar.events.list(listParams);

    const events = (res.data.items || []).map((e) => ({
      id: e.id,
      summary: e.summary || "",
      normalized: normalizeTitle(e.summary || ""),
    }));

    if (!events.length) {
      throw new Error("No upcoming events found.");
    }

    const fuse = new Fuse(events, {
      keys: ["normalized"],
      threshold: 0.4, // lower = stricter
    });

    const result = fuse.search(normalizedTitle);

    if (!result.length) {
      throw new Error(`No event found matching "${title}"`);
    }

    const match = result[0].item;
    targetId = match.id;
  }

  await calendar.events.delete({
    calendarId: "primary",
    eventId: targetId,
  });

  return {
    success: true,
    summary: `🗑️ Deleted event${title ? ` "${title}"` : ""}`,
  };
}

// ── TOOL 7: calendar_get_invites ─────────────────────────────────────────────
async function calendarGetInvites(params, ctx) {
  const { calendar } = await getCalendarClient(ctx.userId);

  const res = await calendar.events.list({
    calendarId: "primary",
    conferenceDataVersion: 1,
    timeMin: new Date().toISOString(),
    singleEvents: true,
    orderBy: "startTime",
    maxResults: 20,
  });

  const invites = (res.data.items || [])
    .filter((e) =>
      e.attendees?.some((a) => a.self && a.responseStatus === "needsAction")
    )
    .map(fmtEvent);

  return {
    events: invites,
    count: invites.length,
    summary: invites.length
      ? `📬 You have ${invites.length} pending invite${
          invites.length !== 1 ? "s" : ""
        }:\n${invites.map((e) => `• ${e.date} — ${e.title}`).join("\n")}`
      : "No pending invites",
  };
}

// ── TOOL 8: calendar_respond ─────────────────────────────────────────────────
async function calendarRespond(params, ctx) {
  const { calendar, int } = await getCalendarClient(ctx.userId);
  const { eventId, title, response } = params; // response: accept | decline | tentative

  const statusMap = {
    accept: "accepted",
    decline: "declined",
    tentative: "tentative",
  };
  const responseStatus = statusMap[response?.toLowerCase()] || "accepted";

  let targetId = eventId;
  if (!targetId && title) {
    const res = await calendar.events.list({
      calendarId: "primary",
      conferenceDataVersion: 1,
      q: title,
      timeMin: new Date().toISOString(),
      singleEvents: true,
      maxResults: 5,
    });
    const match = (res.data.items || []).find((e) =>
      e.summary?.toLowerCase().includes(title.toLowerCase())
    );
    if (!match) throw new Error(`No invite found matching "${title}"`);
    targetId = match.id;
  }

  const existing = await calendar.events.get({
    calendarId: "primary",
    eventId: targetId,
    conferenceDataVersion: 1,
  });
  const patch = { ...existing.data };
  const selfIdx = (patch.attendees || []).findIndex((a) => a.self);
  if (selfIdx === -1) throw new Error("You are not an attendee of this event");
  patch.attendees[selfIdx].responseStatus = responseStatus;

  await calendar.events.patch({
    calendarId: "primary",
    eventId: targetId,
    conferenceDataVersion: 1,
    resource: { attendees: patch.attendees },
    sendUpdates: "all",
  });

  const labels = {
    accepted: "✅ Accepted",
    declined: "❌ Declined",
    tentative: "❓ Tentatively accepted",
  };
  return {
    success: true,
    eventId: targetId,
    responseStatus,
    summary: `${labels[responseStatus]} "${existing.data.summary || "event"}"`,
  };
}

module.exports = {
  calendarGetToday,
  calendarGetWeek,
  calendarGetEvents,
  calendarCreate,
  calendarUpdate,
  calendarDelete,
  calendarGetInvites,
  calendarRespond,
  filterUpcomingTimedEvents,
  isUpcomingTimedEvent,
  __test: {
    extractMeetLink,
  },
};
