"use strict";

require("dotenv").config();

const mongoose = require("mongoose");
const {
  connectMongoFromEnv,
} = require("../services/messaging/messagingBootstrapService");
const {
  recoverMatrixSession,
  formatRecoverySummary,
} = require("../services/messaging/matrixSessionRecoveryService");
const {
  normalizeMessagingProvider,
} = require("../services/messaging/messagingConstants");

function parseArgs(argv = []) {
  const options = {
    provider: "",
    userId: "",
    connectionId: "",
    dryRun: true,
  };

  for (const arg of argv) {
    if (arg === "--apply") options.dryRun = false;
    else if (arg === "--dry-run") options.dryRun = true;
    else if (arg.startsWith("--provider=")) {
      options.provider = normalizeMessagingProvider(
        arg.split("=").slice(1).join("=")
      );
    } else if (arg.startsWith("--userId=")) {
      options.userId = String(arg.split("=").slice(1).join("=") || "").trim();
    } else if (arg.startsWith("--connectionId=")) {
      options.connectionId = String(arg.split("=").slice(1).join("=") || "").trim();
    }
  }

  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.provider || !options.userId) {
    throw new Error("--provider and --userId are required.");
  }
  await connectMongoFromEnv();
  const result = await recoverMatrixSession(options);
  console.log(formatRecoverySummary(result));
}

main()
  .catch((err) => {
    console.error(err.code || err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState) {
      await mongoose.disconnect();
    }
  });
