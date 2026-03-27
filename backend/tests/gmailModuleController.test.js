"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  __test: { threadToEmail, messageToFull, mapThreadMessages, extractEmailAddress },
} = require("../controllers/gmailModuleController");

function headers(values) {
  return Object.entries(values).map(([name, value]) => ({ name, value }));
}

test("extractEmailAddress pulls normalized mailbox from Gmail headers", () => {
  assert.equal(
    extractEmailAddress('Vikas Verma <vikasverma@poshn.co>'),
    "vikasverma@poshn.co"
  );
  assert.equal(extractEmailAddress("vikashverma209200@gmail.com"), "vikashverma209200@gmail.com");
});

test("mapThreadMessages returns a full Gmail conversation in chronological order with direction", () => {
  const thread = {
    id: "thread-123",
    snippet: "I'll review INV-45656 and process the payment approval.",
    messages: [
      {
        id: "msg-2",
        threadId: "thread-123",
        internalDate: "1710000900000",
        labelIds: ["INBOX", "UNREAD"],
        snippet: "I'll review INV-45656 and process the payment approval.",
        payload: {
          headers: headers({
            From: "Vikash Verma <vikashverma209200@gmail.com>",
            To: "Vikas Verma <vikasverma@poshn.co>",
            Subject: "Urgent Payment Approval",
            Date: "Mon, 10 Mar 2025 10:15:00 +0530",
          }),
          body: {
            data: Buffer.from(
              "Hi Vikas,\n\nI'll review INV-45656 and process the payment approval as soon as possible.",
              "utf8"
            ).toString("base64url"),
          },
        },
      },
      {
        id: "msg-1",
        threadId: "thread-123",
        internalDate: "1710000000000",
        labelIds: ["SENT"],
        snippet: "Hii Sir, Pls Approve payment for this Invoice INV-45656",
        payload: {
          headers: headers({
            From: "Vikas Verma <vikasverma@poshn.co>",
            To: "Vikash Verma <vikashverma209200@gmail.com>",
            Subject: "Urgent Payment Approval",
            Date: "Mon, 10 Mar 2025 10:00:00 +0530",
          }),
          body: {
            data: Buffer.from(
              "Hii Sir, Pls Approve payment for this Invoice INV-45656",
              "utf8"
            ).toString("base64url"),
          },
        },
      },
    ],
  };

  const messages = mapThreadMessages(thread, "vikasverma@poshn.co");

  assert.equal(messages.length, 2);
  assert.equal(messages[0].id, "msg-1");
  assert.equal(messages[0].direction, "outbound");
  assert.equal(messages[0].isSelf, true);
  assert.equal(messages[1].id, "msg-2");
  assert.equal(messages[1].direction, "inbound");
  assert.equal(messages[1].isSelf, false);

  const summary = threadToEmail(thread, "vikasverma@poshn.co");
  assert.equal(summary.threadId, "thread-123");
  assert.equal(summary.latestMessageId, "msg-2");
  assert.equal(summary.from, "Vikash Verma <vikashverma209200@gmail.com>");
  assert.equal(summary.latestDirection, "inbound");
});

test("messageToFull falls back to snippet when plain text body is unavailable", () => {
  const message = {
    id: "msg-9",
    threadId: "thread-9",
    internalDate: "1710000000000",
    labelIds: ["INBOX"],
    snippet: "Plain snippet fallback",
    payload: {
      headers: headers({
        From: "Ops <ops@example.com>",
        To: "me@example.com",
        Subject: "Status",
        Date: "Mon, 10 Mar 2025 11:00:00 +0530",
      }),
      body: {},
    },
  };

  const mapped = messageToFull(message, "me@example.com");
  assert.equal(mapped.body, "Plain snippet fallback");
  assert.equal(mapped.direction, "inbound");
});
