"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  __test: {
    looksLikeRawMatrixRoomId,
    isUsableTitle,
    pickWhatsAppDisplayName,
    mergeRoomWithBridgeContactMetadata,
  },
} = require("../services/whatsappMatrixService");

test("looksLikeRawMatrixRoomId matches Matrix room id format and rejects everything else", () => {
  assert.equal(
    looksLikeRawMatrixRoomId("!aliCGcdQakhIGwyyDz:orion.local"),
    true
  );
  assert.equal(
    looksLikeRawMatrixRoomId("!xotIYfhMbWNuIAtdAy:matrix.example.com"),
    true
  );
  assert.equal(looksLikeRawMatrixRoomId("Pat Lee"), false);
  assert.equal(looksLikeRawMatrixRoomId("+91 98 70 29 12 55"), false);
  assert.equal(looksLikeRawMatrixRoomId(""), false);
  assert.equal(looksLikeRawMatrixRoomId(null), false);
  assert.equal(looksLikeRawMatrixRoomId("@whatsapp_123:orion.local"), false);
});

test("isUsableTitle rejects empty strings and raw matrix room ids", () => {
  assert.equal(isUsableTitle(""), false);
  assert.equal(isUsableTitle("   "), false);
  assert.equal(isUsableTitle("!abc:orion.local"), false);
  assert.equal(isUsableTitle("Pat Lee"), true);
  assert.equal(isUsableTitle("+1-555-0100"), true);
});

test("pickWhatsAppDisplayName never returns a raw matrix room id even as a last resort", () => {
  const result = pickWhatsAppDisplayName(
    {
      // Bridge contact has no useful labels.
      fullName: "",
      pushName: "",
      ghostName: "",
      title: "",
      name: "",
      phoneNumber: "",
    },
    "!aliCGcdQakhIGwyyDz:orion.local" // existing room title is a raw room id
  );
  // The function must NOT return the matrix room id; better empty than ugly.
  assert.notEqual(result, "!aliCGcdQakhIGwyyDz:orion.local");
  assert.doesNotMatch(String(result), /^!.+:.+$/);
});

test("pickWhatsAppDisplayName falls back to phone number when nothing else is available", () => {
  const result = pickWhatsAppDisplayName(
    { fullName: "", pushName: "", ghostName: "", phoneNumber: "+91 98 70 29 12 55" },
    "!some-room:orion.local"
  );
  assert.equal(result, "+91 98 70 29 12 55");
});

test("pickWhatsAppDisplayName prefers a real address-book name over a phone-shaped room title", () => {
  const result = pickWhatsAppDisplayName(
    { fullName: "Pat Lee", pushName: "Pat", phoneNumber: "+919870291255" },
    "+91 98 70 29 12 55"
  );
  assert.equal(result, "Pat Lee");
});

test("mergeRoomWithBridgeContactMetadata title cascade never produces a matrix room id", () => {
  const room = {
    roomId: "!aliCGcdQakhIGwyyDz:orion.local",
    title: "!aliCGcdQakhIGwyyDz:orion.local",
    name: "!aliCGcdQakhIGwyyDz:orion.local",
  };
  const merged = mergeRoomWithBridgeContactMetadata(room, {
    // Bridge contact has nothing useful — simulates an orphan portal.
    fullName: "",
    pushName: "",
    ghostName: "",
    phoneNumber: "",
    title: "",
    name: "",
  });
  // Title must NOT regress to the raw room id; final-stage filter will then
  // drop this row from the chat list.
  assert.doesNotMatch(String(merged.title || ""), /^!.+:.+$/);
  assert.doesNotMatch(String(merged.name || ""), /^!.+:.+$/);
});

test("mergeRoomWithBridgeContactMetadata picks the phone number when bridge contact only knows the phone", () => {
  const room = {
    roomId: "!aliCGcdQakhIGwyyDz:orion.local",
    title: "+1-555-0100",
    name: "+1-555-0100",
  };
  const merged = mergeRoomWithBridgeContactMetadata(room, {
    fullName: "",
    phoneNumber: "+1-555-0100",
  });
  assert.equal(merged.title, "+1-555-0100");
});
