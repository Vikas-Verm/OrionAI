"use strict";

require("dotenv").config();

const mongoose = require("mongoose");
const {
  connectMongoFromEnv,
} = require("../services/messaging/messagingBootstrapService");
const {
  reconcileAll,
  formatReconciliationSummary,
} = require("../services/messaging/messagingReconciliationService");
const {
  closeBridgeEvidencePools,
} = require("../services/messaging/bridgePortalEvidenceSource");
const {
  normalizeMessagingProvider,
} = require("../services/messaging/messagingConstants");

function parseArgs(argv = []) {
  const options = {
    dryRun: true,
    details: false,
    provider: "",
    userId: "",
  };

  for (const arg of argv) {
    if (arg === "--apply") options.dryRun = false;
    else if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--details") options.details = true;
    else if (arg.startsWith("--provider=")) {
      options.provider = normalizeMessagingProvider(arg.split("=").slice(1).join("="));
    } else if (arg.startsWith("--userId=")) {
      options.userId = String(arg.split("=").slice(1).join("=") || "").trim();
    }
  }

  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  await connectMongoFromEnv();
  const summary = await reconcileAll(options);
  console.log(formatReconciliationSummary(summary));
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeBridgeEvidencePools();
    if (mongoose.connection.readyState) {
      await mongoose.disconnect();
    }
  });
