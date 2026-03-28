"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  __test: dbTest,
} = require("../services/connectedDatabaseService");

function makeTable(name, fields) {
  return {
    name,
    fields: fields.map((fieldName) => ({
      name: fieldName,
      type: "string",
      primaryKey: fieldName === "id" || fieldName === "_id",
    })),
    primaryKeys: fields.includes("id")
      ? ["id"]
      : fields.includes("_id")
      ? ["_id"]
      : [],
  };
}

test("rankSchemaTables prefers bill tables over invoice tables for bill questions", () => {
  const schema = {
    tables: [
      makeTable("invoices", ["id", "invoice_number", "invoice_date"]),
      makeTable("bills", ["id", "bill_number", "bill_date"]),
      makeTable("purchase_orders", ["id", "po_number", "created_at"]),
    ],
  };

  const ranked = dbTest.rankSchemaTables(schema, "show latest bill");

  assert.equal(ranked[0].name, "bills");
});

test("buildDeterministicLatestPlan returns a Mongo plan for latest bill lookups", () => {
  const schema = {
    tables: [
      makeTable("Invoices", ["_id", "invoice_number", "invoice_date"]),
      makeTable("Bills", ["_id", "bill_number", "bill_date", "created_date"]),
    ],
  };

  const plan = dbTest.buildDeterministicLatestPlan(
    "show latest bill",
    { vendor: "mongodb" },
    schema
  );

  assert.equal(plan.kind, "mongo");
  assert.equal(plan.collection, "Bills");
  assert.equal(plan.operation, "find");
  assert.deepEqual(plan.query, {});
  assert.equal(plan.limit, 1);
  assert.deepEqual(plan.sort, { bill_date: -1 });
});

test("buildDeterministicLatestPlan returns SQL targeting the bill table", () => {
  const schema = {
    tables: [
      makeTable("invoices", ["id", "invoice_number", "invoice_date"]),
      makeTable("bills", ["id", "bill_number", "created_at"]),
    ],
  };

  const plan = dbTest.buildDeterministicLatestPlan(
    "show latest bill",
    { vendor: "postgres" },
    schema
  );

  assert.equal(plan.kind, "sql");
  assert.match(plan.sql, /FROM "bills"/);
  assert.match(plan.sql, /ORDER BY "created_at" DESC/);
});
