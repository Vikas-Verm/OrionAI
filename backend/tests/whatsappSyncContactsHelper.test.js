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
