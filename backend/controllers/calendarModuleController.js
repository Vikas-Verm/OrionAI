/**
 * calendarModuleController.js
 * Same auth pattern as gmailModuleController / toolGmail.js.
 * Reads clientId/clientSecret from DB (set by updated OAuth callback), env vars as fallback.
 */
const axios = require("axios");
const Integration = require("../models/Integration");
const { getOAuthConfig } = require("../services/googleOAuthConfig");
const { buildKolkataMonthBounds } = require("../services/calendarWindowUtils");

async function getCalendarClient(userId) {
  const doc = await Integration.findOne({
    userId,
    type: "google_calendar",
    enabled: true,
  });
  if (!doc?.googleCalendar?.accessToken && !doc?.googleCalendar?.refreshToken) {
    throw new Error(
      "Google Calendar not connected. Go to Settings → Integrations → Google Calendar."
    );
  }
  const oauth = getOAuthConfig("google_calendar", doc.googleCalendar || {});
  const cfg = {
    accessToken: doc.googleCalendar.accessToken || null,
    refreshToken: doc.googleCalendar.refreshToken || null,
    clientId: oauth.clientId,
    clientSecret: oauth.clientSecret,
  };
  const accessToken = await refreshAccessToken(cfg);
  return axios.create({
    baseURL: "https://www.googleapis.com/calendar/v3",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });
}

async function refreshAccessToken(cfg) {
  if (!cfg.refreshToken || !cfg.clientId || !cfg.clientSecret) {
    if (cfg.accessToken) return cfg.accessToken;
    throw new Error(
      "Calendar OAuth credentials incomplete. Re-connect Google Calendar in Integrations."
    );
  }
  try {
    const res = await axios.post("https://oauth2.googleapis.com/token", null, {
      params: {
        grant_type: "refresh_token",
        refresh_token: cfg.refreshToken,
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
      },
    });
    return res.data.access_token;
  } catch (err) {
    const detail =
      err.response?.data?.error_description ||
      err.response?.data?.error ||
      err.message;
    throw new Error(
      `Calendar token refresh failed (${detail}). Re-connect Google Calendar in Integrations.`
    );
  }
}

function formatEvent(ev) {
  return {
    id: ev.id,
    title: ev.summary || "(no title)",
    start: ev.start?.dateTime || ev.start?.date || null,
    end: ev.end?.dateTime || ev.end?.date || null,
    meet: ev.hangoutLink || null,
    description: ev.description || null,
    responseStatus: ev.attendees?.find((a) => a.self)?.responseStatus || null,
    attendees: (ev.attendees || []).map((a) => ({
      name: a.displayName || a.email?.split("@")[0] || "",
      email: a.email || "",
      rsvp: a.responseStatus || "needsAction",
    })),
  };
}

// GET /api/calendar/events?month=3&year=2026
exports.getEvents = async (req, res) => {
  try {
    const cal = await getCalendarClient(req.user?.username);
    const month = parseInt(req.query.month) || new Date().getMonth() + 1;
    const year = parseInt(req.query.year) || new Date().getFullYear();
    const monthBounds = buildKolkataMonthBounds(year, month);

    const params = {
      timeMin: monthBounds.timeMin,
      timeMax: monthBounds.timeMax,
      singleEvents: true,
      orderBy: "startTime",
      maxResults: 500,
    };

    // ── Fetch all calendars the user has subscribed to ────────────
    // This includes Indian Holidays, Birthdays, Tasks, etc.
    let calendarList = [];
    try {
      const listRes = await cal.get("/users/me/calendarList", {
        params: { maxResults: 100 },
      });
      calendarList = listRes.data.items || [];
    } catch (e) {
      console.warn(
        "Could not fetch calendarList, falling back to primary:",
        e.message
      );
      calendarList = [{ id: "primary", kind: "calendar#calendarListEntry" }];
    }

    // Fetch events from all visible calendars in parallel
    const results = await Promise.allSettled(
      calendarList
        .filter((c) => c.selected !== false) // skip unchecked calendars
        .map((cal_entry) =>
          cal
            .get(`/calendars/${encodeURIComponent(cal_entry.id)}/events`, {
              params,
            })
            .then((r) => ({ items: r.data.items || [], calEntry: cal_entry }))
        )
    );

    const allEvents = [];
    const seenIds = new Set();

    for (const result of results) {
      if (result.status !== "fulfilled") continue;
      const { items, calEntry } = result.value;
      const isHolidayCal =
        calEntry.id.includes("holiday") || calEntry.id.includes("#holiday");
      const calColor = calEntry.backgroundColor || null;

      for (const ev of items) {
        if (seenIds.has(ev.id)) continue;
        seenIds.add(ev.id);
        const formatted = formatEvent(ev);
        if (isHolidayCal) formatted.isHoliday = true;
        if (calColor && !ev.colorId) formatted.calendarColor = calColor;
        allEvents.push(formatted);
      }
    }

    // Sort by start time
    allEvents.sort((a, b) => ((a.start || "") < (b.start || "") ? -1 : 1));
    res.json({ events: allEvents });
  } catch (err) {
    console.error("Calendar events error:", err.message);
    res.status(500).json({ error: err.message });
  }
};

// Maps hex color values from CalendarPage color picker to Google Calendar colorIds (1-11)
function googleColorId(hex) {
  const map = {
    "#3F51B5": "1", // Lavender→ Peacock
    "#D50000": "11", // Tomato
    "#E67C73": "11", // Flamingo
    "#F4511E": "6", // Tangerine
    "#F6BF26": "5", // Banana
    "#33B679": "2", // Sage
    "#0B8043": "10", // Basil
    "#039BE5": "7", // Peacock
    "#616161": "8", // Graphite
    "#7986CB": "1", // Lavender
    "#8E24AA": "3", // Grape
    "#1a73e8": "9", // Blueberry
  };
  return map[hex] || null;
}

// POST /api/calendar/events — body: { title, start, end, meet?, attendees? }
exports.createEvent = async (req, res) => {
  try {
    const cal = await getCalendarClient(req.user?.username);
    const {
      title,
      start,
      end,
      meet,
      attendees = [],
      location,
      description,
      color,
    } = req.body;
    const isDate = (s) => s && !s.includes("T");
    const tz = "Asia/Kolkata";
    const startObj = isDate(start)
      ? { date: start }
      : { dateTime: start, timeZone: tz };
    const endObj = !end
      ? isDate(start)
        ? { date: start }
        : {
            dateTime: new Date(
              new Date(start).getTime() + 3600000
            ).toISOString(),
            timeZone: tz,
          }
      : isDate(end)
      ? { date: end }
      : { dateTime: end, timeZone: tz };

    // attendees can be either strings ("a@b.com") or objects ({ email, name })
    const attendeeObjs = attendees.map((e) =>
      typeof e === "string"
        ? { email: e }
        : { email: e.email, ...(e.name ? { displayName: e.name } : {}) }
    );
    const body = {
      summary: title,
      start: startObj,
      end: endObj,
      attendees: attendeeObjs,
    };
    if (location) body.location = location;
    if (description) body.description = description;
    if (color) body.colorId = googleColorId(color);
    const params = {};
    if (meet) {
      body.conferenceData = {
        createRequest: { requestId: `orion_${Date.now()}` },
      };
      params.conferenceDataVersion = 1;
    }
    if (attendees.length) params.sendUpdates = "all";

    const r = await cal.post("/calendars/primary/events", body, { params });
    res.json({ event: formatEvent(r.data), success: true });
  } catch (err) {
    console.error("Calendar create error:", err.message);
    res.status(500).json({ error: err.message });
  }
};

// DELETE /api/calendar/events/:eventId
exports.deleteEvent = async (req, res) => {
  try {
    const cal = await getCalendarClient(req.user?.username);
    await cal.delete(`/calendars/primary/events/${req.params.eventId}`);
    res.json({ success: true });
  } catch (err) {
    console.error("Calendar delete error:", err.message);
    res.status(500).json({ error: err.message });
  }
};
