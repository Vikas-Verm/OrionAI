require("dotenv").config();
const mongoose = require("mongoose");

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const db = mongoose.connection.db;
  const integrations = await db
    .collection("integrations")
    .find({ type: "gmail" })
    .toArray();

  if (integrations.length === 0) {
    console.log("❌ No Gmail integrations found in DB");
    process.exit(0);
  }

  integrations.forEach((i) => {
    console.log("─────────────────────────────────");
    console.log("userId:          ", i.userId);
    console.log("enabled:         ", i.enabled);
    console.log("hasRefreshToken: ", !!i.gmail?.refreshToken);
    console.log("hasAccessToken:  ", !!i.gmail?.accessToken);
    console.log("userEmail:       ", i.gmail?.userEmail || "❌ NOT STORED");
    console.log("historyId:       ", i.gmail?.historyId || "not set");
    console.log("gmailKeys:       ", Object.keys(i.gmail || {}));
  });

  process.exit(0);
});
