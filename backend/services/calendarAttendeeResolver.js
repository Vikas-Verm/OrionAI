"use strict";

const Integration = require("../models/Integration");
const User = require("../models/user");

const CALENDAR_IDENTITY_TYPES = ["google_calendar", "gmail"];

function normalizeSpacing(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeIdentity(value = "") {
  return normalizeSpacing(value).toLowerCase().replace(/^@+/, "");
}

function escapeRegExp(value = "") {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractEmailAddress(value = "") {
  const match = String(value || "").match(
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i
  );
  return (match?.[0] || "").trim().toLowerCase();
}

function extractDisplayName(value = "") {
  const raw = normalizeSpacing(value);
  if (!raw) return "";
  const bracketMatch = raw.match(/^(.+?)\s*<[^>]+>$/);
  if (bracketMatch?.[1]) {
    return normalizeSpacing(bracketMatch[1]).replace(/^"|"$/g, "");
  }
  if (extractEmailAddress(raw)) return "";
  return raw;
}

function buildAttendeeSeed(attendee) {
  if (typeof attendee === "string") {
    const rawText = normalizeSpacing(attendee);
    const directEmail = extractEmailAddress(rawText);
    const displayName = extractDisplayName(rawText);
    const identities = Array.from(
      new Set(
        [rawText, displayName]
          .map((value) => normalizeIdentity(value))
          .filter(Boolean)
      )
    );

    return {
      rawText,
      directEmail,
      displayName,
      identities,
    };
  }

  const rawEmail = normalizeSpacing(
    attendee?.email || attendee?.value || attendee?.identifier || ""
  );
  const rawName = normalizeSpacing(
    attendee?.displayName || attendee?.name || attendee?.label || ""
  );
  const rawUsername = normalizeSpacing(
    attendee?.username || attendee?.userId || ""
  );
  const directEmail = extractEmailAddress(rawEmail);
  const displayName = rawName || extractDisplayName(rawEmail);
  const rawText = rawEmail || rawUsername || rawName;
  const identities = Array.from(
    new Set(
      [rawEmail, rawUsername, rawName, rawText]
        .map((value) => normalizeIdentity(value))
        .filter(Boolean)
    )
  );

  return {
    rawText,
    directEmail,
    displayName,
    identities,
  };
}

function pickPreferredIntegrationEmail(integrations = []) {
  const normalized = integrations
    .filter(Boolean)
    .sort((left, right) => {
      const leftScore =
        left.type === "google_calendar"
          ? 3
          : left.type === "gmail"
          ? 2
          : 1;
      const rightScore =
        right.type === "google_calendar"
          ? 3
          : right.type === "gmail"
          ? 2
          : 1;
      return rightScore - leftScore;
    });

  for (const integration of normalized) {
    const email = extractEmailAddress(
      integration?.googleCalendar?.userEmail || integration?.gmail?.userEmail || ""
    );
    if (email) {
      return {
        email,
        userId: integration.userId || null,
        displayName:
          normalizeSpacing(
            integration?.googleCalendar?.userName ||
              integration?.gmail?.userName ||
              ""
          ) || null,
      };
    }
  }

  return null;
}

async function resolveIdentityFromDirectory(seed) {
  const identities = Array.isArray(seed?.identities) ? seed.identities : [];
  if (!identities.length) return null;

  for (const identity of identities) {
    const directDocs = await Integration.find({
      type: { $in: CALENDAR_IDENTITY_TYPES },
      enabled: true,
      $or: [
        { userId: identity },
        { "googleCalendar.userEmail": new RegExp(`^${escapeRegExp(identity)}$`, "i") },
        { "gmail.userEmail": new RegExp(`^${escapeRegExp(identity)}$`, "i") },
        { "googleCalendar.userEmail": new RegExp(`^${escapeRegExp(identity)}@`, "i") },
        { "gmail.userEmail": new RegExp(`^${escapeRegExp(identity)}@`, "i") },
        { "googleCalendar.userName": new RegExp(`^${escapeRegExp(seed.rawText)}$`, "i") },
        { "gmail.userName": new RegExp(`^${escapeRegExp(seed.rawText)}$`, "i") },
      ],
    }).lean();

    const directMatch = pickPreferredIntegrationEmail(directDocs);
    if (directMatch?.email) return directMatch;
  }

  for (const identity of identities) {
    const user = await User.findOne({
      $or: [
        { username: identity },
        { displayName: new RegExp(`^${escapeRegExp(seed.rawText)}$`, "i") },
      ],
    }).lean();

    if (!user?.username) continue;

    const integrations = await Integration.find({
      type: { $in: CALENDAR_IDENTITY_TYPES },
      enabled: true,
      userId: user.username,
    }).lean();

    const integrationMatch = pickPreferredIntegrationEmail(integrations);
    if (integrationMatch?.email) {
      return {
        ...integrationMatch,
        userId: user.username,
        displayName:
          integrationMatch.displayName || normalizeSpacing(user.displayName || ""),
      };
    }
  }

  return null;
}

function buildDisplayName(seed, resolvedMatch, email) {
  const seedDisplayName = normalizeSpacing(seed.displayName);
  const resolvedDisplayName = normalizeSpacing(resolvedMatch?.displayName || "");
  const seedLooksLikeIdentifier =
    seedDisplayName &&
    seed.rawText &&
    normalizeIdentity(seedDisplayName) === normalizeIdentity(seed.rawText);

  if (resolvedDisplayName && (seedLooksLikeIdentifier || !seedDisplayName)) {
    return resolvedDisplayName;
  }

  return seedDisplayName || resolvedDisplayName || (email ? email.split("@")[0] : "");
}

async function resolveCalendarAttendees(attendees = [], options = {}) {
  const {
    resolveIdentity = resolveIdentityFromDirectory,
    selfEmail = "",
  } = options;

  const normalizedSelfEmail = extractEmailAddress(selfEmail);
  const attendeeMap = new Map();
  const unresolved = [];
  const resolvedUserIds = new Set();

  for (const attendee of attendees || []) {
    const seed = buildAttendeeSeed(attendee);
    if (!seed.rawText && !seed.directEmail) continue;

    let resolvedMatch = null;
    let email = seed.directEmail;

    if (!email && seed.identities.length) {
      resolvedMatch = await resolveIdentity(seed);
      email = extractEmailAddress(resolvedMatch?.email || "");
    }

    if (!email) {
      unresolved.push(seed.displayName || seed.rawText);
      continue;
    }

    if (normalizedSelfEmail && email === normalizedSelfEmail) {
      continue;
    }

    const key = email.toLowerCase();
    if (attendeeMap.has(key)) continue;

    const displayName = buildDisplayName(seed, resolvedMatch, email);
    attendeeMap.set(key, {
      email,
      ...(displayName ? { displayName } : {}),
    });

    if (resolvedMatch?.userId) {
      resolvedUserIds.add(resolvedMatch.userId);
    }
  }

  return {
    attendees: [...attendeeMap.values()],
    unresolved: Array.from(new Set(unresolved.filter(Boolean))),
    resolvedUserIds: [...resolvedUserIds],
  };
}

module.exports = {
  resolveCalendarAttendees,
  __test: {
    buildAttendeeSeed,
    extractEmailAddress,
    normalizeIdentity,
  },
};
