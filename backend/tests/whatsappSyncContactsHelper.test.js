"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const whatsappService = require("../services/whatsappMatrixService");

test("whatsappMatrixService exports syncWhatsAppContacts as a function", () => {
  assert.equal(typeof whatsappService.syncWhatsAppContacts, "function");
});

test("syncWhatsAppContacts is distinct from sendBridgeCommand (they are not the same function reference)", () => {
  // sendBridgeCommand is the generic primitive; syncWhatsAppContacts is the
  // higher-level "sync contacts" call that also invalidates our cache.
  assert.notStrictEqual(
    whatsappService.syncWhatsAppContacts,
    whatsappService.sendBridgeCommand
  );
});

test("bridge commands use the active WhatsApp command prefix exactly once", () => {
  assert.equal(
    whatsappService.__test.formatWhatsAppBridgeCommand("sync contacts-with-avatars"),
    "!whatsapp sync contacts-with-avatars"
  );
  assert.equal(
    whatsappService.__test.formatWhatsAppBridgeCommand("!whatsapp help"),
    "!whatsapp help"
  );
});
