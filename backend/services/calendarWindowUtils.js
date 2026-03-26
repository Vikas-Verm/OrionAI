"use strict";

const APP_TIMEZONE = "Asia/Kolkata";
const APP_TIMEZONE_OFFSET = "+05:30";

function pad(value) {
  return String(value).padStart(2, "0");
}

function getTimezoneDateKey(date = new Date(), timeZone = APP_TIMEZONE) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  return `${year}-${month}-${day}`;
}

function buildOffsetIso(dateKey, time) {
  return new Date(`${dateKey}T${time}${APP_TIMEZONE_OFFSET}`).toISOString();
}

function buildKolkataDayBounds(date = new Date()) {
  const dateKey = getTimezoneDateKey(date);
  return {
    dateKey,
    timeMin: buildOffsetIso(dateKey, "00:00:00"),
    timeMax: buildOffsetIso(dateKey, "23:59:59.999"),
  };
}

function buildKolkataMonthBounds(year, month) {
  const monthKey = `${year}-${pad(month)}`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const lastDayKey = `${monthKey}-${pad(lastDay)}`;

  return {
    timeMin: buildOffsetIso(`${monthKey}-01`, "00:00:00"),
    timeMax: buildOffsetIso(lastDayKey, "23:59:59.999"),
  };
}

module.exports = {
  APP_TIMEZONE,
  APP_TIMEZONE_OFFSET,
  getTimezoneDateKey,
  buildKolkataDayBounds,
  buildKolkataMonthBounds,
};
