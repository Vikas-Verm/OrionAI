"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  __test: filters,
} = require("../services/agentMessageFilterService");

test("buildGmailInboxQuery excludes bulk categories by default", () => {
  assert.equal(
    filters.buildGmailInboxQuery({ unreadOnly: true }),
    "is:unread in:inbox -category:promotions -category:social -category:updates -category:forums"
  );
  assert.equal(
    filters.buildGmailInboxQuery({ unreadOnly: false, includeBulk: true }),
    "in:inbox"
  );
});

test("looksLikeBulkGmailEmail detects promotional and newsletter traffic", () => {
  assert.equal(
    filters.looksLikeBulkGmailEmail({
      subject: "Weekend discount inside",
      from: "deals@example.com",
      labelIds: ["CATEGORY_PROMOTIONS"],
    }),
    true
  );

  assert.equal(
    filters.looksLikeBulkGmailEmail({
      subject: "Need approval on vendor bill",
      from: "rahul@example.com",
      snippet: "Can you review this today?",
      labelIds: ["INBOX", "UNREAD"],
    }),
    false
  );
});

test("filterTelegramDialogs prefers direct chats and excludes groups by default", () => {
  const dialogs = [
    { id: "1", name: "Engg Group", type: "group", unreadCount: 8, lastDate: "2026-03-29T10:00:00.000Z" },
    { id: "2", name: "Rahul", type: "user", unreadCount: 1, lastDate: "2026-03-29T09:00:00.000Z" },
    { id: "3", name: "Broadcast", type: "channel", unreadCount: 12, lastDate: "2026-03-29T11:00:00.000Z" },
  ];

  const filtered = filters.filterTelegramDialogs(dialogs);
  assert.deepEqual(filtered.map((dialog) => dialog.name), ["Rahul"]);

  const withGroups = filters.filterTelegramDialogs(dialogs, { includeGroups: true });
  assert.equal(withGroups[0].name, "Rahul");
  assert.equal(withGroups.length, 3);
});

test("filterWhatsAppChats excludes group and broadcast noise by default", () => {
  const chats = [
    { name: "Family Group", isGroup: true, isReadOnly: false, unreadCount: 9, timestamp: 3 },
    { name: "Broadcast List", isGroup: false, isReadOnly: true, unreadCount: 4, timestamp: 4 },
    { name: "Anshul", isGroup: false, isReadOnly: false, unreadCount: 2, timestamp: 2 },
  ];

  const filtered = filters.filterWhatsAppChats(chats, { requireUnread: true });
  assert.deepEqual(filtered.map((chat) => chat.name), ["Anshul"]);

  const withGroups = filters.filterWhatsAppChats(chats, {
    includeGroups: true,
    includeBroadcasts: true,
    requireUnread: true,
  });
  assert.equal(withGroups[0].name, "Anshul");
  assert.equal(withGroups.length, 3);
});
