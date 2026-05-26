/**
 * toolGoogleDocs.js — Google Docs integration tools for OrionAI Agent mode
 *
 * Tools:
 *  - toolGoogleDocsListDocs()    — list recent Google Docs
 *  - toolGoogleDocsGetDoc()      — get a specific doc's content
 *  - toolGoogleDocsCreateDoc()   — create a new blank document
 *  - toolGoogleDocsUpdateDoc()   — update title or content of a doc
 *  - toolGoogleDocsShareDoc()    — share a doc with someone
 *  - toolGoogleDocsDeleteDoc()   — trash a document
 *  - toolGoogleDocsSearchDocs()  — search docs by name/keyword
 *
 * Auth: OAuth2 via Integration model (type: "google_docs")
 */

"use strict";

const {
  listRecentDocuments,
  getDocumentWorkspace,
  createBlankDocument,
  saveDocumentWorkspace,
  shareDocumentWorkspace,
  deleteDocumentWorkspace,
} = require("../googleDocsService");

async function toolGoogleDocsListDocs(params, ctx) {
  const limit = params.limit || 12;
  const docs = await listRecentDocuments(ctx.userId, { limit });

  return {
    summary: docs.length
      ? `Found ${docs.length} recent document${docs.length > 1 ? "s" : ""}`
      : "No documents found",
    richGoogleDocs: docs.map((d) => ({
      id: d.documentId,
      title: d.title,
      modifiedTime: d.modifiedTime,
      webViewUrl: d.webViewUrl,
      ownerName: d.ownerName,
      ownerEmail: d.ownerEmail,
      canEdit: d.permissions?.canEdit || false,
    })),
  };
}

async function toolGoogleDocsGetDoc(params, ctx) {
  const { documentId } = params;
  if (!documentId) throw new Error("google_docs_get_doc requires a documentId");

  const workspace = await getDocumentWorkspace(ctx.userId, documentId);

  ctx.lastGoogleDoc = {
    documentId: workspace.documentId,
    title: workspace.title,
    webViewUrl: workspace.webViewUrl,
  };

  return {
    summary: `Opened "${workspace.title}"`,
    richGoogleDoc: {
      id: workspace.documentId,
      title: workspace.title,
      plainText: (workspace.plainText || "").slice(0, 3000),
      webViewUrl: workspace.webViewUrl,
      canEdit: workspace.permissions?.canEdit || false,
    },
  };
}

async function toolGoogleDocsCreateDoc(params, ctx) {
  const title = params.title || "Untitled document";
  const workspace = await createBlankDocument(ctx.userId, { title });

  ctx.lastGoogleDoc = {
    documentId: workspace.documentId,
    title: workspace.title,
    webViewUrl: workspace.webViewUrl,
  };

  return {
    summary: `Created document "${workspace.title}"`,
    richGoogleDoc: {
      id: workspace.documentId,
      title: workspace.title,
      webViewUrl: workspace.webViewUrl,
      canEdit: true,
    },
  };
}

async function toolGoogleDocsUpdateDoc(params, ctx) {
  const documentId = params.documentId || ctx.lastGoogleDoc?.documentId;
  if (!documentId)
    throw new Error("google_docs_update_doc requires a documentId");

  const payload = {};
  if (params.title) payload.title = params.title;
  if (params.content) payload.content = params.content;

  const result = await saveDocumentWorkspace(ctx.userId, documentId, payload);

  ctx.lastGoogleDoc = {
    documentId: result.documentId,
    title: result.title,
    webViewUrl: result.webViewUrl,
  };

  return {
    summary: `Updated "${result.title}"`,
    richGoogleDoc: {
      id: result.documentId,
      title: result.title,
      webViewUrl: result.webViewUrl,
      canEdit: result.permissions?.canEdit || false,
    },
  };
}

async function toolGoogleDocsShareDoc(params, ctx) {
  console.log("Sharing doc with params:", params);
  const documentId = params.documentId || ctx.lastGoogleDoc?.documentId;
  if (!documentId)
    throw new Error("google_docs_share_doc requires a documentId");

  const result = await shareDocumentWorkspace(ctx.userId, documentId, {
    email: params.email,
    emails: params.emails,
    role: params.role || "writer",
  });

  return {
    summary: `Shared "${result.title}" with ${result.sharedWith} as ${result.role}`,
    richGoogleDocShare: {
      title: result.title,
      sharedWith: result.shared,
      link: result.link,
    },
  };
}

async function toolGoogleDocsDeleteDoc(params, ctx) {
  const documentId = params.documentId || ctx.lastGoogleDoc?.documentId;
  if (!documentId)
    throw new Error("google_docs_delete_doc requires a documentId");

  const result = await deleteDocumentWorkspace(ctx.userId, documentId);

  return {
    summary: `Moved "${result.title}" to trash`,
  };
}

async function toolGoogleDocsSearchDocs(params, ctx) {
  const rawQuery = params.query || "";
  const docs = await listRecentDocuments(ctx.userId, { limit: 20 });

  const NOISE = new Set(["doc", "docs", "document", "documents", "google", "from", "my", "the", "a", "an", "in", "of", "for", "get", "fetch", "find", "search", "show"]);
  const queryWords = rawQuery.toLowerCase().split(/\s+/).filter((w) => w && !NOISE.has(w));
  const lowerQuery = queryWords.join(" ");

  const matched = lowerQuery
    ? docs.filter((d) => {
        const title = d.title.toLowerCase();
        if (title.includes(lowerQuery)) return true;
        return queryWords.every((w) => title.includes(w));
      })
    : docs;

  return {
    summary: matched.length
      ? `Found ${matched.length} document${matched.length > 1 ? "s" : ""} matching "${lowerQuery || rawQuery}"`
      : `No documents found matching "${lowerQuery || rawQuery}"`,
    richGoogleDocs: matched.map((d) => ({
      id: d.documentId,
      title: d.title,
      modifiedTime: d.modifiedTime,
      webViewUrl: d.webViewUrl,
      ownerName: d.ownerName,
      ownerEmail: d.ownerEmail,
      canEdit: d.permissions?.canEdit || false,
    })),
  };
}

module.exports = {
  toolGoogleDocsListDocs,
  toolGoogleDocsGetDoc,
  toolGoogleDocsCreateDoc,
  toolGoogleDocsUpdateDoc,
  toolGoogleDocsShareDoc,
  toolGoogleDocsDeleteDoc,
  toolGoogleDocsSearchDocs,
};
