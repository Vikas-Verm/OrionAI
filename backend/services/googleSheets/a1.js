"use strict";

function columnIndexToLetter(index) {
  let value = Number(index || 0);
  if (!Number.isFinite(value) || value < 0) return "A";

  let result = "";
  while (value >= 0) {
    result = String.fromCharCode((value % 26) + 65) + result;
    value = Math.floor(value / 26) - 1;
  }
  return result || "A";
}

function columnLetterToIndex(label = "") {
  const normalized = String(label || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z]/g, "");

  if (!normalized) return 0;

  let value = 0;
  for (const char of normalized) {
    value = value * 26 + (char.charCodeAt(0) - 64);
  }
  return Math.max(0, value - 1);
}

function quoteSheetTitle(title = "") {
  let value = String(title || "").trim();
  if (!value) return "Sheet1";
  if (value.startsWith("'") && value.endsWith("'")) {
    value = value.slice(1, -1).replace(/''/g, "'");
  }
  return `'${value.replace(/'/g, "''")}'`;
}

function buildA1Cell(rowIndex = 0, columnIndex = 0) {
  return `${columnIndexToLetter(columnIndex)}${Number(rowIndex || 0) + 1}`;
}

function gridRangeToA1(range = {}, sheetTitle = "") {
  const startRow = Math.max(0, Number(range.startRow || 0));
  const endRow = Math.max(startRow + 1, Number(range.endRow || startRow + 1));
  const startColumn = Math.max(0, Number(range.startColumn || 0));
  const endColumn = Math.max(
    startColumn + 1,
    Number(range.endColumn || startColumn + 1)
  );

  const a1 = `${buildA1Cell(startRow, startColumn)}:${buildA1Cell(
    endRow - 1,
    endColumn - 1
  )}`;

  return sheetTitle ? `${quoteSheetTitle(sheetTitle)}!${a1}` : a1;
}

function buildGridRange(range = {}) {
  return {
    sheetId: Number(range.sheetId),
    startRowIndex: Math.max(0, Number(range.startRow || 0)),
    endRowIndex: Math.max(
      Number(range.startRow || 0) + 1,
      Number(range.endRow || range.startRow || 1)
    ),
    startColumnIndex: Math.max(0, Number(range.startColumn || 0)),
    endColumnIndex: Math.max(
      Number(range.startColumn || 0) + 1,
      Number(range.endColumn || range.startColumn || 1)
    ),
  };
}

function parseCellRef(value = "") {
  const match = String(value || "")
    .trim()
    .match(/^([A-Z]+)(\d+)$/i);

  if (!match) return null;

  return {
    row: Math.max(0, Number(match[2]) - 1),
    column: columnLetterToIndex(match[1]),
  };
}

function parseA1Range(value = "") {
  const input = String(value || "").trim();
  if (!input) return null;

  const [sheetPart, rangePartRaw] = input.includes("!")
    ? input.split(/!(.+)/)
    : ["", input];
  const rangePart = String(rangePartRaw || "").trim() || "A1";
  const [startRef, endRef = startRef] = rangePart.split(":");
  const start = parseCellRef(startRef);
  const end = parseCellRef(endRef);

  if (!start || !end) return null;

  return {
    sheetTitle: sheetPart
      ? sheetPart.replace(/^'/, "").replace(/'$/, "").replace(/''/g, "'")
      : "",
    startRow: Math.min(start.row, end.row),
    endRow: Math.max(start.row, end.row) + 1,
    startColumn: Math.min(start.column, end.column),
    endColumn: Math.max(start.column, end.column) + 1,
  };
}

module.exports = {
  buildA1Cell,
  buildGridRange,
  columnIndexToLetter,
  columnLetterToIndex,
  gridRangeToA1,
  parseA1Range,
  parseCellRef,
  quoteSheetTitle,
};
