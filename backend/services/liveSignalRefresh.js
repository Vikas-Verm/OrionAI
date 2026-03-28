"use strict";

async function refreshUsersSignals(userIds = []) {
  const uniqueUserIds = [...new Set((userIds || []).filter(Boolean))];
  if (!uniqueUserIds.length) return;

  try {
    const { refreshUserSignals } = require("./websocketServer");
    if (typeof refreshUserSignals !== "function") return;
    await Promise.allSettled(
      uniqueUserIds.map((userId) => refreshUserSignals(userId))
    );
  } catch {}
}

module.exports = {
  refreshUsersSignals,
};
