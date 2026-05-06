const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildA1Cell,
  columnIndexToLetter,
  columnLetterToIndex,
  gridRangeToA1,
  parseA1Range,
  quoteSheetTitle,
} = require("../services/googleSheets/a1");
const {
  buildChartSpec,
  chartTypeForSpec,
} = require("../services/googleSheets/charts");
const { buildSheetAiContext } = require("../services/googleSheets/context");

test("A1 helpers convert indices and ranges consistently", () => {
  assert.equal(buildA1Cell(0, 0), "A1");
  assert.equal(buildA1Cell(6, 27), "AB7");
  assert.equal(columnIndexToLetter(25), "Z");
  assert.equal(columnIndexToLetter(26), "AA");
  assert.equal(columnLetterToIndex("AA"), 26);
  assert.equal(
    gridRangeToA1(
      {
        startRow: 1,
        endRow: 4,
        startColumn: 2,
        endColumn: 5,
      },
      "Budget 2026"
    ),
    "'Budget 2026'!C2:E4"
  );
  assert.deepEqual(parseA1Range("'Budget 2026'!C2:E4"), {
    sheetTitle: "Budget 2026",
    startRow: 1,
    endRow: 4,
    startColumn: 2,
    endColumn: 5,
  });
  assert.equal(quoteSheetTitle("Budget 2026"), "'Budget 2026'");
  assert.equal(quoteSheetTitle("'Budget 2026'"), "'Budget 2026'");
  assert.equal(quoteSheetTitle("Bob's Sheet"), "'Bob''s Sheet'");
  assert.equal(quoteSheetTitle(" Sheet With Space "), "' Sheet With Space '");
});

test("Chart helpers create chart specs for supported chart types", () => {
  const columnSpec = buildChartSpec({
    chartType: "column",
    title: "Budget vs Spend",
    range: {
      sheetId: 42,
      startRow: 0,
      endRow: 6,
      startColumn: 0,
      endColumn: 3,
    },
  });

  assert.equal(columnSpec.title, "Budget vs Spend");
  assert.equal(chartTypeForSpec(columnSpec), "column");
  assert.equal(columnSpec.basicChart.series.length, 2);

  const pieSpec = buildChartSpec({
    chartType: "pie",
    title: "Category split",
    range: {
      sheetId: 7,
      startRow: 0,
      endRow: 5,
      startColumn: 0,
      endColumn: 2,
    },
  });

  assert.equal(chartTypeForSpec(pieSpec), "pie");
  assert.equal(pieSpec.pieChart.legendPosition, "RIGHT_LEGEND");
});

test("AI context builder summarizes the active selection and sheet preview", () => {
  const context = buildSheetAiContext({
    workbookTitle: "Marketing Budget",
    activeRangeLabel: "A1:C4",
    activeCellLabel: "C2",
    activeCell: {
      formula: "=SUM(B2:B4)",
      display: "120000",
    },
    activeSheet: {
      title: "Summary",
      charts: [{ title: "Budget vs Spend", type: "column" }],
      cells: [
        [{ display: "Category" }, { display: "Budget" }, { display: "Spend" }],
        [{ display: "Ads" }, { display: "$45,000" }, { display: "$32,500" }],
        [{ display: "Content" }, { display: "$28,000" }, { display: "$18,750" }],
        [{ display: "Events" }, { display: "$15,000" }, { display: "$6,800" }],
      ],
    },
    selection: {
      startRow: 0,
      endRow: 4,
      startColumn: 0,
      endColumn: 3,
    },
  });

  assert.equal(context.workbookTitle, "Marketing Budget");
  assert.equal(context.activeSheetTitle, "Summary");
  assert.equal(context.isEmptySheet, false);
  assert.match(context.selectionTable, /Category/);
  assert.match(context.selectionTable, /Ads/);
  assert.match(context.chartSummary, /Budget vs Spend/);
  assert.ok(context.numericSummary.length >= 2);
});

test("AI context builder marks empty sheets and exposes empty-sheet hints", () => {
  const context = buildSheetAiContext({
    workbookTitle: "Blank Workbook",
    activeSheet: {
      title: "Sheet1",
      charts: [],
      cells: Array.from({ length: 4 }, () =>
        Array.from({ length: 4 }, () => ({ display: "" }))
      ),
    },
    selection: {
      startRow: 0,
      endRow: 1,
      startColumn: 0,
      endColumn: 1,
    },
  });

  assert.equal(context.isEmptySheet, true);
  assert.equal(context.headerLabels.length, 0);
  assert.equal(context.inferredDomain, "");
});
