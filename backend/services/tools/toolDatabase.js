"use strict";

const { queryConnectedDatabase } = require("../connectedDatabaseService");

async function toolDatabaseQuery(params, ctx) {
  const question =
    params.question ||
    params.query ||
    params.prompt ||
    params.message ||
    "";

  if (!String(question).trim()) {
    throw new Error("A database question is required.");
  }

  const result = await queryConnectedDatabase(ctx.userId, question);
  return {
    ok: true,
    vendor: result.vendor,
    integrationName: result.integrationName,
    count: result.rowCount,
    rows: result.rows,
    executedQuery: result.executedQuery,
    summary:
      result.reply ||
      `Database query completed on ${result.integrationName}. Returned ${result.rowCount} row(s).`,
  };
}

module.exports = { toolDatabaseQuery };
