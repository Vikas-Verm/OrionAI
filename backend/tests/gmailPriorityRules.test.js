"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { classifyPriorityThread } = require("../services/gmailPriorityRules");

function headers(values) {
  return Object.entries(values).map(([name, value]) => ({ name, value }));
}

test("classifies a leave request email as notification-worthy Gmail attention", () => {
  const thread = {
    id: "thread-leave",
    snippet: "I am writing this email pls grant my leave for tomorrow",
    messages: [
      {
        id: "msg-leave",
        internalDate: String(Date.now() - 15 * 60 * 1000),
        labelIds: ["INBOX", "UNREAD"],
        payload: {
          headers: headers({
            From: "Amit Sharma <amit@company.com>",
            To: "manager@company.com",
            Subject: "Leave apply",
            Date: new Date(Date.now() - 15 * 60 * 1000).toUTCString(),
          }),
        },
      },
    ],
  };

  const classified = classifyPriorityThread(thread, "manager@company.com");

  assert.ok(classified);
  assert.equal(classified.subject, "Leave apply");
  assert.equal(classified.unread, true);
  assert.match(classified.whyThisMatters, /approve leave|reply/i);
});
