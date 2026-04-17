"use strict";

const { google } = require("googleapis");
const { Readable } = require("stream");
const Integration = require("../models/Integration");
const { getOAuthConfig } = require("./googleOAuthConfig");

const GOOGLE_DOCS_MIME = "application/vnd.google-apps.document";

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function stripTrailingNewline(value = "") {
  return String(value).replace(/\n$/, "");
}

function cssColorFromDocs(color) {
  const rgb = color?.color?.rgbColor;
  if (!rgb) return "";

  const toChannel = (value) => Math.round(Number(value || 0) * 255);
  return `rgb(${toChannel(rgb.red)}, ${toChannel(rgb.green)}, ${toChannel(
    rgb.blue
  )})`;
}

function dimensionToPx(dimension = {}) {
  const magnitude = Number(dimension?.magnitude || 0);
  const unit = String(dimension?.unit || "PT").trim().toUpperCase();
  if (!magnitude) return 0;

  if (unit === "PX") return Math.round(magnitude);
  if (unit === "PT") return Math.round((magnitude * 96) / 72);
  if (unit === "EMU") return Math.round(magnitude / 9525);

  return Math.round(magnitude);
}

function applyInlineTextStyle(text, style = {}) {
  if (!text) return "";

  let html = escapeHtml(text);

  if (style.link?.url) {
    html = `<a href="${escapeHtml(style.link.url)}" target="_blank" rel="noopener noreferrer">${html}</a>`;
  }
  if (style.bold) html = `<strong>${html}</strong>`;
  if (style.italic) html = `<em>${html}</em>`;
  if (style.underline) html = `<u>${html}</u>`;
  if (style.strikethrough) html = `<s>${html}</s>`;

  const inlineStyles = [];
  const foreground = cssColorFromDocs(style.foregroundColor);
  const background = cssColorFromDocs(style.backgroundColor);
  if (foreground) inlineStyles.push(`color: ${foreground}`);
  if (background) inlineStyles.push(`background-color: ${background}`);

  if (inlineStyles.length) {
    html = `<span style="${inlineStyles.join("; ")}">${html}</span>`;
  }

  return html;
}

async function fetchInlineObjectDataUri(auth, inlineObjectId, contentUri, mediaCache) {
  if (!auth || !contentUri) return contentUri || "";

  const cacheKey = inlineObjectId || contentUri;
  if (mediaCache?.has(cacheKey)) {
    return mediaCache.get(cacheKey);
  }

  const response = await auth.request({
    url: contentUri,
    method: "GET",
    responseType: "arraybuffer",
  });

  const contentType =
    response.headers?.["content-type"] || response.headers?.get?.("content-type") || "image/png";
  const buffer = Buffer.isBuffer(response.data)
    ? response.data
    : Buffer.from(response.data);
  const dataUri = `data:${contentType};base64,${buffer.toString("base64")}`;

  if (mediaCache) {
    mediaCache.set(cacheKey, dataUri);
  }

  return dataUri;
}

async function resolveInlineObjectHtml(element = {}, inlineObjects = {}, options = {}) {
  const inlineObjectId = element?.inlineObjectElement?.inlineObjectId;
  if (!inlineObjectId) return "";

  const embeddedObject =
    inlineObjects?.[inlineObjectId]?.inlineObjectProperties?.embeddedObject;
  const image = embeddedObject?.imageProperties;
  const contentUri = image?.contentUri;
  if (!contentUri) return "";

  const title =
    embeddedObject?.title || embeddedObject?.description || "Document image";
  let resolvedSrc = contentUri;
  try {
    resolvedSrc = await fetchInlineObjectDataUri(
      options.auth,
      inlineObjectId,
      contentUri,
      options.mediaCache
    );
  } catch (error) {
    console.warn("Google Docs inline image fetch failed:", error.message);
  }
  const widthPx = dimensionToPx(embeddedObject?.size?.width);
  const heightPx = dimensionToPx(embeddedObject?.size?.height);
  const isChart = /^orionai chart:/i.test(title);
  const figureClass = isChart ? "gd-chart-block" : "gd-image-block";
  const figureWidth = widthPx ? `width:${widthPx}px;` : "";
  const figureStyle = `${figureWidth}max-width:100%;margin:0 auto 18px;`;
  const imageWidthAttr = widthPx ? ` width="${widthPx}"` : "";
  const imageHeightAttr = heightPx ? ` height="${heightPx}"` : "";
  const imageWidthStyle = widthPx ? `width:${widthPx}px;` : "width:100%;";
  const imageHeightStyle = heightPx ? `height:${heightPx}px;` : "height:auto;";
  const caption = "";

  return `<figure class="${figureClass}" contenteditable="false" draggable="true" style="${figureStyle}">
    <img src="${escapeHtml(resolvedSrc)}" alt="${escapeHtml(title)}"${imageWidthAttr}${imageHeightAttr} style="${imageWidthStyle}${imageHeightStyle}max-width:100%;display:block;" />
    ${caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : ""}
  </figure>`;
}

function paragraphTextContent(paragraph = {}) {
  return (paragraph.elements || [])
    .map((element) => stripTrailingNewline(element?.textRun?.content || ""))
    .join("")
    .trim();
}

function slugifyHeading(value = "") {
  return (
    String(value)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "section"
  );
}

function listTypeForParagraph(paragraph = {}, lists = {}) {
  const listId = paragraph?.bullet?.listId;
  const nestingLevel = Number(paragraph?.bullet?.nestingLevel || 0);
  const glyphType =
    lists?.[listId]?.listProperties?.nestingLevels?.[nestingLevel]?.glyphType ||
    "";

  return /DECIMAL|ALPHA|ROMAN|NUMBER/.test(glyphType) ? "ol" : "ul";
}

function paragraphAlignmentStyle(paragraph = {}) {
  const alignment = String(paragraph?.paragraphStyle?.alignment || "").trim();
  if (!alignment) return "";

  const value =
    alignment === "CENTER"
      ? "center"
      : alignment === "END"
        ? "right"
        : alignment === "JUSTIFIED"
          ? "justify"
          : "left";

  return `text-align: ${value};`;
}

function tagForParagraph(paragraph = {}) {
  const namedStyle = String(
    paragraph?.paragraphStyle?.namedStyleType || "NORMAL_TEXT"
  ).trim();

  const tagMap = {
    TITLE: "h1",
    SUBTITLE: "h2",
    HEADING_1: "h1",
    HEADING_2: "h2",
    HEADING_3: "h3",
    HEADING_4: "h4",
    HEADING_5: "h5",
    HEADING_6: "h6",
  };

  return tagMap[namedStyle] || "p";
}

async function renderParagraphElement(element = {}, inlineObjects = {}, options = {}) {
  if (element?.textRun?.content != null) {
    const text = stripTrailingNewline(element.textRun.content);
    if (!text) return "";
    return applyInlineTextStyle(text, element.textRun.textStyle || {});
  }

  if (element?.horizontalRule) return "<hr />";

  if (element?.inlineObjectElement) {
    return resolveInlineObjectHtml(element, inlineObjects, options);
  }

  return "";
}

async function renderParagraph(paragraph = {}, documentData = {}, context = {}, options = {}) {
  const innerHtmlParts = await Promise.all(
    (paragraph.elements || []).map((element) =>
      renderParagraphElement(element, documentData.inlineObjects || {}, options)
    )
  );
  const innerHtml = innerHtmlParts.join("");

  const text = paragraphTextContent(paragraph);
  const tag = tagForParagraph(paragraph);
  const alignmentStyle = paragraphAlignmentStyle(paragraph);
  const hasBullet = Boolean(paragraph?.bullet);

  if (hasBullet) {
    return {
      kind: "list-item",
      listType: listTypeForParagraph(paragraph, documentData.lists || {}),
      html: innerHtml || "<br />",
      nestingLevel: Number(paragraph?.bullet?.nestingLevel || 0),
    };
  }

  let attrs = "";
  if (alignmentStyle) {
    attrs += ` style="${alignmentStyle}"`;
  }

  if (/^h[1-6]$/.test(tag) && text) {
    const level = Number(tag.slice(1));
    const id = `${slugifyHeading(text)}-${context.headingCounter++}`;
    attrs += ` id="${id}"`;
    context.outline.push({ id, title: text, level });
  }

  return {
    kind: "block",
    html: `<${tag}${attrs}>${innerHtml || "<br />"}</${tag}>`,
  };
}

async function renderTable(table = {}, documentData = {}, options = {}) {
  const rowChunks = await Promise.all(
    (table.tableRows || []).map(async (row) => {
      const cellChunks = await Promise.all(
        (row.tableCells || []).map(async (cell) => {
          const cellHtml = (await renderContent(cell.content || [], documentData, null, options)).html;
          return `<td>${cellHtml || "<p><br /></p>"}</td>`;
        })
      );
      return `<tr>${cellChunks.join("")}</tr>`;
    })
  );
  const rowsHtml = rowChunks.join("");

  return `<table><tbody>${rowsHtml}</tbody></table>`;
}

async function renderContent(
  content = [],
  documentData = {},
  providedContext = null,
  options = {}
) {
  const context =
    providedContext ||
    {
      outline: [],
      headingCounter: 1,
    };

  let html = "";
  let listBuffer = [];
  let listType = null;

  function flushList() {
    if (!listBuffer.length || !listType) {
      listBuffer = [];
      listType = null;
      return;
    }

    html += `<${listType}>${listBuffer
      .map(
        (item) =>
          `<li${item.nestingLevel ? ` style="margin-left:${item.nestingLevel * 18}px"` : ""}>${item.html}</li>`
      )
      .join("")}</${listType}>`;

    listBuffer = [];
    listType = null;
  }

  for (const item of content) {
    if (item.paragraph) {
      const rendered = await renderParagraph(item.paragraph, documentData, context, options);
      if (rendered.kind === "list-item") {
        if (listType && listType !== rendered.listType) {
          flushList();
        }
        listType = rendered.listType;
        listBuffer.push(rendered);
        continue;
      }

      flushList();
      html += rendered.html;
      continue;
    }

    flushList();

    if (item.table) {
      html += await renderTable(item.table, documentData, options);
    }
  }

  flushList();

  return { html, outline: context.outline };
}

async function documentToHtml(documentData = {}, options = {}) {
  const { html, outline } = await renderContent(
    documentData.body?.content || [],
    documentData,
    null,
    options
  );

  return {
    html: html || "<p><br /></p>",
    outline,
  };
}

function documentToPlainText(documentData = {}) {
  const parts = [];

  for (const item of documentData.body?.content || []) {
    if (item.paragraph) {
      const text = paragraphTextContent(item.paragraph);
      if (text) parts.push(text);
      continue;
    }

    if (!item.table?.tableRows) continue;

    for (const row of item.table.tableRows) {
      const rowText = (row.tableCells || [])
        .map((cell) =>
          (cell.content || [])
            .map((cellItem) =>
              cellItem.paragraph ? paragraphTextContent(cellItem.paragraph) : ""
            )
            .filter(Boolean)
            .join(" ")
        )
        .join(" | ");

      if (rowText) parts.push(rowText);
    }
  }

  return parts.join("\n\n").trim();
}

function buildHtmlDocument(title = "", content = "") {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(title || "Untitled")}</title>
    <style>
      body {
        font-family: Arial, sans-serif;
        color: #111827;
        line-height: 1.65;
        margin: 48px auto;
        max-width: 860px;
        padding: 0 24px;
      }
      h1, h2, h3, h4, h5, h6 {
        margin: 1.4em 0 0.6em;
        line-height: 1.25;
      }
      p {
        margin: 0 0 1em;
      }
      ul, ol {
        margin: 0 0 1em 1.4em;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        margin: 1.2em 0;
      }
      td, th {
        border: 1px solid #d1d5db;
        padding: 10px 12px;
        vertical-align: top;
      }
      figure {
        margin: 0 auto 1.2em;
      }
      figcaption {
        margin-top: 8px;
        color: #6b7280;
        font-size: 12px;
        text-align: center;
      }
      img {
        max-width: 100%;
        display: block;
      }
      a {
        color: #1d4ed8;
      }
    </style>
  </head>
  <body>${content || "<p><br /></p>"}</body>
</html>`;
}

function sanitizeEditorHtml(content = "") {
  return String(content || "")
    .replace(/\scontenteditable="[^"]*"/gi, "")
    .replace(/\sdata-[a-z0-9_-]+="[^"]*"/gi, "")
    .replace(/\saria-[a-z0-9_-]+="[^"]*"/gi, "")
    .replace(/\son[a-z]+="[^"]*"/gi, "")
    .replace(
      /<figure([^>]*class="[^"]*gd-chart-block[^"]*"[^>]*)>([\s\S]*?)<figcaption[\s\S]*?<\/figcaption>([\s\S]*?)<\/figure>/gi,
      "<figure$1>$2$3</figure>"
    )
    .trim();
}

function mapFilePermissions(file = {}) {
  const capabilities = file?.capabilities || {};
  const canEdit = Boolean(capabilities.canEdit || capabilities.canModifyContent);
  return {
    canEdit,
    canRename: Boolean(capabilities.canRename || canEdit),
    canShare: Boolean(capabilities.canShare),
    canDelete: Boolean(capabilities.canTrash || capabilities.canDelete),
    canDownload: capabilities.canDownload !== false,
    canComment: Boolean(capabilities.canComment),
    viewOnly: !canEdit,
  };
}

async function getFileMetadata(drive, documentId, fields = "") {
  const response = await drive.files.get({
    fileId: documentId,
    fields,
    supportsAllDrives: true,
  });
  return response.data || {};
}

function assertPermission(permissions = {}, capability = "", message = "Permission denied.") {
  if (!permissions?.[capability]) {
    const error = new Error(message);
    error.statusCode = 403;
    throw error;
  }
}

function normalizeShareRole(role = "writer") {
  const value = String(role || "writer").trim().toLowerCase();
  if (["writer", "reader", "commenter"].includes(value)) return value;
  return "writer";
}

function normalizeShareEmails(payload = {}) {
  const emails = Array.isArray(payload.emails)
    ? payload.emails
    : String(payload.email || "")
        .split(/[,\n;]/g)
        .map((item) => item.trim());

  return Array.from(
    new Set(
      emails
        .map((item) => item.toLowerCase())
        .filter(Boolean)
    )
  );
}

async function getGoogleDocsIntegration(userId) {
  return Integration.findOne({ userId, type: "google_docs" });
}

async function getAuthorizedClient(userId) {
  const integration = await getGoogleDocsIntegration(userId);
  if (!integration?.googleDocs) {
    throw new Error("Google Docs is not connected.");
  }

  const oauth = getOAuthConfig("google_docs", integration.googleDocs || {});
  if (!oauth.clientId || !oauth.clientSecret) {
    throw new Error("Google Docs OAuth credentials are missing.");
  }

  const auth = new google.auth.OAuth2(
    oauth.clientId,
    oauth.clientSecret,
    oauth.redirectUri
  );

  auth.setCredentials({
    access_token: integration.googleDocs.accessToken || undefined,
    refresh_token: integration.googleDocs.refreshToken || undefined,
    expiry_date: integration.googleDocs.expiresAt
      ? new Date(integration.googleDocs.expiresAt).getTime()
      : undefined,
  });

  const expiresSoon =
    !auth.credentials.access_token ||
    !auth.credentials.expiry_date ||
    auth.credentials.expiry_date - Date.now() < 60_000;

  if (expiresSoon && integration.googleDocs.refreshToken) {
    const refreshed = await auth.refreshAccessToken();
    auth.setCredentials({
      ...auth.credentials,
      ...refreshed.credentials,
      refresh_token: integration.googleDocs.refreshToken,
    });
  }

  const credentials = auth.credentials || {};
  const nextAccessToken =
    credentials.access_token || integration.googleDocs.accessToken;
  const nextExpiresAt = credentials.expiry_date
    ? new Date(credentials.expiry_date)
    : integration.googleDocs.expiresAt || null;

  if (
    nextAccessToken !== integration.googleDocs.accessToken ||
    String(nextExpiresAt || "") !== String(integration.googleDocs.expiresAt || "")
  ) {
    await Integration.findOneAndUpdate(
      { userId, type: "google_docs" },
      {
        $set: {
          "googleDocs.accessToken": nextAccessToken || "",
          "googleDocs.expiresAt": nextExpiresAt,
          updatedAt: new Date(),
        },
      }
    );
  }

  return auth;
}

async function listRecentDocuments(userId, { limit = 12 } = {}) {
  const auth = await getAuthorizedClient(userId);
  const drive = google.drive({ version: "v3", auth });

  const response = await drive.files.list({
    q: `mimeType='${GOOGLE_DOCS_MIME}' and trashed=false`,
    orderBy: "modifiedTime desc",
    pageSize: Math.min(Math.max(Number(limit) || 12, 1), 50),
    fields:
      "files(id,name,modifiedTime,webViewLink,iconLink,owners(displayName,emailAddress),capabilities(canEdit,canRename,canShare,canTrash,canDelete,canComment,canDownload,canModifyContent))",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });

  return (response.data.files || []).map((file) => ({
    documentId: file.id,
    title: file.name,
    modifiedTime: file.modifiedTime,
    webViewUrl: file.webViewLink,
    iconUrl: file.iconLink,
    ownerName: file.owners?.[0]?.displayName || "",
    ownerEmail: file.owners?.[0]?.emailAddress || "",
    permissions: mapFilePermissions(file),
  }));
}

async function getDocumentWorkspace(userId, documentId) {
  const auth = await getAuthorizedClient(userId);
  const docs = google.docs({ version: "v1", auth });
  const drive = google.drive({ version: "v3", auth });

  const [documentResponse, fileResponse] = await Promise.all([
    docs.documents.get({ documentId }),
    getFileMetadata(
      drive,
      documentId,
      "id,name,modifiedTime,webViewLink,iconLink,capabilities(canEdit,canRename,canShare,canTrash,canDelete,canComment,canDownload,canModifyContent)"
    ),
  ]);

  const documentData = documentResponse.data || {};
  const file = fileResponse || {};
  const rendered = await documentToHtml(documentData, {
    auth,
    mediaCache: new Map(),
  });

  return {
    documentId,
    title: file.name || documentData.title || "Untitled document",
    content: rendered.html,
    outline: rendered.outline,
    revisionId: documentData.revisionId || null,
    lastSyncedAt: file.modifiedTime || null,
    webViewUrl:
      file.webViewLink || `https://docs.google.com/document/d/${documentId}/edit`,
    iconUrl: file.iconLink || null,
    plainText: documentToPlainText(documentData),
    permissions: mapFilePermissions(file),
  };
}

async function createBlankDocument(userId, { title = "Untitled document" } = {}) {
  const auth = await getAuthorizedClient(userId);
  const docs = google.docs({ version: "v1", auth });

  const response = await docs.documents.create({
    requestBody: {
      title: String(title || "Untitled document").trim() || "Untitled document",
    },
  });

  const documentId = response.data.documentId;
  return getDocumentWorkspace(userId, documentId);
}

async function saveDocumentWorkspace(userId, documentId, payload = {}) {
  const auth = await getAuthorizedClient(userId);
  const drive = google.drive({ version: "v3", auth });
  const fileMetadata = await getFileMetadata(
    drive,
    documentId,
    "id,name,modifiedTime,webViewLink,iconLink,capabilities(canEdit,canRename,canShare,canTrash,canDelete,canComment,canDownload,canModifyContent)"
  );
  const permissions = mapFilePermissions(fileMetadata);

  const title =
    String(payload.title || "Untitled document").trim() || "Untitled document";
  const hasContent = Object.prototype.hasOwnProperty.call(payload, "content");
  const hasTitle =
    Object.prototype.hasOwnProperty.call(payload, "title") &&
    String(payload.title || "").trim() !== "";

  if (hasContent) {
    assertPermission(
      permissions,
      "canEdit",
      "You do not have permission to edit this document."
    );
  }

  if (hasTitle) {
    assertPermission(
      permissions,
      "canRename",
      "You do not have permission to rename this document."
    );
  }

  const request = {
    fileId: documentId,
    requestBody: {
      mimeType: GOOGLE_DOCS_MIME,
    },
    fields: "id,name,modifiedTime,webViewLink,iconLink",
    supportsAllDrives: true,
  };

  if (hasTitle) {
    request.requestBody.name = title;
  }

  if (hasContent) {
    const content = sanitizeEditorHtml(payload.content || "");
    const htmlDocument = buildHtmlDocument(title, content);
    request.media = {
      mimeType: "text/html",
      body: Readable.from([htmlDocument]),
    };
  }

  const response = await drive.files.update(request);

  return {
    documentId: response.data.id || documentId,
    title: response.data.name || title,
    lastSyncedAt: response.data.modifiedTime || new Date().toISOString(),
    webViewUrl:
      response.data.webViewLink ||
      `https://docs.google.com/document/d/${documentId}/edit`,
    iconUrl: response.data.iconLink || null,
    permissions,
  };
}

async function shareDocumentWorkspace(userId, documentId, payload = {}) {
  const auth = await getAuthorizedClient(userId);
  const drive = google.drive({ version: "v3", auth });
  const fileMetadata = await getFileMetadata(
    drive,
    documentId,
    "id,name,webViewLink,capabilities(canEdit,canRename,canShare,canTrash,canDelete,canComment,canDownload,canModifyContent)"
  );
  const permissions = mapFilePermissions(fileMetadata);
  assertPermission(
    permissions,
    "canShare",
    "You do not have permission to share this document."
  );
  const emails = normalizeShareEmails(payload);

  if (!emails.length) {
    throw new Error("At least one email address is required to share this document.");
  }

  const role = normalizeShareRole(payload.role);
  const sendNotificationEmail = payload.sendNotificationEmail !== false;

  const shared = [];
  for (const email of emails) {
    const permissionResponse = await drive.permissions.create({
      fileId: documentId,
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
      email: permissionResponse.data?.emailAddress || email,
      role: permissionResponse.data?.role || role,
    });
  }

  return {
    ok: true,
    shared,
    sharedWith: shared[0]?.email || "",
    role: shared[0]?.role || role,
    link:
      fileMetadata?.webViewLink ||
      `https://docs.google.com/document/d/${documentId}/edit`,
    title: fileMetadata?.name || "Untitled document",
  };
}

async function exportDocument(userId, documentId, mimeType) {
  const auth = await getAuthorizedClient(userId);
  const drive = google.drive({ version: "v3", auth });
  const fileMetadata = await getFileMetadata(
    drive,
    documentId,
    "id,capabilities(canEdit,canRename,canShare,canTrash,canDelete,canComment,canDownload,canModifyContent)"
  );
  const permissions = mapFilePermissions(fileMetadata);
  assertPermission(
    permissions,
    "canDownload",
    "You do not have permission to download this document."
  );

  const response = await drive.files.export(
    {
      fileId: documentId,
      mimeType,
    },
    {
      responseType: "arraybuffer",
    }
  );

  return Buffer.from(response.data);
}

async function deleteDocumentWorkspace(userId, documentId) {
  const auth = await getAuthorizedClient(userId);
  const drive = google.drive({ version: "v3", auth });
  const fileMetadata = await getFileMetadata(
    drive,
    documentId,
    "id,name,capabilities(canEdit,canRename,canShare,canTrash,canDelete,canComment,canDownload,canModifyContent)"
  );
  const permissions = mapFilePermissions(fileMetadata);
  assertPermission(
    permissions,
    "canDelete",
    "You do not have permission to delete this document."
  );

  await drive.files.update({
    fileId: documentId,
    requestBody: {
      trashed: true,
    },
    supportsAllDrives: true,
  });

  return {
    ok: true,
    documentId,
    title: fileMetadata.name || "Untitled document",
  };
}

module.exports = {
  GOOGLE_DOCS_MIME,
  listRecentDocuments,
  getDocumentWorkspace,
  createBlankDocument,
  saveDocumentWorkspace,
  shareDocumentWorkspace,
  exportDocument,
  deleteDocumentWorkspace,
  getGoogleDocsIntegration,
  getAuthorizedClient,
  documentToPlainText,
  mapFilePermissions,
};
