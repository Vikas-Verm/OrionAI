"use strict";

function cloneRange(source = {}) {
  return {
    sheetId: Number(source.sheetId),
    startRow: Math.max(0, Number(source.startRow || 0)),
    endRow: Math.max(
      Number(source.startRow || 0) + 1,
      Number(source.endRow || source.startRow || 1)
    ),
    startColumn: Math.max(0, Number(source.startColumn || 0)),
    endColumn: Math.max(
      Number(source.startColumn || 0) + 1,
      Number(source.endColumn || source.startColumn || 1)
    ),
  };
}

function toSourceRange(range = {}) {
  const normalized = cloneRange(range);
  return {
    sources: [
      {
        sheetId: normalized.sheetId,
        startRowIndex: normalized.startRow,
        endRowIndex: normalized.endRow,
        startColumnIndex: normalized.startColumn,
        endColumnIndex: normalized.endColumn,
      },
    ],
  };
}

function toSimpleRange(range = {}) {
  return {
    sheetId: Number(range.sheetId),
    startRow: Math.max(0, Number(range.startRowIndex || 0)),
    endRow: Math.max(
      Number(range.startRowIndex || 0) + 1,
      Number(range.endRowIndex || range.startRowIndex || 1)
    ),
    startColumn: Math.max(0, Number(range.startColumnIndex || 0)),
    endColumn: Math.max(
      Number(range.startColumnIndex || 0) + 1,
      Number(range.endColumnIndex || range.startColumnIndex || 1)
    ),
  };
}

function chartTypeForSpec(spec = {}) {
  if (spec.pieChart) return "pie";
  const type = String(spec.basicChart?.chartType || "").toUpperCase();
  if (type === "BAR") return "bar";
  if (type === "COLUMN") return "column";
  if (type === "LINE") return "line";
  if (type === "AREA") return "area";
  return "column";
}

function googleChartType(type = "column") {
  const normalized = String(type || "column").trim().toLowerCase();
  if (normalized === "bar") return "BAR";
  if (normalized === "line") return "LINE";
  if (normalized === "area") return "AREA";
  if (normalized === "pie") return "PIE";
  return "COLUMN";
}

function serializeChart(chart = {}) {
  const spec = chart.spec || {};
  const basicChart = spec.basicChart || {};
  const pieChart = spec.pieChart || {};

  const ranges =
    basicChart.series?.map((item) => item?.series?.sourceRange?.sources || []).flat() ||
    [];
  const firstDomain = basicChart.domains?.[0]?.domain?.sourceRange?.sources?.[0] || null;
  const firstPieLabel = pieChart.domain?.sourceRange?.sources?.[0] || null;
  const firstPieValue = pieChart.series?.sourceRange?.sources?.[0] || null;
  const overlay = chart.position?.overlayPosition || {};

  return {
    chartId: Number(chart.chartId),
    title: spec.title || "Chart",
    subtitle: spec.subtitle || "",
    type: chartTypeForSpec(spec),
    legendPosition:
      String(
        basicChart.legendPosition || pieChart.legendPosition || ""
      ).toLowerCase() || "bottom",
    domainRange: firstDomain ? toSimpleRange(firstDomain) : firstPieLabel ? toSimpleRange(firstPieLabel) : null,
    seriesRanges: ranges.map(toSimpleRange).concat(
      firstPieValue ? [toSimpleRange(firstPieValue)] : []
    ),
    position: {
      sheetId: Number(chart.position?.sheetId || overlay.anchorCell?.sheetId || 0),
      rowIndex: Number(overlay.anchorCell?.rowIndex || 0),
      columnIndex: Number(overlay.anchorCell?.columnIndex || 0),
      offsetXPixels: Number(overlay.offsetXPixels || 0),
      offsetYPixels: Number(overlay.offsetYPixels || 0),
      widthPixels: Number(overlay.widthPixels || 680),
      heightPixels: Number(overlay.heightPixels || 320),
    },
  };
}

function buildChartSpec({
  chartType = "column",
  title = "Chart",
  range = {},
  useFirstRowAsHeaders = true,
}) {
  const normalized = cloneRange(range);
  const startDataRow = useFirstRowAsHeaders
    ? Math.min(normalized.endRow - 1, normalized.startRow + 1)
    : normalized.startRow;
  const categoryColumn = normalized.startColumn;
  const firstSeriesColumn = Math.min(
    normalized.endColumn - 1,
    normalized.startColumn + 1
  );

  if (normalized.endColumn - normalized.startColumn < 2) {
    const error = new Error(
      "Select at least two columns to create a chart."
    );
    error.statusCode = 400;
    throw error;
  }

  if (String(chartType).toLowerCase() === "pie") {
    return {
      title,
      pieChart: {
        legendPosition: "RIGHT_LEGEND",
        domain: {
          sourceRange: toSourceRange({
            sheetId: normalized.sheetId,
            startRow: startDataRow,
            endRow: normalized.endRow,
            startColumn: categoryColumn,
            endColumn: categoryColumn + 1,
          }),
        },
        series: {
          sourceRange: toSourceRange({
            sheetId: normalized.sheetId,
            startRow: startDataRow,
            endRow: normalized.endRow,
            startColumn: firstSeriesColumn,
            endColumn: firstSeriesColumn + 1,
          }),
        },
      },
    };
  }

  const series = [];
  for (let column = normalized.startColumn + 1; column < normalized.endColumn; column += 1) {
    series.push({
      series: {
        sourceRange: toSourceRange({
          sheetId: normalized.sheetId,
          startRow: startDataRow,
          endRow: normalized.endRow,
          startColumn: column,
          endColumn: column + 1,
        }),
      },
      targetAxis: "LEFT_AXIS",
    });
  }

  return {
    title,
    basicChart: {
      chartType: googleChartType(chartType),
      legendPosition: "BOTTOM_LEGEND",
      headerCount: useFirstRowAsHeaders ? 1 : 0,
      axis: [
        {
          position: "BOTTOM_AXIS",
          title: "Category",
        },
        {
          position: "LEFT_AXIS",
          title: "Value",
        },
      ],
      domains: [
        {
          domain: {
            sourceRange: toSourceRange({
              sheetId: normalized.sheetId,
              startRow: startDataRow,
              endRow: normalized.endRow,
              startColumn: categoryColumn,
              endColumn: categoryColumn + 1,
            }),
          },
        },
      ],
      series,
    },
  };
}

function buildChartRequest(payload = {}) {
  const spec = buildChartSpec(payload);
  const position = payload.position || {};
  return {
    addChart: {
      chart: {
        spec,
        position: {
          overlayPosition: {
            anchorCell: {
              sheetId: Number(position.sheetId || payload.range?.sheetId || 0),
              rowIndex: Number(position.rowIndex || payload.range?.endRow || 0),
              columnIndex: Number(position.columnIndex || payload.range?.startColumn || 0),
            },
            offsetXPixels: Number(position.offsetXPixels || 12),
            offsetYPixels: Number(position.offsetYPixels || 18),
            widthPixels: Number(position.widthPixels || 680),
            heightPixels: Number(position.heightPixels || 320),
          },
        },
      },
    },
  };
}

module.exports = {
  buildChartRequest,
  buildChartSpec,
  chartTypeForSpec,
  serializeChart,
};
