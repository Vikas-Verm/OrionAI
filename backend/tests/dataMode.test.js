"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");

const { QuestionParser } = require("../services/dataMode/parser/questionParser");
const { __test: mongoAdapterTest } = require("../services/dataMode/adapters/mongoAdapter");
const {
  SemanticCatalogBuilder,
} = require("../services/dataMode/catalog/semanticCatalogBuilder");
const {
  detectFieldSemantics,
} = require("../services/dataMode/catalog/fieldSemanticDetector");
const { GroundingEngine } = require("../services/dataMode/grounding/groundingEngine");
const { LogicalPlanner } = require("../services/dataMode/planner/logicalPlanner");
const { MongoCompiler } = require("../services/dataMode/compiler/mongoCompiler");
const { SQLCompiler } = require("../services/dataMode/compiler/sqlCompiler");
const { ReferenceEnricher } = require("../services/dataMode/execution/referenceEnricher");
const { AnswerBuilder } = require("../services/dataMode/answer/answerBuilder");

test("question parser preserves deterministic number lookup filters", async () => {
  const parser = new QuestionParser(async () =>
    JSON.stringify({
      intent: "list",
      entity: "record",
      filters: [],
      confidence: 0.35,
      projection: "full_record",
    })
  );

  const ir = await parser.parse(
    "show me the data of bill which number is T-0004-2025-12",
    ["Bills", "Users"]
  );

  assert.equal(ir.entity, "bill");
  assert.equal(ir.intent, "lookup");
  assert.ok(
    ir.filters.some(
      (filter) =>
        filter.role === "number" &&
        filter.value === "T-0004-2025-12" &&
        filter.operator === "eq" &&
        filter.value_kind === "identifier"
    )
  );
});

test("question parser extracts seller text filters deterministically", async () => {
  const parser = new QuestionParser(async () =>
    JSON.stringify({
      intent: "list",
      entity: "record",
      filters: [],
      confidence: 0.3,
      projection: "full_record",
    })
  );

  const ir = await parser.parse(
    "show bill of seller Jai Hanuman Traders",
    ["Bills", "Users"]
  );

  assert.equal(ir.entity, "bill");
  assert.ok(
    ir.filters.some(
      (filter) =>
        filter.role === "seller" &&
        filter.value === "Jai Hanuman Traders" &&
        filter.value_kind === "text"
    )
  );
});

test("question parser extracts generic relational filters without fixed business vocabulary", async () => {
  const parser = new QuestionParser(async () =>
    JSON.stringify({
      intent: "list",
      entity: "record",
      filters: [],
      confidence: 0.3,
      projection: "full_record",
    })
  );

  const ir = await parser.parse(
    "show task by reviewer Neha Sharma",
    ["Tasks", "Accounts"]
  );

  assert.equal(ir.entity, "task");
  assert.ok(
    ir.filters.some(
      (filter) =>
        filter.role === "reviewer" &&
        filter.value === "Neha Sharma" &&
        filter.value_kind === "text"
    )
  );
});

test("question parser downgrades LLM-mislabeled human names from identifier to text", async () => {
  const parser = new QuestionParser(async () =>
    JSON.stringify({
      intent: "lookup",
      entity: "bill",
      filters: [
        {
          role: "seller",
          value: "Jai Hanuman Traders",
          operator: "eq",
          value_kind: "identifier",
          confidence: 0.8,
        },
      ],
      confidence: 0.75,
      projection: "full_record",
    })
  );

  const ir = await parser.parse(
    "show bill of seller Jai Hanuman Traders",
    ["Bills", "Users"]
  );

  assert.ok(
    ir.filters.some(
      (filter) =>
        filter.role === "seller" &&
        filter.value === "Jai Hanuman Traders" &&
        filter.value_kind === "text"
    )
  );
});

test("question parser drops hallucinated identifier filters that are not supported by the question text", async () => {
  const parser = new QuestionParser(async () =>
    JSON.stringify({
      intent: "lookup",
      entity: "bill",
      filters: [
        {
          role: "number",
          value: "T-0004-2025-12",
          operator: "eq",
          value_kind: "identifier",
          confidence: 0.9,
        },
        {
          role: "trade_type",
          value: "T-0004-2025-12",
          operator: "eq",
          value_kind: "identifier",
          confidence: 0.7,
        },
      ],
      confidence: 0.8,
      projection: "full_record",
    })
  );

  const ir = await parser.parse(
    "show me the data of bill which number is T-0004-2025-12",
    ["Bills"]
  );

  assert.ok(
    ir.filters.some(
      (filter) =>
        filter.role === "number" && filter.value === "T-0004-2025-12"
    )
  );
  assert.ok(!ir.filters.some((filter) => filter.role === "trade_type"));
});

test("question parser ignores incomplete llm time ranges with no concrete bounds", async () => {
  const parser = new QuestionParser(async () =>
    JSON.stringify({
      intent: "lookup",
      entity: "user",
      filters: [
        {
          role: "first_name",
          value: "john",
          operator: "eq",
          value_kind: "text",
          confidence: 0.9,
        },
      ],
      time_range: { kind: "custom", role_hint: "created" },
      confidence: 0.85,
      projection: "full_record",
    })
  );

  const ir = await parser.parse("show john user data", ["public.users"]);

  assert.equal(ir.time_range, null);
});

test("question parser preserves the exact focused collection hint for Database Page queries", async () => {
  const parser = new QuestionParser(async () =>
    JSON.stringify({
      intent: "latest",
      entity: "record",
      filters: [],
      confidence: 0.8,
      projection: "full_record",
      limit: 10,
    })
  );

  const ir = await parser.parse(
    "[Collection: Invoices] Show latest 10 from Invoices",
    ["Invoices", "invoices"]
  );

  assert.equal(ir.preferred_target, "Invoices");
  assert.equal(ir.entity, "invoice");
});

test("question parser drops hallucinated latest-sort fields unless the user explicitly asked for sorting", async () => {
  const parser = new QuestionParser(async () =>
    JSON.stringify({
      intent: "latest",
      entity: "invoice",
      filters: [],
      sort: [{ role: "buyer name", direction: "desc" }],
      confidence: 0.8,
      projection: "full_record",
      limit: 10,
    })
  );

  const ir = await parser.parse(
    "[Collection: Invoices] Show latest 10 from Invoices",
    ["Invoices"]
  );

  assert.deepEqual(ir.sort, []);
});

test("semantic catalog infers actor-style references from role-bearing related objects", async () => {
  const builder = new SemanticCatalogBuilder({
    async profileObjects() {
      return {
        Bills: {
          samples: {
            number: ["T-0004-2025-12"],
          },
        },
        Users: {
          samples: {
            role: ["seller", "buyer"],
            shop_name: ["Jai Hanuman Traders"],
          },
        },
      };
    },
  });

  const catalog = await builder.build("demo", {
    vendor: "mongodb",
    fingerprint: "test",
    objects: [
      {
        name: "Bills",
        fields: [
          { name: "_id", type: "objectid", is_primary_key: true },
          { name: "number", type: "string" },
          { name: "seller", type: "objectid" },
        ],
        primary_keys: ["_id"],
      },
      {
        name: "Users",
        fields: [
          { name: "_id", type: "objectid", is_primary_key: true },
          { name: "role", type: "string" },
          { name: "shop_name", type: "string" },
        ],
        primary_keys: ["_id"],
      },
    ],
  });

  const bills = catalog.objects.find((object) => object.name === "Bills");
  const sellerField = bills.fields.find((field) => field.name === "seller");

  assert.deepEqual(sellerField.references, {
    object: "Users",
    field: "_id",
  });

  const grounding = new GroundingEngine(catalog).ground({
    intent: "lookup",
    entity: "bill",
    entity_hints: [],
    filters: [
      {
        role: "seller",
        value: "Jai Hanuman Traders",
        operator: "contains_ci",
        value_kind: "text",
      },
    ],
    time_range: null,
    compare_windows: [],
    metrics: [],
    group_by: [],
    sort: [],
    limit: 1,
    projection: "full_record",
  });

  assert.equal(grounding.plan.filters[0].object, "Users");
  assert.equal(grounding.plan.filters[0].field, "shop_name");
  assert.equal(grounding.plan.joins[0].to_object, "Users");
});

test("semantic catalog infers reference targets from arbitrary schema-defined labels", async () => {
  const builder = new SemanticCatalogBuilder({
    async profileObjects() {
      return {
        Tasks: {
          samples: {
            title: ["Follow up"],
          },
        },
        Accounts: {
          samples: {
            kind: ["reviewer", "approver"],
            display_name: ["Neha Sharma"],
          },
        },
      };
    },
  });

  const catalog = await builder.build("demo-2", {
    vendor: "mongodb",
    fingerprint: "test-2",
    objects: [
      {
        name: "Tasks",
        fields: [
          { name: "_id", type: "objectid", is_primary_key: true },
          { name: "title", type: "string" },
          { name: "reviewer", type: "objectid" },
        ],
        primary_keys: ["_id"],
      },
      {
        name: "Accounts",
        fields: [
          { name: "_id", type: "objectid", is_primary_key: true },
          { name: "kind", type: "string" },
          { name: "display_name", type: "string" },
        ],
        primary_keys: ["_id"],
      },
    ],
  });

  const tasks = catalog.objects.find((object) => object.name === "Tasks");
  const reviewerField = tasks.fields.find((field) => field.name === "reviewer");

  assert.deepEqual(reviewerField.references, {
    object: "Accounts",
    field: "_id",
  });
});

test("grounding expands identifier lookups into collection-level candidate search", () => {
  const grounding = new GroundingEngine({
    vendor: "mongodb",
    relation_graph: [],
    entity_map: { bill: ["Bills"] },
    objects: [
      {
        name: "Bills",
        fields: [
          {
            name: "number",
            type: "string",
            normalized_tokens: ["number"],
            semantics: { isExactIdentifierCandidate: true },
          },
          {
            name: "internal_number",
            type: "string",
            normalized_tokens: ["internal", "number"],
            semantics: { isExactIdentifierCandidate: true },
          },
          {
            name: "trade_type",
            type: "string",
            normalized_tokens: ["trade", "type"],
            semantics: { isCategorical: true },
          },
          {
            name: "status",
            type: "string",
            normalized_tokens: ["status"],
            semantics: {
              isExactIdentifierCandidate: true,
              isCategorical: true,
            },
          },
          {
            name: "created_by",
            type: "string",
            normalized_tokens: ["created", "by"],
            semantics: { isExactIdentifierCandidate: true },
          },
        ],
      },
    ],
  }).ground({
    intent: "lookup",
    entity: "bill",
    entity_hints: [],
    filters: [
      {
        role: "number",
        value: "T-0004-2025-12",
        operator: "eq",
        value_kind: "identifier",
      },
    ],
    time_range: null,
    compare_windows: [],
    metrics: [],
    group_by: [],
    sort: [],
    limit: 20,
    projection: "full_record",
  });

  assert.ok(Array.isArray(grounding.plan.filters[0].alternatives));
  assert.deepEqual(
    grounding.plan.filters[0].alternatives.map((item) => item.field),
    ["number", "internal_number"]
  );
});

test("grounding honors the exact preferred target when case-distinct collections both exist", () => {
  const grounding = new GroundingEngine({
    vendor: "mongodb",
    relation_graph: [],
    entity_map: { invoice: ["Invoices", "invoices"] },
    objects: [
      {
        name: "Invoices",
        fields: [
          {
            name: "number",
            type: "string",
            normalized_tokens: ["number"],
            semantics: { isExactIdentifierCandidate: true },
          },
        ],
      },
      {
        name: "invoices",
        fields: [
          {
            name: "number",
            type: "string",
            normalized_tokens: ["number"],
            semantics: { isExactIdentifierCandidate: true },
          },
        ],
      },
    ],
  }).ground({
    intent: "latest",
    entity: "invoice",
    entity_hints: ["invoice"],
    preferred_target: "Invoices",
    filters: [],
    time_range: null,
    compare_windows: [],
    metrics: [],
    group_by: [],
    sort: [],
    limit: 10,
    projection: "full_record",
  });

  assert.equal(grounding.plan.target_object, "Invoices");
});

test("grounding latest sort ignores non-recency text fields and falls back to _id for MongoDB", () => {
  const grounding = new GroundingEngine({
    vendor: "mongodb",
    relation_graph: [],
    entity_map: { invoice: ["Invoices"] },
    objects: [
      {
        name: "Invoices",
        fields: [
          {
            name: "po_info.buyer_name",
            type: "string",
            normalized_tokens: ["po", "info", "buyer", "name"],
            semantics: {
              isDisplayCandidate: true,
              recencyScore: 0,
            },
          },
          {
            name: "_id",
            type: "objectid",
            normalized_tokens: ["id"],
            is_primary_key: true,
            semantics: {
              isPrimaryKey: true,
              isRecencyCandidate: true,
              recencyScore: 85,
            },
          },
        ],
      },
    ],
  }).ground({
    intent: "latest",
    entity: "invoice",
    entity_hints: ["invoice"],
    preferred_target: "Invoices",
    filters: [],
    time_range: null,
    compare_windows: [],
    metrics: [],
    group_by: [],
    sort: [],
    limit: 10,
    projection: "full_record",
  });

  assert.deepEqual(grounding.plan.sort_field, {
    field: "_id",
    object: "Invoices",
    direction: "desc",
  });
});

test("grounding routes seller-style text lookups through related records instead of global identifier search", () => {
  const grounding = new GroundingEngine({
    vendor: "mongodb",
    relation_graph: [],
    entity_map: { bill: ["Bills"] },
    objects: [
      {
        name: "Bills",
        fields: [
          {
            name: "seller",
            type: "objectid",
            normalized_tokens: ["seller"],
            references: { object: "Users", field: "_id" },
            semantics: { isReferenceField: true },
          },
          {
            name: "number",
            type: "string",
            normalized_tokens: ["number"],
            semantics: { isExactIdentifierCandidate: true },
          },
          {
            name: "status",
            type: "string",
            normalized_tokens: ["status"],
            semantics: { isExactIdentifierCandidate: true },
          },
        ],
      },
      {
        name: "Users",
        candidate_display_fields: ["shop_name"],
        fields: [
          { name: "_id", type: "objectid", semantics: {} },
          {
            name: "shop_name",
            type: "string",
            normalized_tokens: ["shop", "name"],
            semantics: { isDisplayCandidate: true },
          },
        ],
      },
    ],
  }).ground({
    intent: "lookup",
    entity: "bill",
    entity_hints: [],
    filters: [
      {
        role: "seller",
        value: "Jai Hanuman Traders",
        operator: "eq",
        value_kind: "identifier",
      },
    ],
    time_range: null,
    compare_windows: [],
    metrics: [],
    group_by: [],
    sort: [],
    limit: 20,
    projection: "full_record",
  });

  assert.equal(grounding.plan.filters.length, 1);
  assert.equal(grounding.plan.filters[0].object, "Users");
  assert.equal(grounding.plan.filters[0].field, "shop_name");
  assert.ok(!Array.isArray(grounding.plan.filters[0].alternatives));
  assert.equal(grounding.plan.joins[0].to_object, "Users");
});

test("mongo compiler emits or-search across collection identifier candidates", () => {
  const logicalPlan = new LogicalPlanner({ supportsLookupJoin: true }).build({
    target_object: "Bills",
    vendor: "mongodb",
    intent: "lookup",
    filters: [
      {
        object: "Bills",
        alternatives: [
          {
            field: "number",
            object: "Bills",
            operator: "eq",
            value: "T-0004-2025-12",
            field_type: "string",
            confidence: 0.9,
          },
          {
            field: "internal_number",
            object: "Bills",
            operator: "eq",
            value: "T-0004-2025-12",
            field_type: "string",
            confidence: 0.8,
          },
        ],
      },
    ],
    joins: [],
    temporal_field: null,
    time_range: null,
    sort_field: null,
    metrics: [],
    group_by: [],
    limit: 20,
    projection: "full_record",
    compare_windows: [],
    confidence: 0.9,
  });

  const plan = new MongoCompiler({}).compile(logicalPlan);

  assert.equal(plan.operation, "find");
  assert.deepEqual(plan.query, {
    $or: [
      { number: "T-0004-2025-12" },
      { internal_number: "T-0004-2025-12" },
    ],
  });
});

test("sql compiler emits valid postgres placeholders for temporal filters on qualified tables", () => {
  const plan = new SQLCompiler("postgres", {
    supportsJoins: true,
    supportsILIKE: true,
    supportsGroupBy: true,
  }).compile({
    source: "public.bill_ledger",
    intent: "list",
    joins: [],
    filters: [
      {
        field: "number",
        op: "eq",
        value: "T-0004-2025-12",
        field_type: "string",
        logical: "and",
      },
    ],
    group_by: [],
    metrics: [],
    having: [],
    sort: [{ field: "entryStamp", direction: "desc" }],
    projection: "full_record",
    limit: 20,
    time_range: {
      field: "entryStamp",
      start_iso: "2026-04-01T00:00:00.000Z",
      end_iso: "2026-04-02T00:00:00.000Z",
      precision: "time",
    },
    compare_windows: [],
    confidence: 0.9,
    explanation: "test",
  });

  assert.match(plan.sql, /^SELECT "public"\."bill_ledger"\.\*/);
  assert.match(plan.sql, /FROM "public"\."bill_ledger"/);
  assert.match(
    plan.sql,
    /"public"\."bill_ledger"\."entryStamp" >= CAST\(\$2 AS TIMESTAMPTZ\)/
  );
  assert.match(
    plan.sql,
    /"public"\."bill_ledger"\."entryStamp" < CAST\(\$3 AS TIMESTAMPTZ\)/
  );
  assert.doesNotMatch(plan.sql, /TIMESTAMP \$2|DATE \$2/);
  assert.deepEqual(plan.params, [
    "T-0004-2025-12",
    "2026-04-01T00:00:00.000Z",
    "2026-04-02T00:00:00.000Z",
  ]);
});

test("bare entity name lookups compile as text search without phantom time filters", async () => {
  const parser = new QuestionParser(async () =>
    JSON.stringify({
      intent: "lookup",
      entity: "user",
      filters: [
        {
          role: "first_name",
          value: "john",
          operator: "eq",
          value_kind: "text",
          confidence: 0.9,
        },
      ],
      time_range: { kind: "custom" },
      confidence: 0.9,
      projection: "full_record",
    })
  );

  const ir = await parser.parse("show john user data", ["public.users"]);

  const grounded = new GroundingEngine({
    vendor: "postgres",
    relation_graph: [],
    entity_map: { user: ["public.users"] },
    objects: [
      {
        name: "public.users",
        fields: [
          {
            name: "id",
            type: "uuid",
            normalized_tokens: ["id"],
            semantics: {
              isPrimaryKey: true,
              isExactIdentifierCandidate: true,
            },
          },
          {
            name: "first_name",
            type: "text",
            normalized_tokens: ["first", "name"],
            semantics: {
              isText: true,
              isDisplayCandidate: true,
            },
          },
          {
            name: "last_name",
            type: "text",
            normalized_tokens: ["last", "name"],
            semantics: {
              isText: true,
              isDisplayCandidate: true,
            },
          },
          {
            name: "created_at",
            type: "timestamp",
            normalized_tokens: ["created", "at"],
            semantics: {
              isTemporalCandidate: true,
              temporalRole: "created",
              recencyScore: 60,
            },
          },
        ],
      },
    ],
  }).ground({
    ...ir,
    compare_windows: [],
    metrics: [],
    group_by: [],
    sort: [],
    limit: 20,
    projection: "full_record",
  });

  const logicalPlan = new LogicalPlanner({
    supportsJoins: true,
    supportsLookupJoin: false,
    supportsGroupBy: true,
  }).build(grounded.plan);

  const sqlPlan = new SQLCompiler("postgres", {
    supportsJoins: true,
    supportsILIKE: true,
    supportsGroupBy: true,
  }).compile(logicalPlan);

  assert.equal(ir.time_range, null);
  assert.equal(grounded.plan.time_range, null);
  assert.equal(logicalPlan.time_range, null);
  assert.equal(grounded.plan.filters[0].operator, "contains_ci");
  assert.match(
    sqlPlan.sql,
    /LOWER\("public"\."users"\."first_name"\) LIKE \$1/
  );
  assert.doesNotMatch(sqlPlan.sql, /created_at/);
  assert.deepEqual(sqlPlan.params, ["%john%"]);
});

test("sql compiler emits valid count distinct expressions and safe empty IN clauses", () => {
  const compiler = new SQLCompiler("postgres", {
    supportsJoins: true,
    supportsILIKE: true,
    supportsGroupBy: true,
  });

  const aggregatePlan = compiler.compile({
    source: "public.orders",
    intent: "aggregate",
    joins: [],
    filters: [],
    group_by: [],
    metrics: [
      {
        function: "count_distinct",
        field: "customer_id",
        alias: "unique_customers",
      },
    ],
    having: [],
    sort: [],
    projection: "metric_fields",
    limit: 20,
    time_range: null,
    compare_windows: [],
    confidence: 0.9,
    explanation: "test",
  });

  assert.match(
    aggregatePlan.sql,
    /COUNT\(DISTINCT "public"\."orders"\."customer_id"\) AS "unique_customers"/
  );

  const selectPlan = compiler.compile({
    source: "public.orders",
    intent: "list",
    joins: [],
    filters: [
      {
        field: "status",
        op: "in",
        value: [],
        field_type: "string",
        logical: "and",
      },
    ],
    group_by: [],
    metrics: [],
    having: [],
    sort: [],
    projection: "full_record",
    limit: 20,
    time_range: null,
    compare_windows: [],
    confidence: 0.9,
    explanation: "test",
  });

  assert.match(selectPlan.sql, /WHERE 1 = 0/);
});

test("mongo adapter namespace helpers preserve dotted collection names safely", async () => {
  assert.deepEqual(
    mongoAdapterTest._splitQualifiedNamespace("analytics.records"),
    {
      dbName: "analytics",
      collectionName: "records",
    }
  );

  assert.equal(
    mongoAdapterTest._extractCollectionNameFromQualifiedNamespace(
      "analytics.records.archive"
    ),
    "records.archive"
  );

  const makeDb = (databaseName, exactNames = []) => ({
    databaseName,
    listCollections(filter = {}) {
      return {
        async toArray() {
          return exactNames
            .filter((name) => !filter.name || name === filter.name)
            .map((name) => ({ name }));
        },
      };
    },
    collection(name) {
      return { dbName: databaseName, name };
    },
  });

  const currentDb = makeDb("primary", ["records.archive"]);
  const otherDb = makeDb("records", ["archive"]);
  const resolved = await mongoAdapterTest._resolveCollectionHandle(
    {
      db: currentDb,
      client: {
        db(name) {
          return name === "records" ? otherDb : makeDb(name, []);
        },
      },
    },
    "records.archive"
  );

  assert.equal(resolved.db.databaseName, "primary");
  assert.equal(resolved.collection.name, "records.archive");
});

test("field semantics do not classify plain status words as exact identifiers", () => {
  const semantics = detectFieldSemantics({
    name: "status",
    type: "string",
    sampleValues: ["active", "unpaid", "closed"],
  });

  assert.equal(semantics.isExactIdentifierCandidate, false);
  assert.equal(semantics.isCategorical, true);
});

test("field semantics keep human name fields searchable as display text", () => {
  const semantics = detectFieldSemantics({
    name: "first_name",
    type: "text",
    sampleValues: ["John", "Vikas", "Akas", "Akansha", "Vikash"],
  });

  assert.equal(semantics.isDisplayCandidate, true);
  assert.equal(semantics.isCategorical, false);
  assert.equal(semantics.isExactIdentifierCandidate, false);
});

test("grounding resolves seller lookups to nested document paths when present", () => {
  const grounding = new GroundingEngine({
    vendor: "mongodb",
    relation_graph: [],
    entity_map: { bill: ["Bills"] },
    objects: [
      {
        name: "Bills",
        candidate_display_fields: ["number"],
        fields: [
          {
            name: "number",
            type: "string",
            normalized_tokens: ["number"],
            semantics: {
              isExactIdentifierCandidate: true,
            },
          },
          {
            name: "seller_info",
            type: "object",
            normalized_tokens: ["seller", "info"],
            nested_paths: ["seller_info.shop_name", "seller_info.gstin"],
            semantics: {},
          },
        ],
      },
    ],
  }).ground({
    intent: "lookup",
    entity: "bill",
    entity_hints: [],
    filters: [
      {
        role: "seller",
        value: "Jai Hanuman Traders",
        operator: "contains_ci",
        value_kind: "text",
      },
    ],
    time_range: null,
    compare_windows: [],
    metrics: [],
    group_by: [],
    sort: [],
    limit: 1,
    projection: "full_record",
  });

  assert.equal(grounding.plan.filters[0].field, "seller_info.shop_name");
});

test("reference enricher resolves Mongo ObjectId references into compact records", async () => {
  const sellerId = new mongoose.Types.ObjectId();
  const enricher = new ReferenceEnricher(
    {
      vendor: "mongodb",
      async executePlan(plan) {
        assert.equal(plan.operation, "find");
        assert.equal(plan.collection, "Users");
        return {
          rows: [
            {
              _id: sellerId,
              shop_name: "Jai Hanuman Traders",
              role: "seller",
            },
          ],
          rowCount: 1,
        };
      },
    },
    {
      objects: [
        {
          name: "Bills",
          fields: [
            {
              name: "seller",
              references: { object: "Users", field: "_id" },
              semantics: { isReferenceField: true },
            },
          ],
        },
        {
          name: "Users",
          candidate_display_fields: ["shop_name"],
          fields: [
            { name: "_id", semantics: { isExactIdentifierCandidate: true } },
            { name: "shop_name", semantics: { isDisplayCandidate: true } },
            { name: "role", semantics: {} },
          ],
        },
      ],
    }
  );

  const rows = await enricher.enrichRows(
    [{ number: "T-0004-2025-12", seller: sellerId }],
    "Bills"
  );

  assert.equal(rows[0].seller.shop_name, "Jai Hanuman Traders");
  assert.equal(rows[0].seller.role, "seller");
});

test("reference enricher skips invalid reference namespaces instead of throwing", async () => {
  let executeCalls = 0;
  const enricher = new ReferenceEnricher(
    {
      vendor: "mongodb",
      async executePlan() {
        executeCalls += 1;
        return { rows: [], rowCount: 0 };
      },
    },
    {
      objects: [
        {
          name: "Bills",
          fields: [
            {
              name: "seller",
              references: { object: "   ", field: "_id" },
              semantics: { isReferenceField: true },
            },
          ],
        },
      ],
    }
  );

  const rows = await enricher.enrichRows(
    [{ number: "T-0004-2025-12", seller: "abc123" }],
    "Bills"
  );

  assert.equal(executeCalls, 0);
  assert.equal(rows[0].seller, "abc123");
});

test("reference enricher leaves raw rows intact when related lookups fail", async () => {
  const sellerId = new mongoose.Types.ObjectId();
  const enricher = new ReferenceEnricher(
    {
      vendor: "mongodb",
      async executePlan() {
        throw new Error("lookup failed");
      },
    },
    {
      objects: [
        {
          name: "Bills",
          fields: [
            {
              name: "seller",
              references: { object: "Users", field: "_id" },
              semantics: { isReferenceField: true },
            },
          ],
        },
        {
          name: "Users",
          fields: [{ name: "_id", type: "objectid" }],
        },
      ],
    }
  );

  const rows = await enricher.enrichRows(
    [{ number: "T-0004-2025-12", seller: sellerId }],
    "Bills"
  );

  assert.equal(String(rows[0].seller), String(sellerId));
});

test("answer builder renders nested record details without collapsing them to field counts", async () => {
  const builder = new AnswerBuilder();
  const reply = await builder.build(
    "show bill T-0004-2025-12",
    {
      rows: [
        {
          number: "T-0004-2025-12",
          status: "Active",
          seller: {
            shop_name: "Jai Hanuman Traders",
            role: "seller",
          },
          payment_summary: {
            balance_due: 348.59088,
            status_cd: "unpaid",
          },
          lineitems: [
            {
              item_name: "Sample Item",
              qty: 12,
              rate: 29.08,
              amount: 348.96,
            },
          ],
        },
      ],
      rowCount: 1,
      executedQuery: "Bills.find(...)",
      executionMs: 5,
    },
    {
      source: "Bills",
      intent: "lookup",
      filters: [],
      sort: [],
    }
  );

  assert.match(reply, /\*\*Seller:\*\*/);
  assert.match(reply, /Jai Hanuman Traders/);
  assert.match(reply, /\*\*Lineitems:\*\*/);
  assert.match(reply, /Qty: 12/);
  assert.doesNotMatch(reply, /\{20 fields\}/);
});
