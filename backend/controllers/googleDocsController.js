"use strict";

const {
  listRecentDocuments,
  getDocumentWorkspace,
  createBlankDocument,
  saveDocumentWorkspace,
  shareDocumentWorkspace,
  exportDocument,
  deleteDocumentWorkspace,
} = require("../services/googleDocsService");
const { chatCompleteNoSystem } = require("../services/llmService");

const EXPORT_FORMATS = {
  pdf: {
    mimeType: "application/pdf",
    extension: "pdf",
  },
  docx: {
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    extension: "docx",
  },
  markdown: {
    mimeType: "text/markdown",
    extension: "md",
  },
  txt: {
    mimeType: "text/plain",
    extension: "txt",
  },
};

function actionInstruction(action = "chat") {
  const instructions = {
    summarize: "Summarize the document clearly in concise bullets.",
    improve_writing:
      "Improve the writing for clarity, tone, and readability while preserving meaning.",
    fix_grammar:
      "Fix grammar, punctuation, and spelling while preserving the original meaning.",
    rewrite_selection:
      "Rewrite the selected text in a more polished, professional style.",
    extract_action_items:
      "Extract concrete action items with owners if they are implied and keep them crisp.",
    create_outline:
      "Turn the content into a clean outline with headings and sub-points.",
    shorten_text:
      "Shorten the text while preserving key intent and facts.",
    expand_text:
      "Expand the text into a fuller, more complete draft while staying aligned with the source.",
    insights:
      "Identify the most important insights, risks, and next steps from the content.",
    chat: "Answer the user request helpfully using the document context provided.",
  };

  return instructions[action] || instructions.chat;
}

function tokenBudgetForRequest(intentType = "chat", wordCountTarget = 0) {
  if (intentType === "create_new_content") {
    const requestedWords = Math.max(900, Number(wordCountTarget) || 1200);
    return Math.min(4200, Math.max(1800, Math.round(requestedWords * 1.8)));
  }

  return 1600;
}

function buildCreatePrompt({
  workspace = {},
  question = "",
  documentKind = "",
  wordCountTarget = 0,
}) {
  const targetWords = Number(wordCountTarget) || 0;

  return [
    "You are OrionAI's premium Google Docs writing agent inside a native document editor.",
    "The user is asking you to create fresh content from scratch for the currently open document.",
    "Do not say the topic is missing from the current document and do not require existing page text for creation requests.",
    "Write polished, publication-ready markdown that will be streamed into a Google Docs-style editor.",
    "Formatting requirements:",
    "- Start with a strong title.",
    "- Use clean section headings and subheadings where helpful.",
    "- Use short readable paragraphs.",
    "- Use numbered lists or bullet lists when they improve clarity.",
    "- Use emphasis sparingly and professionally.",
    "- End with a conclusion, closing section, or action items when appropriate for the document type.",
    "- Do not include code fences.",
    "- Do not include meta commentary or notes to the user.",
    "- Keep markdown valid: leave blank lines between headings, paragraphs, and list sections.",
    documentKind ? `Document type hint: ${documentKind}` : "",
    targetWords ? `Target length: about ${targetWords} words.` : "",
    `Current document title: ${workspace.title || "Untitled document"}`,
    `User request: ${question}`,
    "Return only the document content to insert.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function buildContextualPrompt({
  workspace = {},
  action = "chat",
  question = "",
  selectionText = "",
  currentSectionText = "",
  fullDocumentText = "",
  outlineText = "",
  intentType = "chat",
}) {
  const focusedContext = selectionText || currentSectionText || "";

  return [
    "You are OrionAI's expert document copilot inside a Google Docs-style editor.",
    "Use the active document as the source of truth whenever the user is asking to summarize, rewrite, improve, analyze, or transform existing content.",
    intentType === "edit_existing_content" || intentType === "format_content"
      ? "If the user is asking to work on existing content and there is not enough relevant context, say clearly what is missing instead of inventing content."
      : "If the user asks about facts, sections, risks, dates, or action items, inspect the provided document context carefully before answering.",
    "When asked to rewrite or improve content, return polished editor-ready text.",
    `Document title: ${workspace.title || "Untitled document"}`,
    `Task: ${actionInstruction(action)}`,
    question ? `User request: ${question}` : "",
    selectionText ? `Selected text:\n${selectionText}` : "",
    !selectionText && currentSectionText
      ? `Current section:\n${currentSectionText}`
      : "",
    focusedContext ? `Focused context:\n${focusedContext.slice(0, 8000)}` : "",
    outlineText ? `Document outline:\n${outlineText.slice(0, 4000)}` : "",
    fullDocumentText
      ? `Full document text:\n${fullDocumentText.slice(0, 28000)}`
      : "",
    "Keep the response actionable, specific, and ready to use in an editor.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

async function listGoogleDocs(req, res) {
  try {
    const documents = await listRecentDocuments(req.user?.username, {
      limit: req.query.limit,
    });

    res.json({
      ok: true,
      documents,
    });
  } catch (err) {
    console.error("List Google Docs error:", err.message);
    res.status(400).json({ ok: false, error: err.message });
  }
}

async function getGoogleDoc(req, res) {
  try {
    const workspace = await getDocumentWorkspace(
      req.user?.username,
      req.params.id
    );

    res.json(workspace);
  } catch (err) {
    console.error("Get Google Doc error:", err.message);
    res.status(400).json({ error: err.message });
  }
}

async function createGoogleDoc(req, res) {
  try {
    const workspace = await createBlankDocument(req.user?.username, req.body || {});
    res.status(201).json(workspace);
  } catch (err) {
    console.error("Create Google Doc error:", err.message);
    res.status(400).json({ ok: false, error: err.message });
  }
}

async function updateGoogleDoc(req, res) {
  try {
    if (!req.body?.content && !req.body?.title) {
      return res.status(400).json({ error: "Nothing to update." });
    }

    const result = await saveDocumentWorkspace(
      req.user?.username,
      req.params.id,
      req.body || {}
    );

    res.json({
      ok: true,
      ...result,
    });
  } catch (err) {
    console.error("Update Google Doc error:", err.message);
    res.status(err.statusCode || 400).json({ ok: false, error: err.message });
  }
}

async function runGoogleDocAi(req, res) {
  try {
    if (req.body?.scope && req.body.scope !== "google_docs") {
      return res.status(400).json({
        ok: false,
        error: "AI scope mismatch for Google Docs request.",
      });
    }

    const action = String(req.body?.action || "chat").trim() || "chat";
    const intentType = String(req.body?.intentType || "chat").trim() || "chat";
    const question = String(req.body?.question || "").trim();
    const documentKind = String(req.body?.documentKind || "").trim();
    const wordCountTarget = Number(req.body?.wordCountTarget || 0);
    const selectionText = String(req.body?.selectionText || "").trim();
    const currentSectionText = String(req.body?.currentSectionText || "").trim();
    const providedDocumentText = String(req.body?.documentText || "").trim();
    const providedOutline = Array.isArray(req.body?.documentOutline)
      ? req.body.documentOutline
      : [];
    const fallbackWorkspace = await getDocumentWorkspace(
      req.user?.username,
      req.params.id
    );

    const fullDocumentText =
      providedDocumentText || String(fallbackWorkspace.plainText || "").trim();

    const outlineText = (providedOutline.length
      ? providedOutline
      : fallbackWorkspace.outline || []
    )
      .map((item) => `${"  ".repeat(Math.max(0, Number(item.level || 1) - 1))}- ${item.title}`)
      .join("\n");

    const prompt =
      intentType === "create_new_content"
        ? buildCreatePrompt({
            workspace: fallbackWorkspace,
            question,
            documentKind,
            wordCountTarget,
          })
        : buildContextualPrompt({
            workspace: fallbackWorkspace,
            action,
            question,
            selectionText,
            currentSectionText,
            fullDocumentText,
            outlineText,
            intentType,
          });

    const result = await chatCompleteNoSystem(
      prompt,
      tokenBudgetForRequest(intentType, wordCountTarget),
      intentType === "create_new_content" ? 0.35 : 0.15
    );

    res.json({
      ok: true,
      action,
      intentType,
      result,
    });
  } catch (err) {
    console.error("Google Doc AI error:", err.message);
    res.status(400).json({ ok: false, error: err.message });
  }
}

async function shareGoogleDoc(req, res) {
  try {
    const result = await shareDocumentWorkspace(
      req.user?.username,
      req.params.id,
      req.body || {}
    );

    res.json(result);
  } catch (err) {
    console.error("Share Google Doc error:", err.message);
    res.status(err.statusCode || 400).json({ ok: false, error: err.message });
  }
}

async function exportGoogleDoc(req, res) {
  try {
    const format = String(req.body?.format || "pdf").trim().toLowerCase();
    const selected = EXPORT_FORMATS[format];
    if (!selected) {
      return res.status(400).json({ error: "Unsupported export format." });
    }

    const workspace = await getDocumentWorkspace(
      req.user?.username,
      req.params.id
    );
    const buffer = await exportDocument(
      req.user?.username,
      req.params.id,
      selected.mimeType
    );

    res.setHeader("Content-Type", selected.mimeType);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${workspace.title.replace(/"/g, "")}.${selected.extension}"`
    );
    res.send(buffer);
  } catch (err) {
    console.error("Export Google Doc error:", err.message);
    res.status(err.statusCode || 400).json({ ok: false, error: err.message });
  }
}

async function deleteGoogleDoc(req, res) {
  try {
    const result = await deleteDocumentWorkspace(
      req.user?.username,
      req.params.id
    );

    res.json(result);
  } catch (err) {
    console.error("Delete Google Doc error:", err.message);
    res.status(err.statusCode || 400).json({ ok: false, error: err.message });
  }
}

module.exports = {
  listGoogleDocs,
  getGoogleDoc,
  createGoogleDoc,
  updateGoogleDoc,
  runGoogleDocAi,
  shareGoogleDoc,
  exportGoogleDoc,
  deleteGoogleDoc,
};
