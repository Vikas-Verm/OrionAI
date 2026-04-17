"use strict";

const {
  applySpreadsheetOperations,
  createBlankSpreadsheet,
  deleteSpreadsheetWorkspace,
  duplicateSpreadsheet,
  exportSpreadsheet,
  getSpreadsheetWorkspace,
  listRecentSpreadsheets,
  renameSpreadsheet,
  shareSpreadsheetWorkspace,
} = require("../services/googleSheetsService");
const { buildSheetAiContext } = require("../services/googleSheets/context");
const { chatCompleteNoSystem } = require("../services/llmService");

function buildSheetsPrompt({ action = "chat", question = "", context = {} }) {
  const instructionMap = {
    chat:
      "Answer the user about the active spreadsheet only. Prefer direct numeric answers and concrete spreadsheet guidance when the provided context supports it.",
    analyze_data:
      "Analyze the active spreadsheet context, calling out totals, trends, anomalies, and next steps where helpful. Use concrete numbers from the provided data whenever possible.",
    summarize_sheet:
      "Summarize the active spreadsheet clearly with the most important numbers and takeaways. Keep the response compact but specific.",
    formula_help:
      "Explain the active cell formula step by step, including the references it uses and what result it produces.",
    forecast:
      "Forecast the next 3 periods if the data supports it, stating assumptions clearly and avoiding overclaiming.",
  };

  return [
    "You are OrionAI's Google Sheets copilot.",
    "Use only the provided active spreadsheet context. Do not answer as if you were working on Google Docs, Slides, or a generic app.",
    instructionMap[action] || instructionMap.chat,
    `Workbook: ${context.workbookTitle || "Untitled spreadsheet"}`,
    `Active sheet: ${context.activeSheetTitle || "Sheet1"}`,
    context.activeRange ? `Active range: ${context.activeRange}` : "",
    context.activeCell ? `Active cell: ${context.activeCell}` : "",
    context.activeFormula ? `Active formula: ${context.activeFormula}` : "",
    context.activeCellDisplay
      ? `Active cell display value: ${context.activeCellDisplay}`
      : "",
    context.numericSummary?.length
      ? `Numeric summary:\n- ${context.numericSummary.join("\n- ")}`
      : "",
    context.chartSummary ? `Charts in sheet: ${context.chartSummary}` : "",
    context.selectionTable ? `Selected range preview:\n${context.selectionTable}` : "",
    context.sheetPreviewTable ? `Sheet preview:\n${context.sheetPreviewTable}` : "",
    question ? `User request: ${question}` : "",
    "Keep the response grounded in the current sheet, concise, and actionable.",
    "If the context is insufficient for a confident answer, say exactly what is missing instead of guessing.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

async function listGoogleSheets(req, res) {
  try {
    const spreadsheets = await listRecentSpreadsheets(req.user?.username, {
      limit: req.query.limit,
    });
    res.json({ ok: true, spreadsheets });
  } catch (err) {
    console.error("List Google Sheets error:", err.message);
    res.status(err.statusCode || 400).json({ ok: false, error: err.message });
  }
}

async function getGoogleSheet(req, res) {
  try {
    const workspace = await getSpreadsheetWorkspace(
      req.user?.username,
      req.params.id,
      {
        sheetId: req.query.sheetId,
      }
    );
    res.json(workspace);
  } catch (err) {
    console.error("Get Google Sheet error:", err.message);
    res.status(err.statusCode || 400).json({ ok: false, error: err.message });
  }
}

async function createGoogleSheet(req, res) {
  try {
    const workspace = await createBlankSpreadsheet(req.user?.username, req.body || {});
    res.status(201).json(workspace);
  } catch (err) {
    console.error("Create Google Sheet error:", err.message);
    res.status(err.statusCode || 400).json({ ok: false, error: err.message });
  }
}

async function updateGoogleSheet(req, res) {
  try {
    const title = String(req.body?.title || "").trim();
    if (!title) {
      return res.status(400).json({ ok: false, error: "A title is required." });
    }

    const workspace = await renameSpreadsheet(
      req.user?.username,
      req.params.id,
      title
    );
    res.json({ ok: true, ...workspace });
  } catch (err) {
    console.error("Rename Google Sheet error:", err.message);
    res.status(err.statusCode || 400).json({ ok: false, error: err.message });
  }
}

async function duplicateGoogleSheet(req, res) {
  try {
    const workspace = await duplicateSpreadsheet(
      req.user?.username,
      req.params.id,
      req.body || {}
    );
    res.status(201).json({ ok: true, ...workspace });
  } catch (err) {
    console.error("Duplicate Google Sheet error:", err.message);
    res.status(err.statusCode || 400).json({ ok: false, error: err.message });
  }
}

async function mutateGoogleSheet(req, res) {
  try {
    const workspace = await applySpreadsheetOperations(
      req.user?.username,
      req.params.id,
      req.body || {}
    );
    res.json({ ok: true, ...workspace });
  } catch (err) {
    console.error("Mutate Google Sheet error:", err.message);
    res.status(err.statusCode || 400).json({ ok: false, error: err.message });
  }
}

async function runGoogleSheetAi(req, res) {
  try {
    if (req.body?.scope && req.body.scope !== "google_sheets") {
      return res.status(400).json({
        ok: false,
        error: "AI scope mismatch for Google Sheets request.",
      });
    }

    const context = buildSheetAiContext(req.body || {});
    const action = String(req.body?.action || "chat").trim() || "chat";
    const question = String(req.body?.question || "").trim();
    const prompt = buildSheetsPrompt({ action, question, context });
    const result = await chatCompleteNoSystem(prompt, 1600, 0.2);

    res.json({
      ok: true,
      result,
      context,
    });
  } catch (err) {
    console.error("Google Sheets AI error:", err.message);
    res.status(err.statusCode || 400).json({ ok: false, error: err.message });
  }
}

async function shareGoogleSheet(req, res) {
  try {
    const result = await shareSpreadsheetWorkspace(
      req.user?.username,
      req.params.id,
      req.body || {}
    );
    res.json(result);
  } catch (err) {
    console.error("Share Google Sheet error:", err.message);
    res.status(err.statusCode || 400).json({ ok: false, error: err.message });
  }
}

async function exportGoogleSheet(req, res) {
  try {
    const result = await exportSpreadsheet(
      req.user?.username,
      req.params.id,
      req.body || {}
    );

    res.setHeader("Content-Type", result.mimeType);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${String(result.filename || "spreadsheet").replace(
        /"/g,
        ""
      )}.${result.extension}"`
    );
    res.send(result.buffer);
  } catch (err) {
    console.error("Export Google Sheet error:", err.message);
    res.status(err.statusCode || 400).json({ ok: false, error: err.message });
  }
}

async function deleteGoogleSheet(req, res) {
  try {
    const result = await deleteSpreadsheetWorkspace(
      req.user?.username,
      req.params.id
    );
    res.json(result);
  } catch (err) {
    console.error("Delete Google Sheet error:", err.message);
    res.status(err.statusCode || 400).json({ ok: false, error: err.message });
  }
}

module.exports = {
  createGoogleSheet,
  deleteGoogleSheet,
  duplicateGoogleSheet,
  exportGoogleSheet,
  getGoogleSheet,
  listGoogleSheets,
  mutateGoogleSheet,
  runGoogleSheetAi,
  shareGoogleSheet,
  updateGoogleSheet,
};
