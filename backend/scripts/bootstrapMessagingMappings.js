"use strict";

require("dotenv").config();

const mongoose = require("mongoose");
const {
  bootstrapMessagingMappings,
  connectMongoFromEnv,
  formatBootstrapSummary,
} = require("../services/messaging/messagingBootstrapService");

async function main() {
  const args = new Set(process.argv.slice(2));
  const dryRun = args.has("--dry-run") || !args.has("--apply");
  const includeCandidates = args.has("--include-candidates");

  await connectMongoFromEnv();

  const summary = await bootstrapMessagingMappings({
    dryRun,
    includeCandidates,
  });

  console.log(`Mode: ${dryRun ? "dry-run" : "apply"}`);
  console.log(formatBootstrapSummary(summary));
  if (!dryRun) {
    console.log(
      "Created/updated OrionAI messaging metadata only. Matrix and bridge databases were not modified."
    );
  }
}

main()
  .catch((err) => {
    console.error(err.message || err);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState) {
      await mongoose.disconnect().catch(() => {});
    }
  });
