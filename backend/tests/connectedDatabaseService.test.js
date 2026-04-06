"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  __test: dbTest,
} = require("../services/connectedDatabaseService");

const FIXED_NOW = new Date(2026, 2, 30, 12, 0, 0);

function makeTable(name, fields) {
  const normalizedFields = fields.map((field) =>
    typeof field === "string"
      ? {
          name: field,
          type: "string",
          primaryKey: field === "id" || field === "_id",
        }
      : {
          name: field.name,
          type: field.type || "string",
          primaryKey:
            field.primaryKey === true ||
            field.name === "id" ||
            field.name === "_id",
        }
  );

  return {
    name,
    fields: normalizedFields,
    primaryKeys: normalizedFields
      .filter((field) => field.primaryKey)
      .map((field) => field.name),
  };
}

function makeBillTable() {
  return makeTable("public.bill_ledger", [
    { name: "id", type: "int", primaryKey: true },
    { name: "createdDate", type: "date" },
    { name: "entryStamp", type: "varchar" },
    { name: "issuedOn", type: "varchar" },
    { name: "status_text", type: "varchar" },
  ]);
}

function makeBillRows() {
  return [
    {
      id: 101,
      createdDate: "2026-03-30",
      entryStamp: "2026-03-30 11:30:00",
      issuedOn: "2026-03-30",
      status_text: "open",
    },
    {
      id: 100,
      createdDate: "2026-03-30",
      entryStamp: "2026-03-30 09:15:00",
      issuedOn: "2026-03-29",
      status_text: "paid",
    },
    {
      id: 99,
      createdDate: "2026-03-29",
      entryStamp: "2026-03-29 23:45:00",
      issuedOn: "2026-03-28",
      status_text: "open",
    },
  ];
}

function makeBillContext() {
  return dbTest.buildTableContext(makeBillTable(), makeBillRows(), 3);
}

test("rankSchemaTables prefers bill-like tables for bill questions", () => {
  const schema = {
    tables: [
      makeTable("public.invoices", ["id", "invoice_number", "issued_on"]),
      makeTable("public.bill_ledger", ["id", "entryStamp", "issuedOn"]),
      makeTable("public.purchase_orders", ["id", "po_number"]),
    ],
  };

  const ranked = dbTest.rankSchemaTables(schema, "show latest bill");

  assert.equal(ranked[0].name, "public.bill_ledger");
});

test("extractQuestionContext removes collection hint and keeps preferred target", () => {
  const context = dbTest.extractQuestionContext(
    "[Collection: public.bill_ledger] how many were created today?"
  );

  assert.equal(context.preferredTarget, "public.bill_ledger");
  assert.equal(context.question, "how many were created today?");
});

test("buildFieldProfile detects temporal meaning from sample values", () => {
  const profile = dbTest.buildFieldProfile(
    { name: "entryStamp", type: "varchar" },
    makeBillRows()
  );

  assert.equal(profile.temporalCandidate, true);
  assert.equal(profile.temporalPrecision, "time");
  assert.equal(profile.temporalObservations[0].source, "datetime-string");
});

test("pickTemporalField prefers time-precision fields for last-hour questions", () => {
  const field = dbTest.pickTemporalField(
    makeBillContext(),
    "How many bills are created in last 12 hr?",
    {
      relativeRange: dbTest.parseRelativeDateRange(
        "How many bills are created in last 12 hr?",
        FIXED_NOW
      ),
    }
  );

  assert.equal(field.name, "entryStamp");
});

test("pickLatestSortField prefers the most precise observed recency field", () => {
  const field = dbTest.pickLatestSortField(
    makeBillContext(),
    "show latest bill"
  );

  assert.equal(field.name, "entryStamp");
});

test("resolveQuestionSchemaInterpretation honors the focused target and derives fields dynamically", () => {
  const planningContext = {
    tables: [
      dbTest.buildTableContext(
        makeTable("public.invoices", [
          { name: "id", type: "int", primaryKey: true },
          { name: "issuedAt", type: "timestamp" },
        ]),
        [{ id: 1, issuedAt: "2026-03-29 08:00:00" }],
        1
      ),
      makeBillContext(),
    ],
  };

  const interpretation = dbTest.resolveQuestionSchemaInterpretation(
    {},
    planningContext,
    "How many are created in last 12 hr?",
    {
      preferredTarget: "bill_ledger",
      now: FIXED_NOW,
    }
  );

  assert.equal(interpretation.target, "public.bill_ledger");
  assert.equal(interpretation.questionType, "count");
  assert.equal(interpretation.temporalField.name, "entryStamp");
  assert.equal(interpretation.relativeRange.kind, "last_hours");
});

test("buildLatestPlanFromInterpretation returns SQL against the resolved connected table", () => {
  const tableContext = makeBillContext();
  const plan = dbTest.buildLatestPlanFromInterpretation(
    "show latest bill",
    { vendor: "postgres" },
    {
      target: "public.bill_ledger",
      tableContext,
      recencyField: tableContext.fieldProfiles.find(
        (field) => field.name === "entryStamp"
      ),
      notes: "",
    }
  );

  assert.equal(plan.kind, "sql");
  assert.match(plan.sql, /FROM "public"\."bill_ledger"/);
  assert.match(plan.sql, /ORDER BY "entryStamp" DESC LIMIT 1/);
});

test("buildTemporalPlanFromInterpretation returns Mongo count plan for last-hour windows", () => {
  const tableContext = makeBillContext();
  const question = "How many bills are created in last 12 hr?";
  const plan = dbTest.buildTemporalPlanFromInterpretation(
    question,
    { vendor: "mongodb" },
    {
      target: "public.bill_ledger",
      tableContext,
      temporalField: tableContext.fieldProfiles.find(
        (field) => field.name === "entryStamp"
      ),
      recencyField: tableContext.fieldProfiles.find(
        (field) => field.name === "entryStamp"
      ),
      relativeRange: dbTest.parseRelativeDateRange(question, FIXED_NOW),
      notes: "",
    }
  );

  assert.equal(plan.kind, "mongo");
  assert.equal(plan.operation, "count");
  assert.equal(plan.collection, "public.bill_ledger");
  assert.equal(plan.query.$or[2].entryStamp.$gte, "2026-03-30 00:00:00");
  assert.equal(plan.query.$or[2].entryStamp.$lt, "2026-03-30 12:00:00");
});

test("applyRuntimePlaceholdersToPlan injects runtime timestamps into SQL plans", () => {
  const question = "How many bills are created in last 12 hr?";
  const tableContext = makeBillContext();
  const interpretation = {
    target: "public.bill_ledger",
    tableContext,
    temporalField: tableContext.fieldProfiles.find(
      (field) => field.name === "entryStamp"
    ),
    recencyField: tableContext.fieldProfiles.find(
      (field) => field.name === "entryStamp"
    ),
    relativeRange: dbTest.parseRelativeDateRange(question, FIXED_NOW),
  };

  const plan = dbTest.applyRuntimePlaceholdersToPlan(
    {
      kind: "sql",
      sql: 'SELECT * FROM "public"."bill_ledger" WHERE "entryStamp" >= TIMESTAMP \'__ORION_SQL_RANGE_START__\' AND "entryStamp" < TIMESTAMP \'__ORION_SQL_RANGE_END__\'',
    },
    interpretation
  );

  assert.match(plan.sql, /2026-03-30 00:00:00/);
  assert.match(plan.sql, /2026-03-30 12:00:00/);
});

test("applyRuntimePlaceholdersToPlan injects runtime Date objects into Mongo plans when the field is native temporal", () => {
  const range = dbTest.parseRelativeDateRange(
    "How many jobs started in last 12 hr?",
    FIXED_NOW
  );
  const plan = dbTest.applyRuntimePlaceholdersToPlan(
    {
      kind: "mongo",
      query: {
        startedAt: {
          $gte: "__ORION_RANGE_START__",
          $lt: "__ORION_RANGE_END__",
        },
      },
      projection: {},
      sort: {},
      pipeline: [],
    },
    {
      relativeRange: range,
      temporalField: {
        name: "startedAt",
        type: "timestamp",
        sampleValues: [],
      },
    }
  );

  assert.ok(plan.query.startedAt.$gte instanceof Date);
  assert.ok(plan.query.startedAt.$lt instanceof Date);
  assert.equal(plan.query.startedAt.$gte.toISOString(), range.start.toISOString());
  assert.equal(plan.query.startedAt.$lt.toISOString(), range.end.toISOString());
});

test("parseRelativeDateRange supports tomorrow, this week, and current year using runtime dates", () => {
  const tomorrow = dbTest.parseRelativeDateRange("show tomorrow bills", FIXED_NOW);
  const thisWeek = dbTest.parseRelativeDateRange(
    "how many bills this week?",
    FIXED_NOW
  );
  const currentYear = dbTest.parseRelativeDateRange(
    "how many bills in current year?",
    FIXED_NOW
  );

  assert.equal(tomorrow.kind, "tomorrow");
  assert.equal(tomorrow.startDateOnly, "2026-03-31");

  assert.equal(thisWeek.kind, "this_week");
  assert.equal(thisWeek.startDateOnly, "2026-03-30");
  assert.equal(thisWeek.endDateOnly, "2026-04-05");

  assert.equal(currentYear.kind, "this_year");
  assert.equal(currentYear.startDateOnly, "2026-01-01");
  assert.equal(currentYear.endDateOnly, "2026-12-31");
});

test("describeMongoPlan includes the resolved count filter", () => {
  const tableContext = makeBillContext();
  const question = "How many bills are created in last 12 hr?";
  const plan = dbTest.buildTemporalPlanFromInterpretation(
    question,
    { vendor: "mongodb" },
    {
      target: "public.bill_ledger",
      tableContext,
      temporalField: tableContext.fieldProfiles.find(
        (field) => field.name === "entryStamp"
      ),
      recencyField: tableContext.fieldProfiles.find(
        (field) => field.name === "entryStamp"
      ),
      relativeRange: dbTest.parseRelativeDateRange(question, FIXED_NOW),
      notes: "",
    }
  );

  const description = dbTest.describeMongoPlan(plan);

  assert.match(description, /^public\.bill_ledger\.countDocuments\(/);
  assert.match(description, /entryStamp/);
});
