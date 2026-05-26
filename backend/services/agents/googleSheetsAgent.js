/**
 * googleSheetsAgent.js
 *
 * Sub-agent for all Google Sheets operations.
 */

const BaseAgent = require("./baseAgent");
const {
  toolGoogleSheetsListSheets,
  toolGoogleSheetsGetSheet,
  toolGoogleSheetsCreateSheet,
  toolGoogleSheetsRenameSheet,
  toolGoogleSheetsShareSheet,
  toolGoogleSheetsDeleteSheet,
  toolGoogleSheetsSearchSheets,
  toolGoogleSheetsDuplicateSheet,
} = require("../tools/toolGoogleSheets");

const TOOLS = [
  "google_sheets_list",
  "google_sheets_get",
  "google_sheets_create",
  "google_sheets_rename",
  "google_sheets_share",
  "google_sheets_delete",
  "google_sheets_search",
  "google_sheets_duplicate",
];

class GoogleSheetsAgent extends BaseAgent {
  constructor() {
    super("google_sheets", TOOLS);
  }

  async execute(tool, params, ctx) {
    switch (tool) {
      case "google_sheets_list":
        return toolGoogleSheetsListSheets(params, ctx);

      case "google_sheets_get":
        return toolGoogleSheetsGetSheet(params, ctx);

      case "google_sheets_create":
        return toolGoogleSheetsCreateSheet(params, ctx);

      case "google_sheets_rename":
        return toolGoogleSheetsRenameSheet(params, ctx);

      case "google_sheets_share":
        return toolGoogleSheetsShareSheet(params, ctx);

      case "google_sheets_delete":
        return toolGoogleSheetsDeleteSheet(params, ctx);

      case "google_sheets_search":
        return toolGoogleSheetsSearchSheets(params, ctx);

      case "google_sheets_duplicate":
        return toolGoogleSheetsDuplicateSheet(params, ctx);

      default:
        throw new Error(`GoogleSheetsAgent: unknown tool "${tool}"`);
    }
  }
}

module.exports = new GoogleSheetsAgent();
