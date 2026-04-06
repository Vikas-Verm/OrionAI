"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  __test: dbTest,
} = require("../services/connectedDatabaseService");

test("normalizeFocusedQuestion rewrites Database Page collection hints into plain language", () => {
  assert.equal(
    dbTest.normalizeFocusedQuestion("[Collection: public.users] show latest 10"),
    "show latest 10 from users"
  );

  assert.equal(
    dbTest.normalizeFocusedQuestion(
      "[Collection: public.users] show john user data"
    ),
    "show john user data"
  );
});

test("buildSqlPreviewPlan creates a real case-insensitive table preview query", () => {
  const plan = dbTest.buildSqlPreviewPlan(
    { vendor: "postgres" },
    {
      name: "public.users",
      fields: [
        { name: "id", type: "uuid", is_primary_key: true },
        { name: "first_name", type: "text" },
        { name: "email", type: "text" },
        { name: "avatar_blob", type: "bytea" },
      ],
      primary_keys: ["id"],
    },
    {
      page: 1,
      pageSize: 20,
      searchTerm: "john",
    }
  );

  assert.match(plan.sql, /FROM "public"\."users"/);
  assert.match(plan.sql, /LOWER\(CAST\("first_name" AS TEXT\)\) LIKE \$\d+/);
  assert.match(plan.sql, /LOWER\(CAST\("email" AS TEXT\)\) LIKE \$\d+/);
  assert.doesNotMatch(plan.sql, /avatar_blob/);
  assert.match(plan.sql, /ORDER BY "id" DESC/);
  assert.equal(plan.params.at(-2), 21);
  assert.equal(plan.params.at(-1), 0);
});

test("buildMongoPreviewQuery searches identifier and text fields together", () => {
  const query = dbTest.buildMongoPreviewQuery(
    {
      fields: [
        { name: "_id", type: "objectid" },
        { name: "number", type: "string" },
        { name: "seller_name", type: "text" },
        { name: "amount", type: "number" },
      ],
    },
    "128147"
  );

  assert.ok(Array.isArray(query.$or));
  assert.ok(
    query.$or.some(
      (clause) => Object.prototype.hasOwnProperty.call(clause, "number")
    )
  );
  assert.ok(
    query.$or.some(
      (clause) =>
        clause.seller_name?.$regex === "128147" &&
        clause.seller_name?.$options === "i"
    )
  );
  assert.ok(
    query.$or.some(
      (clause) => Object.prototype.hasOwnProperty.call(clause, "amount")
    )
  );
});

test("normalizeMongoRawInput keeps aggregation pipelines and strips same-db lookup prefixes", () => {
  const normalized = dbTest.normalizeMongoRawInput(
    {
      pipeline: [
        {
          $match: {
            _id: { $oid: "507f1f77bcf86cd799439011" },
            number: "128147",
          },
        },
        {
          $lookup: {
            from: "analytics.PurchaseOrders",
            localField: "_id",
            foreignField: "po_id",
            as: "result",
          },
        },
      ],
      limit: 50,
    },
    "analytics"
  );

  assert.equal(normalized.operation, "aggregate");
  assert.equal(normalized.limit, 50);
  assert.equal(
    String(normalized.pipeline[0].$match._id),
    "507f1f77bcf86cd799439011"
  );
  assert.equal(normalized.pipeline[1].$lookup.from, "PurchaseOrders");
});

test("chooseRowLocator prefers primary keys and falls back to identity fields", () => {
  assert.deepEqual(
    dbTest.chooseRowLocator(
      {
        primary_keys: ["id"],
        fields: [
          { name: "id", type: "uuid" },
          { name: "first_name", type: "text" },
        ],
      },
      {
        id: "row-1",
        first_name: "John",
      }
    ),
    [{ field: "id", value: "row-1" }]
  );

  assert.deepEqual(
    dbTest.chooseRowLocator(
      {
        primary_keys: [],
        fields: [
          { name: "ticket_number", type: "text" },
          { name: "status", type: "text" },
        ],
      },
      {
        ticket_number: "T-1001",
        status: "open",
      }
    ),
    [{ field: "ticket_number", value: "T-1001" }]
  );
});

test("loadPostgresTableCounts probes exact counts for small schemas", async () => {
  const queries = [];
  const counts = await dbTest.loadPostgresTableCounts(
    {
      async query(sql, params = []) {
        queries.push({ sql, params });
        if (/FROM pg_class cls/.test(sql)) {
          return {
            rows: [
              {
                schema_name: "public",
                table_name: "bookings",
                row_count: 0,
              },
              {
                schema_name: "public",
                table_name: "tickets",
                row_count: 100,
              },
            ],
          };
        }

        if (/FROM "public"\."bookings"/.test(sql)) {
          return { rows: [{ row_count: 4 }] };
        }

        if (/FROM "public"\."tickets"/.test(sql)) {
          return { rows: [{ row_count: 100 }] };
        }

        throw new Error(`Unexpected SQL: ${sql}`);
      },
    },
    { vendor: "postgres", defaultSchema: "public" },
    [
      { name: "public.bookings", estimatedRows: null },
      { name: "public.tickets", estimatedRows: null },
    ]
  );

  assert.equal(counts["public.bookings"], 4);
  assert.equal(counts["public.tickets"], 100);
  assert.equal(
    queries.filter(({ sql }) => /SELECT COUNT\(\*\)::bigint AS row_count FROM/.test(sql)).length,
    2
  );
});
