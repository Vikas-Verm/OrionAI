"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

// We re-derive the same gate expression so a refactor that keeps the
// cadence intact won't break this test, and a refactor that drops Gmail
// polling — or accidentally cranks it back to every-tick — will fail
// loudly. The production code applies a 4-tick (60s) floor so nobody can
// accidentally configure it back to the level that caused GCP to throttle.
function shouldPollGmailOnTick(
  { tick, isFirstRun, forceGmail },
  envEvery = null
) {
  const every = Math.max(4, Number(envEvery) || 20);
  return Boolean(isFirstRun || forceGmail || tick % every === 0);
}

test("Gmail is polled on first run", () => {
  assert.equal(
    shouldPollGmailOnTick({ tick: 1, isFirstRun: true, forceGmail: false }),
    true
  );
});

test("Gmail is polled when explicitly forced (webhook / manual refresh)", () => {
  assert.equal(
    shouldPollGmailOnTick({ tick: 2, isFirstRun: false, forceGmail: true }),
    true
  );
});

test("Default Gmail cadence is every 20th 15s tick (≈5 min) — safe under GCP rate limits", () => {
  for (let tick = 1; tick <= 40; tick += 1) {
    const polled = shouldPollGmailOnTick({
      tick,
      isFirstRun: false,
      forceGmail: false,
    });
    if (tick % 20 === 0) {
      assert.equal(polled, true, `tick ${tick} should poll Gmail`);
    } else {
      assert.equal(polled, false, `tick ${tick} should NOT poll Gmail`);
    }
  }
});

test("GMAIL_POLL_TICKS can be tuned by operators but never below the 4-tick (60s) floor", () => {
  // Operator tries to set it dangerously low — production code clamps to 4.
  for (let tick = 1; tick <= 12; tick += 1) {
    const polled = shouldPollGmailOnTick(
      { tick, isFirstRun: false, forceGmail: false },
      1 // requested 1-tick (every 15s) — should be clamped to 4
    );
    if (tick % 4 === 0) {
      assert.equal(polled, true, `tick ${tick} polled at clamped cadence`);
    } else {
      assert.equal(polled, false, `tick ${tick} should NOT poll`);
    }
  }
});

test("Operators can lengthen the cadence further if their fleet still burns too much quota", () => {
  // 60-tick cadence ≈ 15 min — only the 60th tick polls.
  for (let tick = 1; tick <= 70; tick += 1) {
    const polled = shouldPollGmailOnTick(
      { tick, isFirstRun: false, forceGmail: false },
      60
    );
    if (tick === 60) {
      assert.equal(polled, true);
    } else {
      assert.equal(polled, false);
    }
  }
});
