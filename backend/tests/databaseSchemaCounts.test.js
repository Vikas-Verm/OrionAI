"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  __test: dbTest,
} = require("../services/connectedDatabaseService");

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
          return { rows: [{ total_count: 4 }] };
        }

        if (/FROM "public"\."tickets"/.test(sql)) {
          return { rows: [{ total_count: 100 }] };
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
    queries.filter(({ sql }) => /SELECT COUNT\(\*\)::bigint AS total_count FROM/.test(sql)).length,
    2
  );
});

test("loadPostgresTableCounts keeps catalog estimates for large schemas", async () => {
  const queries = [];
  const tables = Array.from({ length: 21 }, (_, index) => ({
    name: `public.table_${index + 1}`,
    estimatedRows: null,
  }));

  const counts = await dbTest.loadPostgresTableCounts(
    {
      async query(sql, params = []) {
        queries.push({ sql, params });
        if (/FROM pg_class cls/.test(sql)) {
          return {
            rows: tables.map((table, index) => ({
              schema_name: "public",
              table_name: table.name.split(".").at(-1),
              row_count: index + 10,
            })),
          };
        }

        throw new Error(`Unexpected SQL: ${sql}`);
      },
    },
    { vendor: "postgres", defaultSchema: "public" },
    tables
  );

  assert.equal(counts["public.table_1"], 10);
  assert.equal(counts["public.table_21"], 30);
  assert.equal(
    queries.filter(({ sql }) => /SELECT COUNT\(\*\)::bigint AS total_count FROM/.test(sql)).length,
    0
  );
});
