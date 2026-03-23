require("dotenv").config();
const mongoose = require("mongoose");
const Integration = require("../models/Integration");
const { setupGmailWatch } = require("../services/websocketServer");

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Renewing Gmail watches...");

  const integrations = await Integration.find({ type: "gmail", enabled: true });
  for (const i of integrations) {
    try {
      await setupGmailWatch(i.userId);
      console.log(`✅ Renewed watch for ${i.userId}`);
    } catch (err) {
      console.error(`❌ Failed for ${i.userId}:`, err.message);
    }
  }

  await mongoose.disconnect();
}

run().catch(console.error);
