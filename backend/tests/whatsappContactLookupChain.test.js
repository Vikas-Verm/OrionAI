"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  __test: { buildWhatsAppBridgeContactMap },
} = require("../services/whatsappMatrixService");

function makeContact(overrides = {}) {
  return {
    contactJid: "919870291255@s.whatsapp.net",
    canonicalContactJid: "919870291255@s.whatsapp.net",
    roomId: "!room1:orion.local",
    contactId: "919870291255",
    ghostId: "919870291255",
    phoneNumber: "+919870291255",
    fullName: "Pat Lee",
    title: "Pat Lee",
    name: "Pat Lee",
    ...overrides,
  };
}

test("buildWhatsAppBridgeContactMap indexes by contactJid, roomId, contactId, ghostId, and phone digits", () => {
  const map = buildWhatsAppBridgeContactMap([makeContact()]);

  // Existing keys.
  assert.equal(
    map.get("919870291255@s.whatsapp.net")?.fullName,
    "Pat Lee"
  );
  assert.equal(map.get("!room1:orion.local")?.fullName, "Pat Lee");

  // New keys added so a room descriptor that only has the WhatsApp ghost
  // mxid (e.g. @whatsapp_919870291255:...) can still resolve a name.
  assert.equal(map.get("919870291255")?.fullName, "Pat Lee", "by contactId");
  assert.equal(
    map.get("919870291255")?.fullName,
    "Pat Lee",
    "by ghostId equals contactId here, same hit"
  );
});

test("buildWhatsAppBridgeContactMap indexes by phone digits even when phoneNumber has a + prefix and spaces", () => {
  const map = buildWhatsAppBridgeContactMap([
    makeContact({ phoneNumber: "+91 98 70 29 12 55" }),
  ]);
  assert.equal(map.get("919870291255")?.fullName, "Pat Lee");
});

test("buildWhatsAppBridgeContactMap dedupes when contactId === ghostId without overwriting with stale data", () => {
  const map = buildWhatsAppBridgeContactMap([
    makeContact({ contactId: "x1", ghostId: "x1" }),
  ]);
  assert.equal(map.get("x1")?.fullName, "Pat Lee");
});

test("buildWhatsAppBridgeContactMap keeps separate entries for distinct contacts", () => {
  const a = makeContact({
    contactJid: "1@s.whatsapp.net",
    canonicalContactJid: "1@s.whatsapp.net",
    contactId: "1",
    ghostId: "1",
    phoneNumber: "+1",
    fullName: "Alice",
    title: "Alice",
    roomId: "!a:orion.local",
  });
  const b = makeContact({
    contactJid: "2@s.whatsapp.net",
    canonicalContactJid: "2@s.whatsapp.net",
    contactId: "2",
    ghostId: "2",
    phoneNumber: "+2",
    fullName: "Bob",
    title: "Bob",
    roomId: "!b:orion.local",
  });
  const map = buildWhatsAppBridgeContactMap([a, b]);
  assert.equal(map.get("1")?.fullName, "Alice");
  assert.equal(map.get("2")?.fullName, "Bob");
  assert.equal(map.get("!a:orion.local")?.fullName, "Alice");
  assert.equal(map.get("!b:orion.local")?.fullName, "Bob");
});
