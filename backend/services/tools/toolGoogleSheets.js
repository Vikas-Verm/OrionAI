/**
 * toolGoogleSheets.js — Google Sheets integration tools for OrionAI Agent mode
 *
 * Tools:
 *  - toolGoogleSheetsListSheets()    — list recent spreadsheets
 *  - toolGoogleSheetsGetSheet()      — get a specific spreadsheet's data
 *  - toolGoogleSheetsCreateSheet()   — create a new blank spreadsheet
 *  - toolGoogleSheetsRenameSheet()   — rename a spreadsheet
 *  - toolGoogleSheetsShareSheet()    — share a spreadsheet with someone
 *  - toolGoogleSheetsDeleteSheet()   — trash a spreadsheet
 *  - toolGoogleSheetsSearchSheets()  — search spreadsheets by name/keyword
 *  - toolGoogleSheetsDuplicateSheet()— duplicate a spreadsheet
 *
 * Auth: OAuth2 via Integration model (type: "google_sheets")
 */

"use strict";

const {
  listRecentSpreadsheets,
  getSpreadsheetWorkspace,
  createBlankSpreadsheet,
  renameSpreadsheet,
  shareSpreadsheetWorkspace,
  deleteSpreadsheetWorkspace,
  duplicateSpreadsheet,
} = require("../googleSheetsService");

async function toolGoogleSheetsListSheets(params, ctx) {
  const limit = params.limit || 14;
  const sheets = await listRecentSpreadsheets(ctx.userId, { limit });

  return {
    summary: sheets.length
      ? `Found ${sheets.length} recent spreadsheet${sheets.length > 1 ? "s" : ""}`
      : "No spreadsheets found",
    richGoogleSheets: sheets.map((s) => ({
      id: s.spreadsheetId,
      title: s.title,
      modifiedTime: s.modifiedTime,
      webViewUrl: s.webViewUrl,
      ownerName: s.ownerName,
      ownerEmail: s.ownerEmail,
      canEdit: s.permissions?.canEdit || false,
    })),
  };
}

async function toolGoogleSheetsGetSheet(params, ctx) {
  const { spreadsheetId } = params;
  if (!spreadsheetId)
    throw new Error("google_sheets_get requires a spreadsheetId");

  const workspace = await getSpreadsheetWorkspace(ctx.userId, spreadsheetId);

  const activeSheet = workspace.sheets?.find(
    (s) => s.sheetId === workspace.activeSheetId
  );
  const rowCount = activeSheet?.loadedRowCount || 0;
  const colCount = activeSheet?.loadedColumnCount || 0;

  ctx.lastGoogleSheet = {
    spreadsheetId: workspace.spreadsheetId,
    title: workspace.title,
    webViewUrl: workspace.webViewUrl,
  };

  return {
    summary: `Opened "${workspace.title}" — ${workspace.sheets?.length || 0} sheet(s), active sheet: ${rowCount} rows × ${colCount} cols`,
    richGoogleSheet: {
      id: workspace.spreadsheetId,
      title: workspace.title,
      webViewUrl: workspace.webViewUrl,
      sheetCount: workspace.sheets?.length || 0,
      sheetNames: (workspace.sheets || []).map((s) => s.title),
      canEdit: workspace.permissions?.canEdit || false,
    },
  };
}

async function toolGoogleSheetsCreateSheet(params, ctx) {
  const title = params.title || "Untitled spreadsheet";
  const workspace = await createBlankSpreadsheet(ctx.userId, { title });

  ctx.lastGoogleSheet = {
    spreadsheetId: workspace.spreadsheetId,
    title: workspace.title,
    webViewUrl: workspace.webViewUrl,
  };

  return {
    summary: `Created spreadsheet "${workspace.title}"`,
    richGoogleSheet: {
      id: workspace.spreadsheetId,
      title: workspace.title,
      webViewUrl: workspace.webViewUrl,
      sheetCount: workspace.sheets?.length || 1,
      sheetNames: (workspace.sheets || []).map((s) => s.title),
      canEdit: true,
    },
  };
}

async function toolGoogleSheetsRenameSheet(params, ctx) {
  const spreadsheetId =
    params.spreadsheetId || ctx.lastGoogleSheet?.spreadsheetId;
  if (!spreadsheetId)
    throw new Error("google_sheets_rename requires a spreadsheetId");

  const title = params.title || "Untitled spreadsheet";
  const workspace = await renameSpreadsheet(ctx.userId, spreadsheetId, title);

  ctx.lastGoogleSheet = {
    spreadsheetId: workspace.spreadsheetId,
    title: workspace.title,
    webViewUrl: workspace.webViewUrl,
  };

  return {
    summary: `Renamed spreadsheet to "${workspace.title}"`,
    richGoogleSheet: {
      id: workspace.spreadsheetId,
      title: workspace.title,
      webViewUrl: workspace.webViewUrl,
      canEdit: workspace.permissions?.canEdit || false,
    },
  };
}

async function toolGoogleSheetsShareSheet(params, ctx) {
  const spreadsheetId =
    params.spreadsheetId || ctx.lastGoogleSheet?.spreadsheetId;
  if (!spreadsheetId)
    throw new Error("google_sheets_share requires a spreadsheetId");

  const result = await shareSpreadsheetWorkspace(ctx.userId, spreadsheetId, {
    email: params.email,
    emails: params.emails,
    role: params.role || "writer",
  });

  return {
    summary: `Shared "${result.title}" with ${result.shared?.map((s) => s.email).join(", ")} as ${result.shared?.[0]?.role || params.role || "writer"}`,
    richGoogleSheetShare: {
      title: result.title,
      sharedWith: result.shared,
      link: result.link,
    },
  };
}

async function toolGoogleSheetsDeleteSheet(params, ctx) {
  const spreadsheetId =
    params.spreadsheetId || ctx.lastGoogleSheet?.spreadsheetId;
  if (!spreadsheetId)
    throw new Error("google_sheets_delete requires a spreadsheetId");

  const result = await deleteSpreadsheetWorkspace(ctx.userId, spreadsheetId);

  return {
    summary: `Moved "${result.title}" to trash`,
  };
}

async function toolGoogleSheetsSearchSheets(params, ctx) {
  const rawQuery = params.query || "";
  const sheets = await listRecentSpreadsheets(ctx.userId, { limit: 20 });

  const NOISE = new Set(["sheet", "sheets", "spreadsheet", "spreadsheets", "google", "from", "my", "the", "a", "an", "in", "of", "for", "get", "fetch", "find", "search", "show"]);
  const queryWords = rawQuery.toLowerCase().split(/\s+/).filter((w) => w && !NOISE.has(w));
  const lowerQuery = queryWords.join(" ");

  const matched = lowerQuery
    ? sheets.filter((s) => {
        const title = s.title.toLowerCase();
        if (title.includes(lowerQuery)) return true;
        return queryWords.every((w) => title.includes(w));
      })
    : sheets;

  return {
    summary: matched.length
      ? `Found ${matched.length} spreadsheet${matched.length > 1 ? "s" : ""} matching "${lowerQuery || rawQuery}"`
      : `No spreadsheets found matching "${lowerQuery || rawQuery}"`,
    richGoogleSheets: matched.map((s) => ({
      id: s.spreadsheetId,
      title: s.title,
      modifiedTime: s.modifiedTime,
      webViewUrl: s.webViewUrl,
      ownerName: s.ownerName,
      ownerEmail: s.ownerEmail,
      canEdit: s.permissions?.canEdit || false,
    })),
  };
}

async function toolGoogleSheetsDuplicateSheet(params, ctx) {
  const spreadsheetId =
    params.spreadsheetId || ctx.lastGoogleSheet?.spreadsheetId;
  if (!spreadsheetId)
    throw new Error("google_sheets_duplicate requires a spreadsheetId");

  const workspace = await duplicateSpreadsheet(ctx.userId, spreadsheetId, {
    title: params.title,
  });

  ctx.lastGoogleSheet = {
    spreadsheetId: workspace.spreadsheetId,
    title: workspace.title,
    webViewUrl: workspace.webViewUrl,
  };

  return {
    summary: `Duplicated spreadsheet as "${workspace.title}"`,
    richGoogleSheet: {
      id: workspace.spreadsheetId,
      title: workspace.title,
      webViewUrl: workspace.webViewUrl,
      sheetCount: workspace.sheets?.length || 1,
      sheetNames: (workspace.sheets || []).map((s) => s.title),
      canEdit: true,
    },
  };
}

module.exports = {
  toolGoogleSheetsListSheets,
  toolGoogleSheetsGetSheet,
  toolGoogleSheetsCreateSheet,
  toolGoogleSheetsRenameSheet,
  toolGoogleSheetsShareSheet,
  toolGoogleSheetsDeleteSheet,
  toolGoogleSheetsSearchSheets,
  toolGoogleSheetsDuplicateSheet,
};
