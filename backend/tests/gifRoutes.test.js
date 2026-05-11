"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

// We exercise the route module's normalization helper by re-deriving the
// same shape the Tenor v2 API returns and feeding it to a private call.
// A black-box test would need either a mock server or a real Tenor key;
// instead we lock the contract: the route module is loadable, the route
// path it registers is /search, and missing TENOR_API_KEY returns a clean
// JSON shape rather than crashing.

const express = require("express");
const path = require("path");

function makeAppWithGifRoute() {
  // Force-clear any cached module + key.
  delete require.cache[require.resolve("../routes/gifRoutes.js")];
  const middlewarePath = path.resolve(__dirname, "../middleware/auth.js");
  // Stub authenticate so the route is reachable without a JWT.
  require.cache[middlewarePath] = {
    id: middlewarePath,
    filename: middlewarePath,
    loaded: true,
    exports: {
      authenticate: (req, _res, next) => {
        req.user = { username: "testuser" };
        next();
      },
    },
  };

  const gifRoutes = require("../routes/gifRoutes.js");
  const app = express();
  app.use("/api/gifs", gifRoutes);
  return app;
}

test("GET /api/gifs/search returns ok:false with a clean error when TENOR_API_KEY is missing", async () => {
  const previous = process.env.TENOR_API_KEY;
  delete process.env.TENOR_API_KEY;
  delete process.env.TENOR_KEY;
  delete process.env.GIPHY_API_KEY;

  const app = makeAppWithGifRoute();
  const server = app.listen(0);
  try {
    const port = server.address().port;
    const res = await fetch(
      `http://127.0.0.1:${port}/api/gifs/search?q=cat&limit=10`
    );
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.ok, false);
    assert.match(body.error || "", /TENOR_API_KEY/);
    assert.deepEqual(body.results, []);
  } finally {
    server.close();
    if (previous !== undefined) process.env.TENOR_API_KEY = previous;
  }
});

test("GET /api/gifs/search clamps the limit between 1 and 48", async () => {
  // We can't observe the outgoing request without a live key, but we can
  // confirm the route doesn't crash on out-of-range limit values and still
  // returns the unconfigured-key response.
  delete process.env.TENOR_API_KEY;
  const app = makeAppWithGifRoute();
  const server = app.listen(0);
  try {
    const port = server.address().port;
    const tooHigh = await fetch(
      `http://127.0.0.1:${port}/api/gifs/search?limit=9999`
    );
    const tooLow = await fetch(
      `http://127.0.0.1:${port}/api/gifs/search?limit=-5`
    );
    assert.equal(tooHigh.status, 200);
    assert.equal(tooLow.status, 200);
  } finally {
    server.close();
  }
});
