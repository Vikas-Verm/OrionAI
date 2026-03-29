"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  __test: { extractMeetLink },
} = require("../services/tools/toolCalendar");

test("extractMeetLink falls back to hangoutLink when conference entry points are absent", () => {
  const link = extractMeetLink({
    hangoutLink: "https://meet.google.com/abc-defg-hij",
  });

  assert.equal(link, "https://meet.google.com/abc-defg-hij");
});

test("extractMeetLink finds a meet url inside event location text", () => {
  const link = extractMeetLink({
    location: "Join here: https://meet.google.com/gst-hand-off",
  });

  assert.equal(link, "https://meet.google.com/gst-hand-off");
});

test("extractMeetLink uses conference entry points even when video type is absent", () => {
  const link = extractMeetLink({
    conferenceData: {
      entryPoints: [
        {
          entryPointType: "more",
          uri: "https://meet.google.com/abc-defg-hij?hs=224",
        },
      ],
    },
  });

  assert.equal(link, "https://meet.google.com/abc-defg-hij?hs=224");
});

test("extractMeetLink falls back to conference id for Google Meet events", () => {
  const link = extractMeetLink({
    conferenceData: {
      conferenceId: "abc-defg-hij",
      conferenceSolution: {
        key: { type: "hangoutsMeet" },
      },
    },
  });

  assert.equal(link, "https://meet.google.com/abc-defg-hij");
});

test("extractMeetLink preserves query params when location contains a meet url", () => {
  const link = extractMeetLink({
    location:
      "Meeting room: https://meet.google.com/abc-defg-hij?authuser=0&hs=122",
  });

  assert.equal(
    link,
    "https://meet.google.com/abc-defg-hij?authuser=0&hs=122"
  );
});
