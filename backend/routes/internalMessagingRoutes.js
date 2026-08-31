"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const express = require("express");
const {
  recordCheckpoint,
} = require("../services/messaging/matrixSendCheckpointStore");

const router = express.Router();

function readRegistrationAsToken(filePath = "") {
  try {
    const contents = fs.readFileSync(filePath, "utf8");
    return String(contents.match(/^as_token:\s*"?([^"\s]+)"?\s*$/m)?.[1] || "")
      .trim();
  } catch {
    return "";
  }
}

function expectedWhatsAppAsToken() {
  return (
    String(process.env.MATRIX_WHATSAPP_AS_TOKEN || "").trim() ||
    readRegistrationAsToken(
      path.resolve(__dirname, "../../infra/mautrix-whatsapp/registration.yaml")
    ) ||
    readRegistrationAsToken(
      path.resolve(
        __dirname,
        "../../infra/synapse/appservices/mautrix-whatsapp-registration.yaml"
      )
    )
  );
}

function extractBearerToken(req) {
  const header = String(req.get("authorization") || "").trim();
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (match) return match[1].trim();
  return String(
    req.query?.access_token || req.query?.as_token || req.body?.access_token || ""
  ).trim();
}

function secureTokenEqual(left = "", right = "") {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
}

function authenticateWhatsAppCheckpoint(req, res, next) {
  const expected = expectedWhatsAppAsToken();
  const provided = extractBearerToken(req);
  if (!expected || !secureTokenEqual(provided, expected)) {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }
  return next();
}

function processCheckpointEnvelope(body = {}, recorder = recordCheckpoint) {
  const checkpoints = Array.isArray(body?.checkpoints)
    ? body.checkpoints
    : [body];
  return checkpoints.map((checkpoint) => recorder(checkpoint || {}));
}

function emitCheckpointUpdates(results = []) {
  try {
    const { pushToUser } = require("../services/websocketServer");
    for (const result of results) {
      if (!result?.accepted || !result.userId || !result.eventId) continue;
      pushToUser(result.userId, {
        type: "whatsapp_send_status",
        provider: "whatsapp",
        roomId: result.roomId,
        eventId: result.eventId,
        status: result.status || "",
      });
    }
  } catch {
    // Backend scripts may exercise this route without websocket initialization.
  }
}

router.post(
  "/matrix-send-checkpoint",
  authenticateWhatsAppCheckpoint,
  (req, res) => {
    const results = processCheckpointEnvelope(req.body || {});
    if (results.some((result) => result.reason === "malformed_checkpoint")) {
      return res.status(400).json({ ok: false, error: "malformed checkpoint" });
    }
    emitCheckpointUpdates(results);
    const accepted = results.filter((result) => result.accepted);
    if (!accepted.length) {
      return res.status(202).json({ ok: true, accepted: false });
    }
    return res.json({
      ok: true,
      accepted: true,
      acceptedCount: accepted.length,
      status: accepted[accepted.length - 1]?.status || "",
    });
  }
);

module.exports = router;
module.exports.__test = {
  readRegistrationAsToken,
  expectedWhatsAppAsToken,
  extractBearerToken,
  secureTokenEqual,
  processCheckpointEnvelope,
};
