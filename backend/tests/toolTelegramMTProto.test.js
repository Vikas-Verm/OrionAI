"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  __test: {
    isInvalidSessionError,
    createReconnectRequiredError,
    createPendingAuthToken,
    readPendingAuthToken,
    toTelegramIso,
  },
} = require("../services/tools/toolTelegramMTProto");

test("isInvalidSessionError detects Telegram auth-key invalidation", () => {
  assert.equal(
    isInvalidSessionError({ errorMessage: "AUTH_KEY_UNREGISTERED" }),
    true
  );
  assert.equal(
    isInvalidSessionError({ message: "401: SESSION_REVOKED" }),
    true
  );
  assert.equal(isInvalidSessionError({ message: "Not connected" }), false);
});

test("createReconnectRequiredError normalizes the reconnect response", () => {
  const error = createReconnectRequiredError({
    errorMessage: "AUTH_KEY_UNREGISTERED",
  });

  assert.equal(error.message, "Telegram session expired. Please reconnect.");
  assert.equal(error.code, 401);
  assert.equal(error.requiresReconnect, true);
  assert.equal(error.errorMessage, "AUTH_KEY_UNREGISTERED");
});

test("pending auth token round-trips phone and hash for the same user", () => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "test-secret";

  try {
    const token = createPendingAuthToken("vikash", "+911234567890", "hash123");
    const decoded = readPendingAuthToken(token, "vikash");

    assert.deepEqual(decoded, {
      phone: "+911234567890",
      phoneCodeHash: "hash123",
    });
    assert.equal(readPendingAuthToken(token, "someone-else"), null);
  } finally {
    process.env.JWT_SECRET = previousSecret;
  }
});

test("toTelegramIso supports Date objects and Telegram second timestamps", () => {
  const iso = "2026-03-29T18:24:05.000Z";
  const seconds = Math.floor(Date.parse(iso) / 1000);

  assert.equal(toTelegramIso(new Date(iso)), iso);
  assert.equal(toTelegramIso(seconds), iso);
  assert.equal(toTelegramIso(String(seconds)), iso);
});
