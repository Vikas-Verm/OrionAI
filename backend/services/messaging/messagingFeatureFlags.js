"use strict";

const MESSAGING_FEATURE_FLAGS = Object.freeze({
  WHATSAPP_V2_READ: "MESSAGING_V2_WHATSAPP_READ_ENABLED",
  WHATSAPP_V2_HISTORY: "MESSAGING_V2_WHATSAPP_HISTORY_ENABLED",
  WHATSAPP_V2_SEND: "MESSAGING_V2_WHATSAPP_SEND_ENABLED",
});

function envFlagEnabled(name = "") {
  const value = String(process.env[name] || "").trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

function isWhatsAppV2ReadEnabled() {
  return envFlagEnabled(MESSAGING_FEATURE_FLAGS.WHATSAPP_V2_READ);
}

function isWhatsAppV2HistoryEnabled() {
  return envFlagEnabled(MESSAGING_FEATURE_FLAGS.WHATSAPP_V2_HISTORY);
}

function isWhatsAppV2SendEnabled() {
  return envFlagEnabled(MESSAGING_FEATURE_FLAGS.WHATSAPP_V2_SEND);
}

module.exports = {
  MESSAGING_FEATURE_FLAGS,
  envFlagEnabled,
  isWhatsAppV2ReadEnabled,
  isWhatsAppV2HistoryEnabled,
  isWhatsAppV2SendEnabled,
};
