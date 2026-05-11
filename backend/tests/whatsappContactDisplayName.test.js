"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  __test: {
    pickWhatsAppDisplayName,
    looksLikePhoneNumberTitle,
    mergeRoomWithBridgeContactMetadata,
  },
} = require("../services/whatsappMatrixService");

test("looksLikePhoneNumberTitle matches phone-shaped strings and rejects real names", () => {
  assert.equal(looksLikePhoneNumberTitle("+91 98 70 29 12 55"), true);
  assert.equal(looksLikePhoneNumberTitle("919870291255"), true);
  assert.equal(looksLikePhoneNumberTitle("+1-555-0100"), true);
  assert.equal(looksLikePhoneNumberTitle("(555) 010-0001"), true);
  assert.equal(looksLikePhoneNumberTitle("Pat Lee"), false);
  assert.equal(looksLikePhoneNumberTitle("Ops Team"), false);
  assert.equal(looksLikePhoneNumberTitle(""), false);
});

test("pickWhatsAppDisplayName prefers the address-book full_name over a phone-shaped room title", () => {
  const result = pickWhatsAppDisplayName(
    {
      fullName: "Pat Lee",
      pushName: "Pat",
      ghostName: "+91 98 70 29 12 55",
      title: "+91 98 70 29 12 55",
      name: "+91 98 70 29 12 55",
    },
    "+91 98 70 29 12 55"
  );
  assert.equal(result, "Pat Lee");
});

test("pickWhatsAppDisplayName prefers business_name when full_name is empty", () => {
  const result = pickWhatsAppDisplayName(
    { fullName: "", businessName: "Acme Corp", pushName: "Acme rep" },
    "+1-555-0100"
  );
  assert.equal(result, "Acme Corp");
});

test("pickWhatsAppDisplayName keeps an existing real-looking room title when bridge contact has no address-book name", () => {
  const result = pickWhatsAppDisplayName(
    { fullName: "", businessName: "", pushName: "Pat" },
    "Project Alpha"
  );
  assert.equal(result, "Project Alpha");
});

test("pickWhatsAppDisplayName falls back to push_name when full/business are empty AND room title is a phone", () => {
  const result = pickWhatsAppDisplayName(
    { fullName: "", businessName: "", pushName: "Pat" },
    "+1-555-0100"
  );
  assert.equal(result, "Pat");
});

test("pickWhatsAppDisplayName falls back to ghost name when push_name is also empty", () => {
  const result = pickWhatsAppDisplayName(
    { fullName: "", businessName: "", pushName: "", ghostName: "Pat L" },
    "+1-555-0100"
  );
  assert.equal(result, "Pat L");
});

test("mergeRoomWithBridgeContactMetadata replaces a phone-shaped room title with the address-book name", () => {
  const room = {
    roomId: "!room:orion.local",
    title: "+91 98 70 29 12 55",
    name: "+91 98 70 29 12 55",
  };
  const merged = mergeRoomWithBridgeContactMetadata(room, {
    fullName: "Pat Lee",
    pushName: "Pat",
    title: "Pat Lee",
    name: "Pat Lee",
    phoneNumber: "+919870291255",
  });
  assert.equal(merged.title, "Pat Lee");
  assert.equal(merged.name, "Pat Lee");
  assert.equal(merged.fullName, "Pat Lee");
});

test("mergeRoomWithBridgeContactMetadata picks the bridge avatar when the room has none", () => {
  const room = {
    roomId: "!room:orion.local",
    title: "Pat Lee",
    avatarMxc: null,
    avatarUrl: "",
  };
  const merged = mergeRoomWithBridgeContactMetadata(room, {
    fullName: "Pat Lee",
    title: "Pat Lee",
    name: "Pat Lee",
    avatarMxc: "mxc://orion.local/abc123",
  });
  assert.equal(merged.avatarMxc, "mxc://orion.local/abc123");
});

test("mergeRoomWithBridgeContactMetadata keeps a real human-named room title even if bridge contact only knows a push name", () => {
  const room = {
    roomId: "!room:orion.local",
    title: "Pat Lee",
    name: "Pat Lee",
  };
  const merged = mergeRoomWithBridgeContactMetadata(room, {
    fullName: "",
    pushName: "Patty",
    phoneNumber: "+919870291255",
  });
  // Existing real name wins over a less authoritative push name.
  assert.equal(merged.title, "Pat Lee");
});
