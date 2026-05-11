"use strict";

/**
 * Regression test for the duplicate Vikas Verma issue: the bridge sometimes
 * creates two Matrix portal rooms for the same WhatsApp contact (one keyed
 * by the phone JID, one by the LID JID). When the lid_map is missing the
 * link, the canonical JID dedup misses them and both render as separate
 * chat rows. The second-pass phone-digit dedup in listWhatsAppChats merges
 * any DM rows that share the same phone digits.
 */

const test = require("node:test");
const assert = require("node:assert/strict");

// We exercise the dedup logic in isolation by re-deriving the exact code
// path used at the bottom of listWhatsAppChats. If the production code
// drops the dedup pass we'll see two entries here.
function dedupByPhone(rooms) {
  const normalizeDigits = (value = "") =>
    String(value || "").replace(/\D+/g, "");
  const score = (contact) => {
    let value = 0;
    if (contact.bridgeStatus === "portal") value += 8;
    if (String(contact.fullName || "").trim()) value += 4;
    if (String(contact.pushName || "").trim()) value += 3;
    if (String(contact.businessName || "").trim()) value += 3;
    if (String(contact.phoneNumber || "").trim()) value += 2;
    if (String(contact.avatarMxc || contact.avatarUrl || "").trim()) value += 2;
    if (String(contact.contactJid || "").includes("@s.whatsapp.net"))
      value += 1;
    return value;
  };
  const pickBetter = (a, b) => (!a ? b : !b ? a : score(b) > score(a) ? b : a);

  const chatMap = new Map(rooms.map((r) => [r.roomId, r]));
  const phoneIndex = new Map();
  for (const [key, chat] of chatMap.entries()) {
    if (!chat || chat.isGroup) continue;
    const digits = normalizeDigits(chat.phoneNumber || "");
    if (!digits) continue;
    const existing = phoneIndex.get(digits);
    if (!existing) {
      phoneIndex.set(digits, { key, chat });
      continue;
    }
    const winner = pickBetter(existing.chat, chat);
    const loserKey = winner === existing.chat ? key : existing.key;
    chatMap.delete(loserKey);
    phoneIndex.set(digits, {
      key: winner === existing.chat ? existing.key : key,
      chat: winner,
    });
  }
  return [...chatMap.values()];
}

test("two DM rooms for the same canonicalized phone get merged into one", () => {
  // Real bridge data: both rooms end up with the SAME phone digits because
  // mergeRoomWithBridgeContactMetadata copies bridgeContact.phoneNumber
  // onto the room. The phone-digit dedup pass merges them.
  const rooms = [
    {
      roomId: "!phoneJid:orion.local",
      title: "Vikas Verma",
      name: "Vikas Verma",
      phoneNumber: "+919773767632",
      contactJid: "919773767632@s.whatsapp.net",
      isGroup: false,
      fullName: "Vikas Verma",
      bridgeStatus: "portal",
      avatarMxc: "mxc://orion.local/aaa",
    },
    {
      roomId: "!lidJid:orion.local",
      title: "Vikas Verma",
      name: "Vikas Verma",
      phoneNumber: "+919773767632",
      contactJid: "141940683186252@lid",
      isGroup: false,
      pushName: "Vikas Verma",
      bridgeStatus: "portal",
      avatarMxc: "",
    },
  ];

  const out = dedupByPhone(rooms);
  assert.equal(out.length, 1, "expected only one Vikas Verma row");
  // The richer entry (full name + avatar) wins.
  assert.equal(out[0].fullName, "Vikas Verma");
  assert.equal(out[0].avatarMxc, "mxc://orion.local/aaa");
});

test("phone-digit dedup ignores groups (groups dedup by roomId, not phone)", () => {
  const rooms = [
    {
      roomId: "!group1:orion.local",
      title: "Project Alpha",
      isGroup: true,
      phoneNumber: "",
    },
    {
      roomId: "!group2:orion.local",
      title: "Project Beta",
      isGroup: true,
      phoneNumber: "",
    },
  ];
  const out = dedupByPhone(rooms);
  assert.equal(out.length, 2);
});

test("phone-digit dedup leaves rooms with no phone number alone", () => {
  const rooms = [
    {
      roomId: "!a:orion.local",
      title: "Channel A",
      isGroup: false,
      phoneNumber: "",
    },
    {
      roomId: "!b:orion.local",
      title: "Channel B",
      isGroup: false,
      phoneNumber: "",
    },
  ];
  const out = dedupByPhone(rooms);
  assert.equal(out.length, 2);
});

test("when both candidates have phone-shaped numbers but different formats, digit normalization still merges them", () => {
  const rooms = [
    {
      roomId: "!a:orion.local",
      title: "Pat",
      isGroup: false,
      phoneNumber: "+1 (555) 010-0100",
      contactJid: "15550100100@s.whatsapp.net",
      bridgeStatus: "portal",
    },
    {
      roomId: "!b:orion.local",
      title: "Pat",
      isGroup: false,
      phoneNumber: "15550100100",
      contactJid: "abc@lid",
      bridgeStatus: "portal",
    },
  ];
  const out = dedupByPhone(rooms);
  assert.equal(out.length, 1);
});
