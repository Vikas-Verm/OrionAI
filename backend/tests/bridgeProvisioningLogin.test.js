"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  logoutAllLogins,
} = require("../services/bridgeProvisioningLogin");

function fakeProvisionClient({ before = [], after = [], logoutStatus = 200 }) {
  let whoamiCalls = 0;
  const logoutPaths = [];

  return {
    async get(path) {
      assert.equal(path, "/whoami");
      whoamiCalls += 1;
      return {
        status: 200,
        data: { logins: whoamiCalls === 1 ? before : after },
      };
    },
    async post(path) {
      logoutPaths.push(path);
      return { status: logoutStatus, data: {} };
    },
    logoutPaths,
  };
}

test("logoutAllLogins waits for whoami to confirm every bridge login is gone", async () => {
  const client = fakeProvisionClient({
    before: [{ id: "old-account", state_event: "CONNECTED" }],
    after: [],
  });

  const result = await logoutAllLogins(
    "whatsapp",
    "@orion_u_test_whatsapp:orion.local",
    { client, verifyTimeoutMs: 0, verifyIntervalMs: 0 }
  );

  assert.deepEqual(result, {
    ok: true,
    loggedOut: 1,
    failed: 0,
    remaining: 0,
  });
  assert.deepEqual(client.logoutPaths, ["/logout/old-account"]);
});

test("logoutAllLogins fails closed when the bridge still reports a linked account", async () => {
  const client = fakeProvisionClient({
    before: [{ id: "old-account", state_event: "CONNECTED" }],
    after: [{ id: "old-account", state_event: "CONNECTED" }],
  });

  const result = await logoutAllLogins(
    "signal",
    "@orion_u_test_signal:orion.local",
    { client, verifyTimeoutMs: 0, verifyIntervalMs: 0 }
  );

  assert.equal(result.ok, false);
  assert.equal(result.reason, "logout_incomplete");
  assert.equal(result.remaining, 1);
  assert.equal(result.blockingRemaining, 1);
});

test("logoutAllLogins allows QR recovery when only dead bridge rows remain", async () => {
  const client = fakeProvisionClient({
    before: [{ id: "old-account", state_event: "BAD_CREDENTIALS" }],
    after: [{ id: "old-account", state_event: "BAD_CREDENTIALS" }],
  });

  const result = await logoutAllLogins(
    "signal",
    "@orion_u_test_signal:orion.local",
    { client, verifyTimeoutMs: 0, verifyIntervalMs: 0 }
  );

  assert.equal(result.ok, true);
  assert.equal(result.loggedOut, 1);
  assert.equal(result.remaining, 1);
});
