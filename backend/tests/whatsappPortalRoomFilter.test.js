"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  __test: { buildWhatsAppPortalRoom },
} = require("../services/whatsappMatrixService");

test("buildWhatsAppPortalRoom returns null for portal entries with no human-readable label or contact metadata", () => {
  // Bridge management / admin / unmatched-portal rooms come back from the
  // bridge snapshot with only a roomId. We must NOT surface them.
  const result = buildWhatsAppPortalRoom(
    { roomId: "!sMHjwPKXRhzKtsXrFC:orion.local" },
    null
  );
  assert.equal(result, null);
});

test("buildWhatsAppPortalRoom keeps a portal entry that carries a contact name", () => {
  const result = buildWhatsAppPortalRoom(
    { roomId: "!real:orion.local", title: "Pat Lee" },
    null
  );
  assert.ok(result, "expected a real chat to survive");
  assert.equal(result.title, "Pat Lee");
  assert.equal(result.name, "Pat Lee");
});

test("buildWhatsAppPortalRoom keeps a portal entry that has a phone number even without a title", () => {
  const result = buildWhatsAppPortalRoom(
    { roomId: "!real:orion.local" },
    { phoneNumber: "+1-555-0100" }
  );
  assert.ok(result, "phoneNumber alone should be enough to surface a real chat");
  assert.notEqual(
    result.title,
    "!real:orion.local",
    "title must never fall back to the raw matrix room id"
  );
});

test("buildWhatsAppPortalRoom keeps a portal entry that has bridge contact JID metadata", () => {
  const result = buildWhatsAppPortalRoom(
    { roomId: "!real:orion.local" },
    { contactJid: "1234@s.whatsapp.net", canonicalContactJid: "1234@s.whatsapp.net" }
  );
  assert.ok(result, "contactJid alone should be enough to surface a real chat");
});
