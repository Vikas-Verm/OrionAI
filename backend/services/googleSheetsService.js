"use strict";

const { google } = require("googleapis");
const Integration = require("../models/Integration");
const { getOAuthConfig } = require("./googleOAuthConfig");
const {
  buildGridRange,
  gridRangeToA1,
  quoteSheetTitle,
} = require("./googleSheets/a1");
const {
  assertPermission,
  mapGoogleFilePermissions,
} = require("./googleSheets/permissions");
const {
  buildCellFormatUpdate,
  normalizeCellFormat,
} = require("./googleSheets/formatting");
const {
  buildChartRequest,
  buildChartSpec,
  serializeChart,
} = require("./googleSheets/charts");

const GOOGLE_SHEETS_MIME = "application/vnd.google-apps.spreadsheet";
const DEFAULT_VIEWPORT_ROWS = 180;
const DEFAULT_VIEWPORT_COLUMNS = 24;
const MAX_VIEWPORT_ROWS = 420;
const MAX_VIEWPORT_COLUMNS = 52;
const DEFAULT_ROW_HEIGHT = 21;
const DEFAULT_COLUMN_WIDTH = 100;

function normalizeColor(color = {}) {
  const rgb = color?.rgbColor || color || {};
  const toChannel = (value) =>
    Math.max(0, Math.min(255, Math.round(Number(value || 0) * 255)));
  return `#${[rgb.red, rgb.green, rgb.blue]
    .map((value) => toChannel(value).toString(16).padStart(2, "0"))
    .join("")}`;
}

function mapTabColor(sheet = {}) {
  const color =
    sheet?.properties?.tabColorStyle?.rgbColor || sheet?.properties?.tabColor || null;
  return color ? normalizeColor(color) : "";
}

function normalizePrimitiveValue(value = {}) {
  if (value == null || typeof value !== "object") return value;
  if (value.stringValue != null) return value.stringValue;
  if (value.numberValue != null) return value.numberValue;
  if (value.boolValue != null) return value.boolValue;
  if (value.formulaValue != null) return value.formulaValue;
  if (value.errorValue?.message) return value.errorValue.message;
  return "";
}

function normalizeCell(cell = {}) {
  const userValue = cell.userEnteredValue || {};
  const effectiveValue = cell.effectiveValue || {};
  const formula = String(userValue.formulaValue || "").trim();
  const rawValue = formula || normalizePrimitiveValue(userValue);
  const displayValue =
    cell.formattedValue != null && cell.formattedValue !== ""
      ? cell.formattedValue
      : normalizePrimitiveValue(effectiveValue);

  const input =
    rawValue == null || rawValue === ""
      ? ""
      : typeof rawValue === "string"
        ? rawValue
        : String(rawValue);

  return {
    raw: input,
    input,
    display:
      displayValue == null || displayValue === ""
        ? input
        : String(displayValue),
    formula,
    effectiveValue: normalizePrimitiveValue(effectiveValue),
    note: cell.note || "",
    hyperlink: cell.hyperlink || "",
    format: normalizeCellFormat(cell),
  };
}

function emptyCell() {
  return {
    raw: "",
    input: "",
    display: "",
    formula: "",
    effectiveValue: "",
    note: "",
    hyperlink: "",
    format: normalizeCellFormat({}),
  };
}

function normalizeSheetMeta(sheet = {}) {
  const props = sheet.properties || {};
  const grid = props.gridProperties || {};

  return {
    sheetId: Number(props.sheetId),
    title: props.title || "Sheet",
    index: Number(props.index || 0),
    hidden: Boolean(props.hidden),
    rowCount: Number(grid.rowCount || DEFAULT_VIEWPORT_ROWS),
    columnCount: Number(grid.columnCount || DEFAULT_VIEWPORT_COLUMNS),
    frozenRowCount: Number(grid.frozenRowCount || 0),
    frozenColumnCount: Number(grid.frozenColumnCount || 0),
    tabColor: mapTabColor(sheet),
    basicFilter: sheet.basicFilter
      ? {
          range: {
            sheetId: Number(sheet.basicFilter.range?.sheetId || props.sheetId || 0),
            startRow: Number(sheet.basicFilter.range?.startRowIndex || 0),
            endRow: Number(sheet.basicFilter.range?.endRowIndex || 0),
            startColumn: Number(sheet.basicFilter.range?.startColumnIndex || 0),
            endColumn: Number(sheet.basicFilter.range?.endColumnIndex || 0),
          },
        }
      : null,
  };
}

function mergeForActiveSheet(merge = {}, sheetId = 0) {
  if (Number(merge.sheetId || sheetId) !== Number(sheetId)) return null;
  return {
    sheetId: Number(merge.sheetId || sheetId),
    startRow: Number(merge.startRowIndex || 0),
    endRow: Number(merge.endRowIndex || 0),
    startColumn: Number(merge.startColumnIndex || 0),
    endColumn: Number(merge.endColumnIndex || 0),
  };
}

function normalizeSheetData(activeSheet = {}, metaSheet = {}) {
  const meta = normalizeSheetMeta(metaSheet);
  const data = activeSheet.data?.[0] || {};
  const rowData = Array.isArray(data.rowData) ? data.rowData : [];
  const rowCount = Math.min(
    Math.max(meta.rowCount, rowData.length, DEFAULT_VIEWPORT_ROWS),
    MAX_VIEWPORT_ROWS
  );
  const columnCount = Math.min(
    Math.max(
      meta.columnCount,
      ...rowData.map((row) => (row?.values || []).length),
      DEFAULT_VIEWPORT_COLUMNS
    ),
    MAX_VIEWPORT_COLUMNS
  );

  const rowHeights = Array.from({ length: rowCount }, (_, index) =>
    Number(data.rowMetadata?.[index]?.pixelSize || DEFAULT_ROW_HEIGHT)
  );
  const columnWidths = Array.from({ length: columnCount }, (_, index) =>
    Number(data.columnMetadata?.[index]?.pixelSize || DEFAULT_COLUMN_WIDTH)
  );
  const hiddenRows = Array.from({ length: rowCount }, (_, index) =>
    Boolean(
      data.rowMetadata?.[index]?.hiddenByFilter ||
        data.rowMetadata?.[index]?.hiddenByUser
    )
  );

  const cells = Array.from({ length: rowCount }, (_, rowIndex) =>
    Array.from({ length: columnCount }, (_, columnIndex) => {
      const cell = rowData[rowIndex]?.values?.[columnIndex];
      return cell ? normalizeCell(cell) : emptyCell();
    })
  );

  const merges = (activeSheet.merges || [])
    .map((merge) => mergeForActiveSheet(merge, meta.sheetId))
    .filter(Boolean);

  return {
    ...meta,
    loadedRowCount: rowCount,
    loadedColumnCount: columnCount,
    rowHeights,
    columnWidths,
    hiddenRows,
    cells,
    merges,
    charts: (activeSheet.charts || []).map(serializeChart),
  };
}

async function getGoogleSheetsIntegration(userId) {
  return Integration.findOne({ userId, type: "google_sheets" });
}

async function getAuthorizedClient(userId) {
  const integration = await getGoogleSheetsIntegration(userId);
  if (!integration?.googleSheets) {
    throw new Error("Google Sheets is not connected.");
  }

  const oauth = getOAuthConfig("google_sheets", integration.googleSheets || {});
  if (!oauth.clientId || !oauth.clientSecret) {
    throw new Error("Google Sheets OAuth credentials are missing.");
  }

  const auth = new google.auth.OAuth2(
    oauth.clientId,
    oauth.clientSecret,
    oauth.redirectUri
  );

  auth.setCredentials({
    access_token: integration.googleSheets.accessToken || undefined,
    refresh_token: integration.googleSheets.refreshToken || undefined,
    expiry_date: integration.googleSheets.expiresAt
      ? new Date(integration.googleSheets.expiresAt).getTime()
      : undefined,
  });

  const expiresSoon =
    !auth.credentials.access_token ||
    !auth.credentials.expiry_date ||
    auth.credentials.expiry_date - Date.now() < 60_000;

  if (expiresSoon && integration.googleSheets.refreshToken) {
    const refreshed = await auth.refreshAccessToken();
    auth.setCredentials({
      ...auth.credentials,
      ...refreshed.credentials,
      refresh_token: integration.googleSheets.refreshToken,
    });
  }

  const credentials = auth.credentials || {};
  const nextAccessToken =
    credentials.access_token || integration.googleSheets.accessToken;
  const nextExpiresAt = credentials.expiry_date
    ? new Date(credentials.expiry_date)
    : integration.googleSheets.expiresAt || null;

  if (
    nextAccessToken !== integration.googleSheets.accessToken ||
    String(nextExpiresAt || "") !== String(integration.googleSheets.expiresAt || "")
  ) {
    await Integration.findOneAndUpdate(
      { userId, type: "google_sheets" },
      {
        $set: {
          "googleSheets.accessToken": nextAccessToken || "",
          "googleSheets.expiresAt": nextExpiresAt,
          updatedAt: new Date(),
        },
      }
    );
  }

  return auth;
}

async function getDriveAndSheets(userId) {
  const auth = await getAuthorizedClient(userId);
  return {
    auth,
    drive: google.drive({ version: "v3", auth }),
    sheets: google.sheets({ version: "v4", auth }),
  };
}

async function getFileMetadata(drive, spreadsheetId, fields = "") {
  const response = await drive.files.get({
    fileId: spreadsheetId,
    fields,
    supportsAllDrives: true,
  });
  return response.data || {};
}

async function listRecentSpreadsheets(userId, { limit = 14 } = {}) {
  const { drive } = await getDriveAndSheets(userId);
  const response = await drive.files.list({
    q: `mimeType='${GOOGLE_SHEETS_MIME}' and trashed=false`,
    orderBy: "modifiedTime desc",
    pageSize: Math.min(Math.max(Number(limit) || 14, 1), 50),
    fields:
      "files(id,name,modifiedTime,webViewLink,iconLink,owners(displayName,emailAddress),capabilities(canEdit,canRename,canShare,canTrash,canDelete,canComment,canDownload,canModifyContent,canCopy))",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });

  return (response.data.files || []).map((file) => ({
    spreadsheetId: file.id,
    title: file.name,
    modifiedTime: file.modifiedTime,
    webViewUrl: file.webViewLink,
    iconUrl: file.iconLink,
    ownerName: file.owners?.[0]?.displayName || "",
    ownerEmail: file.owners?.[0]?.emailAddress || "",
    permissions: mapGoogleFilePermissions(file),
  }));
}

async function getActiveSheetMetadata(sheetsApi, spreadsheetId, requestedSheetId) {
  const metadataResponse = await sheetsApi.spreadsheets.get({
    spreadsheetId,
    fields:
      "spreadsheetId,properties(title,timeZone),sheets(properties(sheetId,title,index,hidden,gridProperties(rowCount,columnCount,frozenRowCount,frozenColumnCount),tabColor,tabColorStyle),basicFilter,charts(chartId,spec,position))",
  });

  const metadata = metadataResponse.data || {};
  const allSheets = Array.isArray(metadata.sheets) ? metadata.sheets : [];
  if (!allSheets.length) {
    throw new Error("This spreadsheet does not contain any sheets.");
  }

  const activeMeta =
    allSheets.find(
      (sheet) =>
        Number(sheet.properties?.sheetId || 0) === Number(requestedSheetId || 0)
    ) || allSheets[0];

  return {
    metadata,
    allSheets,
    activeMeta,
  };
}

function buildViewportGridRange(activeMeta = {}) {
  const grid = activeMeta.properties?.gridProperties || {};
  const viewportRows = Math.min(
    Math.max(DEFAULT_VIEWPORT_ROWS, grid.frozenRowCount || 0),
    Math.max(DEFAULT_VIEWPORT_ROWS, Number(grid.rowCount || MAX_VIEWPORT_ROWS)),
    MAX_VIEWPORT_ROWS
  );
  const viewportColumns = Math.min(
    Math.max(DEFAULT_VIEWPORT_COLUMNS, grid.frozenColumnCount || 0),
    Math.max(DEFAULT_VIEWPORT_COLUMNS, Number(grid.columnCount || MAX_VIEWPORT_COLUMNS)),
    MAX_VIEWPORT_COLUMNS
  );

  return {
    sheetId: Number(activeMeta.properties?.sheetId || 0),
    startRowIndex: 0,
    endRowIndex: viewportRows,
    startColumnIndex: 0,
    endColumnIndex: viewportColumns,
  };
}

async function getSpreadsheetWorkspace(userId, spreadsheetId, options = {}) {
  const { drive, sheets } = await getDriveAndSheets(userId);
  const [{ metadata, allSheets, activeMeta }, fileMetadata] = await Promise.all([
    getActiveSheetMetadata(sheets, spreadsheetId, options.sheetId),
    getFileMetadata(
      drive,
      spreadsheetId,
      "id,name,modifiedTime,webViewLink,iconLink,capabilities(canEdit,canRename,canShare,canTrash,canDelete,canComment,canDownload,canModifyContent,canCopy)"
    ),
  ]);

  const viewportRange = buildViewportGridRange(activeMeta);
  const detailResponse = await sheets.spreadsheets.getByDataFilter({
    spreadsheetId,
    requestBody: {
      includeGridData: true,
      dataFilters: [
        {
          gridRange: viewportRange,
        },
      ],
    },
  });

  const detailWorkbook = detailResponse.data || {};
  const detailSheet =
    (detailWorkbook.sheets || []).find(
      (sheet) =>
        Number(sheet.properties?.sheetId || 0) ===
        Number(activeMeta.properties?.sheetId || 0)
    ) || detailWorkbook.sheets?.[0] || {};

  const sheetsList = allSheets
    .map((sheet) => {
      const meta = normalizeSheetMeta(sheet);
      if (meta.sheetId === Number(activeMeta.properties?.sheetId || 0)) {
        return normalizeSheetData(detailSheet, sheet);
      }
      return {
        ...meta,
        loadedRowCount: 0,
        loadedColumnCount: 0,
        rowHeights: [],
        columnWidths: [],
        hiddenRows: [],
        cells: [],
        merges: [],
        charts: [],
      };
    })
    .sort((left, right) => left.index - right.index);

  return {
    spreadsheetId,
    title:
      fileMetadata.name || metadata.properties?.title || "Untitled spreadsheet",
    timeZone: metadata.properties?.timeZone || "Asia/Kolkata",
    lastSyncedAt: fileMetadata.modifiedTime || null,
    webViewUrl:
      fileMetadata.webViewLink ||
      `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
    iconUrl: fileMetadata.iconLink || null,
    permissions: mapGoogleFilePermissions(fileMetadata),
    sheets: sheetsList,
    activeSheetId: Number(activeMeta.properties?.sheetId || sheetsList[0]?.sheetId || 0),
  };
}

async function createBlankSpreadsheet(userId, { title = "Untitled spreadsheet" } = {}) {
  const { sheets } = await getDriveAndSheets(userId);
  const response = await sheets.spreadsheets.create({
    requestBody: {
      properties: {
        title: String(title || "Untitled spreadsheet").trim() || "Untitled spreadsheet",
      },
    },
  });

  const spreadsheetId = response.data.spreadsheetId;
  return getSpreadsheetWorkspace(userId, spreadsheetId);
}

async function renameSpreadsheet(userId, spreadsheetId, title) {
  const { drive } = await getDriveAndSheets(userId);
  const fileMetadata = await getFileMetadata(
    drive,
    spreadsheetId,
    "id,capabilities(canEdit,canRename,canShare,canTrash,canDelete,canComment,canDownload,canModifyContent,canCopy)"
  );
  const permissions = mapGoogleFilePermissions(fileMetadata);
  assertPermission(
    permissions,
    "canRename",
    "You do not have permission to rename this spreadsheet."
  );

  await drive.files.update({
    fileId: spreadsheetId,
    requestBody: {
      name: String(title || "Untitled spreadsheet").trim() || "Untitled spreadsheet",
    },
    supportsAllDrives: true,
  });

  return getSpreadsheetWorkspace(userId, spreadsheetId);
}

async function duplicateSpreadsheet(userId, spreadsheetId, { title = "" } = {}) {
  const { drive } = await getDriveAndSheets(userId);
  const fileMetadata = await getFileMetadata(
    drive,
    spreadsheetId,
    "id,name,capabilities(canCopy,canDownload,canEdit)"
  );
  const permissions = mapGoogleFilePermissions(fileMetadata);
  if (!permissions.canCopy && !permissions.canDownload && !permissions.canEdit) {
    const error = new Error("You do not have permission to duplicate this spreadsheet.");
    error.statusCode = 403;
    throw error;
  }

  const response = await drive.files.copy({
    fileId: spreadsheetId,
    requestBody: {
      name:
        String(title || "").trim() ||
        `${fileMetadata.name || "Untitled spreadsheet"} copy`,
    },
    fields: "id",
    supportsAllDrives: true,
  });

  return getSpreadsheetWorkspace(userId, response.data.id);
}

function normalizeShareRole(role = "writer") {
  const value = String(role || "writer").trim().toLowerCase();
  return ["writer", "reader", "commenter"].includes(value) ? value : "writer";
}

function normalizeShareEmails(payload = {}) {
  const emails = Array.isArray(payload.emails)
    ? payload.emails
    : String(payload.email || "")
        .split(/[,\n;]/g)
        .map((item) => item.trim());

  return Array.from(
    new Set(emails.map((item) => item.toLowerCase()).filter(Boolean))
  );
}

async function shareSpreadsheetWorkspace(userId, spreadsheetId, payload = {}) {
  const { drive } = await getDriveAndSheets(userId);
  const fileMetadata = await getFileMetadata(
    drive,
    spreadsheetId,
    "id,name,webViewLink,capabilities(canEdit,canRename,canShare,canTrash,canDelete,canComment,canDownload,canModifyContent,canCopy)"
  );
  const permissions = mapGoogleFilePermissions(fileMetadata);
  assertPermission(
    permissions,
    "canShare",
    "You do not have permission to share this spreadsheet."
  );

  const emails = normalizeShareEmails(payload);
  if (!emails.length) {
    throw new Error("At least one email address is required to share this spreadsheet.");
  }

  const role = normalizeShareRole(payload.role);
  const sendNotificationEmail = payload.sendNotificationEmail !== false;
  const shared = [];

  for (const email of emails) {
    const response = await drive.permissions.create({
      fileId: spreadsheetId,
      requestBody: {
        type: "user",
        role,
        emailAddress: email,
      },
      sendNotificationEmail,
      fields: "id,type,role,emailAddress",
      supportsAllDrives: true,
    });

    shared.push({
      email: response.data?.emailAddress || email,
      role: response.data?.role || role,
    });
  }

  return {
    ok: true,
    shared,
    title: fileMetadata.name || "Untitled spreadsheet",
    link:
      fileMetadata.webViewLink ||
      `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
  };
}

function toCsvValue(value = "") {
  const text = String(value == null ? "" : value);
  if (!/[",\n]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

async function buildSheetCsv(sheetsApi, spreadsheetId, sheetTitle = "Sheet1") {
  const response = await sheetsApi.spreadsheets.values.get({
    spreadsheetId,
    range: quoteSheetTitle(sheetTitle),
    majorDimension: "ROWS",
  });
  const rows = Array.isArray(response.data.values) ? response.data.values : [];
  return rows.map((row) => row.map(toCsvValue).join(",")).join("\n");
}

async function exportSpreadsheet(userId, spreadsheetId, payload = {}) {
  const { drive, sheets } = await getDriveAndSheets(userId);
  const fileMetadata = await getFileMetadata(
    drive,
    spreadsheetId,
    "id,name,capabilities(canEdit,canRename,canShare,canTrash,canDelete,canComment,canDownload,canModifyContent,canCopy)"
  );
  const permissions = mapGoogleFilePermissions(fileMetadata);
  assertPermission(
    permissions,
    "canDownload",
    "You do not have permission to download this spreadsheet."
  );

  const format = String(payload.format || "xlsx").trim().toLowerCase();
  if (format === "csv") {
    const workspace = await getSpreadsheetWorkspace(userId, spreadsheetId, {
      sheetId: payload.sheetId,
    });
    const activeSheet =
      workspace.sheets.find(
        (sheet) => Number(sheet.sheetId) === Number(payload.sheetId || workspace.activeSheetId)
      ) || workspace.sheets[0];
    return {
      buffer: Buffer.from(
        await buildSheetCsv(sheets, spreadsheetId, activeSheet?.title || "Sheet1")
      ),
      mimeType: "text/csv",
      extension: "csv",
      filename:
        `${fileMetadata.name || workspace.title || "spreadsheet"}-${activeSheet?.title || "sheet"}`.replace(
          /\s+/g,
          "-"
        ) || "spreadsheet",
    };
  }

  const mimeType =
    format === "pdf"
      ? "application/pdf"
      : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  const extension = format === "pdf" ? "pdf" : "xlsx";
  const response = await drive.files.export(
    {
      fileId: spreadsheetId,
      mimeType,
    },
    {
      responseType: "arraybuffer",
    }
  );

  return {
    buffer: Buffer.from(response.data),
    mimeType,
    extension,
    filename: fileMetadata.name || "spreadsheet",
  };
}

async function deleteSpreadsheetWorkspace(userId, spreadsheetId) {
  const { drive } = await getDriveAndSheets(userId);
  const fileMetadata = await getFileMetadata(
    drive,
    spreadsheetId,
    "id,name,capabilities(canEdit,canRename,canShare,canTrash,canDelete,canComment,canDownload,canModifyContent,canCopy)"
  );
  const permissions = mapGoogleFilePermissions(fileMetadata);
  assertPermission(
    permissions,
    "canDelete",
    "You do not have permission to delete this spreadsheet."
  );

  await drive.files.update({
    fileId: spreadsheetId,
    requestBody: { trashed: true },
    supportsAllDrives: true,
  });

  return {
    ok: true,
    spreadsheetId,
    title: fileMetadata.name || "Untitled spreadsheet",
  };
}

function buildValueRange(sheetTitle, operation = {}) {
  const rows = Array.isArray(operation.rows)
    ? operation.rows.map((row) =>
        Array.isArray(row)
          ? row.map((value) => (value == null ? "" : String(value)))
          : []
      )
    : [];
  const rowCount = rows.length;
  const columnCount = Math.max(
    ...rows.map((row) => row.length),
    1
  );
  const a1 = gridRangeToA1(
    {
      startRow: operation.range?.startRow || 0,
      endRow:
        operation.range?.startRow != null
          ? Number(operation.range.startRow) + rowCount
          : Number(operation.range?.endRow || rowCount),
      startColumn: operation.range?.startColumn || 0,
      endColumn:
        operation.range?.startColumn != null
          ? Number(operation.range.startColumn) + columnCount
          : Number(operation.range?.endColumn || columnCount),
    },
    sheetTitle
  );

  return {
    range: a1,
    values: rows,
  };
}

function resolveNextSheetTitle(existingTitles = [], preferred = "Sheet") {
  const title = String(preferred || "Sheet").trim() || "Sheet";
  if (!existingTitles.includes(title)) return title;
  let counter = 2;
  while (existingTitles.includes(`${title} ${counter}`)) counter += 1;
  return `${title} ${counter}`;
}

async function applySpreadsheetOperations(userId, spreadsheetId, payload = {}) {
  const operations = Array.isArray(payload.operations) ? payload.operations : [];
  if (!operations.length) {
    throw new Error("No sheet operations were provided.");
  }

  const { drive, sheets } = await getDriveAndSheets(userId);
  const [metadataBundle, fileMetadata] = await Promise.all([
    getActiveSheetMetadata(sheets, spreadsheetId, payload.activeSheetId),
    getFileMetadata(
      drive,
      spreadsheetId,
      "id,name,capabilities(canEdit,canRename,canShare,canTrash,canDelete,canComment,canDownload,canModifyContent,canCopy)"
    ),
  ]);

  const permissions = mapGoogleFilePermissions(fileMetadata);
  assertPermission(
    permissions,
    "canEdit",
    "You do not have permission to edit this spreadsheet."
  );

  const sheetMap = new Map(
    (metadataBundle.allSheets || []).map((sheet) => [
      Number(sheet.properties?.sheetId || 0),
      sheet.properties?.title || "Sheet1",
    ])
  );
  const existingTitles = new Set(
    (metadataBundle.allSheets || []).map((sheet) => sheet.properties?.title || "Sheet")
  );

  const valueUpdates = [];
  const clearRanges = [];
  const requests = [];
  let nextActiveSheetId = Number(
    payload.activeSheetId || metadataBundle.activeMeta?.properties?.sheetId || 0
  );
  let pendingReplyActivationIndex = -1;

  for (const operation of operations) {
    const type = String(operation.type || "").trim();

    if (type === "update_cells") {
      const sheetTitle = sheetMap.get(Number(operation.sheetId || operation.range?.sheetId));
      if (!sheetTitle) continue;
      valueUpdates.push(buildValueRange(sheetTitle, operation));
      continue;
    }

    if (type === "clear_cells") {
      const sheetTitle = sheetMap.get(Number(operation.sheetId || operation.range?.sheetId));
      if (!sheetTitle) continue;
      clearRanges.push(gridRangeToA1(operation.range || {}, sheetTitle));
      continue;
    }

    if (type === "format_cells") {
      const update = buildCellFormatUpdate(operation.format || {});
      if (!update.fields) continue;
      requests.push({
        repeatCell: {
          range: buildGridRange(operation.range || {}),
          cell: {
            userEnteredFormat: update.userEnteredFormat,
          },
          fields: update.fields,
        },
      });
      continue;
    }

    if (type === "set_note") {
      requests.push({
        repeatCell: {
          range: buildGridRange(operation.range || {}),
          cell: {
            note: String(operation.note || ""),
          },
          fields: "note",
        },
      });
      continue;
    }

    if (type === "clear_formatting") {
      requests.push({
        repeatCell: {
          range: buildGridRange(operation.range || {}),
          cell: {
            userEnteredFormat: {},
          },
          fields: "userEnteredFormat",
        },
      });
      continue;
    }

    if (type === "resize_dimension") {
      requests.push({
        updateDimensionProperties: {
          range: {
            sheetId: Number(operation.sheetId || 0),
            dimension: String(operation.dimension || "COLUMNS").toUpperCase(),
            startIndex: Number(operation.startIndex || 0),
            endIndex: Number(operation.endIndex || operation.startIndex || 1),
          },
          properties: {
            pixelSize: Number(operation.pixelSize || 120),
          },
          fields: "pixelSize",
        },
      });
      continue;
    }

    if (type === "merge_cells") {
      requests.push({
        mergeCells: {
          range: buildGridRange(operation.range || {}),
          mergeType: "MERGE_ALL",
        },
      });
      continue;
    }

    if (type === "unmerge_cells") {
      requests.push({
        unmergeCells: {
          range: buildGridRange(operation.range || {}),
        },
      });
      continue;
    }

    if (type === "freeze_sheet") {
      requests.push({
        updateSheetProperties: {
          properties: {
            sheetId: Number(operation.sheetId || nextActiveSheetId || 0),
            gridProperties: {
              frozenRowCount: Number(operation.frozenRowCount || 0),
              frozenColumnCount: Number(operation.frozenColumnCount || 0),
            },
          },
          fields: "gridProperties.frozenRowCount,gridProperties.frozenColumnCount",
        },
      });
      continue;
    }

    if (type === "set_basic_filter") {
      requests.push({
        setBasicFilter: {
          filter: {
            range: buildGridRange(
              operation.filter?.range || operation.range || {}
            ),
          },
        },
      });
      continue;
    }

    if (type === "clear_basic_filter") {
      requests.push({
        clearBasicFilter: {
          sheetId: Number(operation.sheetId || nextActiveSheetId || 0),
        },
      });
      continue;
    }

    if (type === "add_sheet") {
      const title = resolveNextSheetTitle(
        Array.from(existingTitles),
        operation.title || "Sheet"
      );
      existingTitles.add(title);
      pendingReplyActivationIndex = requests.length;
      requests.push({
        addSheet: {
          properties: {
            title,
            gridProperties: {
              rowCount: Number(operation.rowCount || 1000),
              columnCount: Number(operation.columnCount || 26),
            },
          },
        },
      });
      continue;
    }

    if (type === "rename_sheet") {
      requests.push({
        updateSheetProperties: {
          properties: {
            sheetId: Number(operation.sheetId || nextActiveSheetId || 0),
            title:
              resolveNextSheetTitle(
                Array.from(
                  new Set(
                    Array.from(existingTitles).filter(
                      (title) =>
                        title !== sheetMap.get(Number(operation.sheetId || nextActiveSheetId || 0))
                    )
                  )
                ),
                operation.title || "Sheet"
              ),
          },
          fields: "title",
        },
      });
      continue;
    }

    if (type === "duplicate_sheet") {
      const sourceSheetId = Number(operation.sheetId || nextActiveSheetId || 0);
      const title = resolveNextSheetTitle(
        Array.from(existingTitles),
        operation.title || `${sheetMap.get(sourceSheetId) || "Sheet"} copy`
      );
      existingTitles.add(title);
      pendingReplyActivationIndex = requests.length;
      requests.push({
        duplicateSheet: {
          sourceSheetId,
          newSheetName: title,
        },
      });
      continue;
    }

    if (type === "delete_sheet") {
      requests.push({
        deleteSheet: {
          sheetId: Number(operation.sheetId || nextActiveSheetId || 0),
        },
      });
      continue;
    }

    if (type === "create_chart") {
      requests.push(
        buildChartRequest({
          chartType: operation.chartType || "column",
          title: operation.title || "Chart",
          range: operation.range || {},
          position: operation.position || {},
        })
      );
      continue;
    }

    if (type === "update_chart") {
      requests.push({
        updateChartSpec: {
          chartId: Number(operation.chartId),
          spec: buildChartSpec({
            chartType: operation.chartType || "column",
            title: operation.title || "Chart",
            range: operation.range || {},
          }),
        },
      });
      continue;
    }

    if (type === "delete_chart") {
      requests.push({
        deleteEmbeddedObject: {
          objectId: Number(operation.chartId),
        },
      });
      continue;
    }
  }

  if (clearRanges.length) {
    await sheets.spreadsheets.values.batchClear({
      spreadsheetId,
      requestBody: {
        ranges: clearRanges,
      },
    });
  }

  if (valueUpdates.length) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: {
        valueInputOption: "USER_ENTERED",
        data: valueUpdates,
      },
    });
  }

  if (requests.length) {
    const response = await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests,
      },
    });

    if (
      pendingReplyActivationIndex !== -1 &&
      response.data?.replies?.[pendingReplyActivationIndex]?.addSheet?.properties?.sheetId
    ) {
      nextActiveSheetId = Number(
        response.data.replies[pendingReplyActivationIndex].addSheet.properties.sheetId
      );
    }

    if (
      pendingReplyActivationIndex !== -1 &&
      response.data?.replies?.[pendingReplyActivationIndex]?.duplicateSheet?.properties?.sheetId
    ) {
      nextActiveSheetId = Number(
        response.data.replies[pendingReplyActivationIndex].duplicateSheet.properties.sheetId
      );
    }
  }

  return getSpreadsheetWorkspace(userId, spreadsheetId, {
    sheetId: nextActiveSheetId || payload.activeSheetId,
  });
}

module.exports = {
  GOOGLE_SHEETS_MIME,
  applySpreadsheetOperations,
  createBlankSpreadsheet,
  deleteSpreadsheetWorkspace,
  duplicateSpreadsheet,
  exportSpreadsheet,
  getAuthorizedClient,
  getGoogleSheetsIntegration,
  getSpreadsheetWorkspace,
  listRecentSpreadsheets,
  renameSpreadsheet,
  shareSpreadsheetWorkspace,
};
