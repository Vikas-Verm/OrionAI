"use strict";

/**
 * timeRangeParser.js
 *
 * Deterministic time range extraction from natural language.
 * Zero LLM involvement. Produces ISO 8601 timestamps for pipeline use.
 *
 * Handles:
 *   - last N hours / last N days / last N weeks / last N months
 *   - today / yesterday / tomorrow
 *   - this week / last week / this month / last month / this year / last year
 *   - in/created/updated/before/after [date expression]
 */

// ─── Date utilities ───────────────────────────────────────────────────────────

function startOfDay(d) {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

function startOfWeek(d) {
  const r = startOfDay(d);
  const day = r.getDay();
  r.setDate(r.getDate() - (day === 0 ? 6 : day - 1));
  return r;
}

function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}

function startOfYear(d) {
  return new Date(d.getFullYear(), 0, 1, 0, 0, 0, 0);
}

function addDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function addHours(d, n) {
  return new Date(d.getTime() + n * 3600000);
}

function addMonths(d, n) {
  return new Date(
    d.getFullYear(),
    d.getMonth() + n,
    d.getDate(),
    d.getHours(),
    d.getMinutes(),
    d.getSeconds()
  );
}

function toISO(d) {
  return d instanceof Date ? d.toISOString() : String(d);
}

// ─── Parser ───────────────────────────────────────────────────────────────────

/**
 * @param {string} question   Raw question text
 * @param {Date}   [now]      Override current time (for testing)
 * @returns {{ kind, precision, start_iso, end_iso, role_hint, hours?, days? } | null}
 */
function parseTimeRange(question = "", now = new Date()) {
  const q = String(question || "").toLowerCase();
  const current = now instanceof Date ? now : new Date(now);
  const today = startOfDay(current);

  // ── last N hours ──────────────────────────────────────────────────────────
  const hourMatch = q.match(/\b(last|past)\s+(\d+)\s*(hours?|hrs?|hr|h)\b/);
  if (hourMatch) {
    const h = Math.max(1, Number(hourMatch[2]));
    const start = addHours(current, -h);
    return {
      kind: "last_hours",
      precision: "time",
      hours: h,
      start_iso: toISO(start),
      end_iso: toISO(current),
      role_hint: "any",
    };
  }

  // ── last N days ────────────────────────────────────────────────────────────
  const dayMatch = q.match(/\b(last|past)\s+(\d+)\s+days?\b/);
  if (dayMatch) {
    const d = Math.max(1, Number(dayMatch[2]));
    const start = startOfDay(addDays(today, -(d - 1)));
    const end = addDays(today, 1);
    return {
      kind: "last_days",
      precision: "date",
      days: d,
      start_iso: toISO(start),
      end_iso: toISO(end),
      role_hint: "any",
    };
  }

  // ── last N weeks ───────────────────────────────────────────────────────────
  const weekNMatch = q.match(/\b(last|past)\s+(\d+)\s+weeks?\b/);
  if (weekNMatch) {
    const w = Math.max(1, Number(weekNMatch[2]));
    const start = startOfDay(addDays(today, -(w * 7)));
    const end = addDays(today, 1);
    return {
      kind: "last_weeks",
      precision: "date",
      days: w * 7,
      start_iso: toISO(start),
      end_iso: toISO(end),
      role_hint: "any",
    };
  }

  // ── last N months ──────────────────────────────────────────────────────────
  const monthNMatch = q.match(/\b(last|past)\s+(\d+)\s+months?\b/);
  if (monthNMatch) {
    const m = Math.max(1, Number(monthNMatch[2]));
    const start = startOfDay(addMonths(today, -m));
    const end = addDays(today, 1);
    return {
      kind: "last_months",
      precision: "date",
      months: m,
      start_iso: toISO(start),
      end_iso: toISO(end),
      role_hint: "any",
    };
  }

  // ── today ──────────────────────────────────────────────────────────────────
  if (/\btoday\b/.test(q)) {
    return {
      kind: "today",
      precision: "date",
      start_iso: toISO(today),
      end_iso: toISO(addDays(today, 1)),
      role_hint: "any",
    };
  }

  // ── yesterday ─────────────────────────────────────────────────────────────
  if (/\byesterday\b/.test(q)) {
    const start = addDays(today, -1);
    return {
      kind: "yesterday",
      precision: "date",
      start_iso: toISO(start),
      end_iso: toISO(today),
      role_hint: "any",
    };
  }

  // ── this week ─────────────────────────────────────────────────────────────
  if (/\b(this|current)\s+week\b/.test(q)) {
    const start = startOfWeek(today);
    const end = addDays(start, 7);
    return {
      kind: "this_week",
      precision: "date",
      start_iso: toISO(start),
      end_iso: toISO(end),
      role_hint: "any",
    };
  }

  // ── last week ─────────────────────────────────────────────────────────────
  if (/\blast\s+week\b/.test(q)) {
    const thisWeekStart = startOfWeek(today);
    const start = addDays(thisWeekStart, -7);
    const end = thisWeekStart;
    return {
      kind: "last_week",
      precision: "date",
      start_iso: toISO(start),
      end_iso: toISO(end),
      role_hint: "any",
    };
  }

  // ── this month ────────────────────────────────────────────────────────────
  if (/\b(this|current)\s+month\b/.test(q)) {
    const start = startOfMonth(today);
    const end = addMonths(start, 1);
    return {
      kind: "this_month",
      precision: "date",
      start_iso: toISO(start),
      end_iso: toISO(end),
      role_hint: "any",
    };
  }

  // ── last month ────────────────────────────────────────────────────────────
  if (/\blast\s+month\b/.test(q)) {
    const thisMonth = startOfMonth(today);
    const start = addMonths(thisMonth, -1);
    return {
      kind: "last_month",
      precision: "date",
      start_iso: toISO(start),
      end_iso: toISO(thisMonth),
      role_hint: "any",
    };
  }

  // ── this year ─────────────────────────────────────────────────────────────
  if (/\b(this|current)\s+year\b/.test(q)) {
    const start = startOfYear(today);
    const end = new Date(today.getFullYear() + 1, 0, 1);
    return {
      kind: "this_year",
      precision: "date",
      start_iso: toISO(start),
      end_iso: toISO(end),
      role_hint: "any",
    };
  }

  // ── last year ─────────────────────────────────────────────────────────────
  if (/\blast\s+year\b/.test(q)) {
    const start = new Date(today.getFullYear() - 1, 0, 1);
    const end = startOfYear(today);
    return {
      kind: "last_year",
      precision: "date",
      start_iso: toISO(start),
      end_iso: toISO(end),
      role_hint: "any",
    };
  }

  // ── No match ──────────────────────────────────────────────────────────────
  return null;
}

/**
 * Given a time range result, describe it in a human-readable string.
 */
function describeTimeRange(range) {
  if (!range) return "";
  switch (range.kind) {
    case "last_hours":
      return `the last ${range.hours} hour${range.hours === 1 ? "" : "s"}`;
    case "last_days":
      return `the last ${range.days} day${range.days === 1 ? "" : "s"}`;
    case "last_weeks":
      return `the last ${range.days / 7} week${range.days === 7 ? "" : "s"}`;
    case "last_months":
      return `the last ${range.months} month${range.months === 1 ? "" : "s"}`;
    case "today":
      return "today";
    case "yesterday":
      return "yesterday";
    case "this_week":
      return "this week";
    case "last_week":
      return "last week";
    case "this_month":
      return "this month";
    case "last_month":
      return "last month";
    case "this_year":
      return "this year";
    case "last_year":
      return "last year";
    default:
      return range.kind;
  }
}

/**
 * Compare windows for "compare this month vs last month" type queries.
 * Returns [{label, kind, start_iso, end_iso}] or null.
 */
function parseCompareWindows(question = "", now = new Date()) {
  const q = String(question || "").toLowerCase();
  const current = now instanceof Date ? now : new Date(now);
  const today = startOfDay(current);

  // "compare this month vs last month" / "this month vs last month"
  if (
    /\bthis\s+month\b.*\b(vs|versus|compared?( to)?|against)\b.*\blast\s+month\b/i.test(
      q
    ) ||
    /\blast\s+month\b.*\b(vs|versus|compared?( to)?|against)\b.*\bthis\s+month\b/i.test(
      q
    )
  ) {
    const thisStart = startOfMonth(today);
    const lastStart = addMonths(thisStart, -1);
    return [
      {
        label: "this_month",
        kind: "this_month",
        start_iso: toISO(thisStart),
        end_iso: toISO(addMonths(thisStart, 1)),
      },
      {
        label: "last_month",
        kind: "last_month",
        start_iso: toISO(lastStart),
        end_iso: toISO(thisStart),
      },
    ];
  }

  // "compare this week vs last week"
  if (
    /\bthis\s+week\b.*\b(vs|versus)\b.*\blast\s+week\b/i.test(q) ||
    /\blast\s+week\b.*\b(vs|versus)\b.*\bthis\s+week\b/i.test(q)
  ) {
    const thisStart = startOfWeek(today);
    const lastStart = addDays(thisStart, -7);
    return [
      {
        label: "this_week",
        kind: "this_week",
        start_iso: toISO(thisStart),
        end_iso: toISO(addDays(thisStart, 7)),
      },
      {
        label: "last_week",
        kind: "last_week",
        start_iso: toISO(lastStart),
        end_iso: toISO(thisStart),
      },
    ];
  }

  // "compare this year vs last year"
  if (
    /\bthis\s+year\b.*\b(vs|versus)\b.*\blast\s+year\b/i.test(q) ||
    /\blast\s+year\b.*\b(vs|versus)\b.*\bthis\s+year\b/i.test(q)
  ) {
    const thisStart = startOfYear(today);
    const lastStart = new Date(today.getFullYear() - 1, 0, 1);
    return [
      {
        label: "this_year",
        kind: "this_year",
        start_iso: toISO(thisStart),
        end_iso: toISO(new Date(today.getFullYear() + 1, 0, 1)),
      },
      {
        label: "last_year",
        kind: "last_year",
        start_iso: toISO(lastStart),
        end_iso: toISO(thisStart),
      },
    ];
  }

  return null;
}

module.exports = { parseTimeRange, describeTimeRange, parseCompareWindows };
