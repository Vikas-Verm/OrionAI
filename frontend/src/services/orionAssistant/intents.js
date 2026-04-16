import { store } from "../../stores/app";

export const ASSISTANT_INTENT_TYPES = {
  CREATE_NEW_CONTENT: "create_new_content",
  EDIT_EXISTING_CONTENT: "edit_existing_content",
  FORMAT_CONTENT: "format_content",
  DOCUMENT_ACTION: "document_action",
  APP_ACTION: "app_action",
  CHAT: "chat",
};

const CREATE_START_RE =
  /^(?:please\s+)?(?:write|draft|create|generate|compose|prepare|produce|build|develop|make)\b/i;
const CREATE_NOUN_RE =
  /\b(essay|article|blog|post|proposal|report|letter|email|mail|application|pr[ -]?d|product requirements document|meeting notes|minutes|brief|outline|memo|plan|summary|document|spec)\b/i;
const EDIT_VERB_RE =
  /\b(summarize|rewrite|reword|improve|fix|proofread|edit|expand|shorten|refine|polish|clarify|clean up)\b/i;
const FORMAT_VERB_RE = /\b(format|convert|turn)\b/i;
const EXISTING_CONTEXT_RE =
  /\b(this|current|selected|selection|paragraph|page|section|document|content|text|above|below|here)\b/i;
const DOCUMENT_ACTION_VERB_RE =
  /\b(share|rename|export|download|print|insert|add)\b/i;
const SHARE_RE = /\bshare\b/i;
const RENAME_RE = /\brename\b/i;
const DELETE_RE = /\b(delete|remove|trash)\b/i;
const EXPORT_RE = /\b(export|download)\b/i;
const PRINT_RE = /\bprint\b/i;
const INSERT_TABLE_RE = /\b(insert|add)\s+(?:a\s+)?table\b/i;
const ADD_HEADING_RE = /\b(add|insert)\s+(?:a\s+)?(?:heading|subheading|title)\b/i;
const ADD_CONCLUSION_RE = /\b(add|write|insert)\s+(?:a\s+)?conclusion(?:\s+section)?\b/i;

export function detectActiveAssistantScope(explicitScope = "") {
  if (explicitScope) return explicitScope;
  return store.moduleContext?.module || "";
}

export function extractEmailsFromText(question = "") {
  return Array.from(
    new Set(
      String(question || "").match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []
    )
  );
}

function normalizeQuestion(question = "") {
  return String(question || "").trim().replace(/\s+/g, " ");
}

function parseWordCountTarget(question = "") {
  const match = normalizeQuestion(question).match(/\b(\d{2,5})\s*words?\b/i);
  const parsed = Number(match?.[1] || 0);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseRenameTarget(question = "") {
  const normalized = normalizeQuestion(question);
  const match =
    normalized.match(/\brename(?:\s+this)?\s+document\s+to\s+["“]?(.+?)["”]?$/i) ||
    normalized.match(/\brename\s+to\s+["“]?(.+?)["”]?$/i);
  return match?.[1]?.trim() || "";
}

function parseHeadingText(question = "") {
  const normalized = normalizeQuestion(question);
  const match =
    normalized.match(/\b(?:add|insert)\s+(?:a\s+)?(?:heading|subheading|title)\s+(?:called|named|for)\s+["“]?(.+?)["”]?$/i) ||
    normalized.match(/\b(?:add|insert)\s+(?:a\s+)?(?:heading|subheading|title)\s+["“]?(.+?)["”]?$/i);
  return match?.[1]?.trim() || "New heading";
}

function parseTableSize(question = "") {
  const normalized = normalizeQuestion(question);
  const match = normalized.match(/\b(\d+)\s*(?:x|by)\s*(\d+)\b/i);
  if (!match) {
    return { rows: 3, columns: 3 };
  }
  return {
    rows: Math.min(20, Math.max(1, Number(match[1]) || 3)),
    columns: Math.min(12, Math.max(1, Number(match[2]) || 3)),
  };
}

function detectDocumentAction(question = "") {
  const normalized = normalizeQuestion(question);

  if (SHARE_RE.test(normalized)) {
    return {
      type: ASSISTANT_INTENT_TYPES.DOCUMENT_ACTION,
      action: "share_document",
      emails: extractEmailsFromText(normalized),
    };
  }

  if (RENAME_RE.test(normalized)) {
    return {
      type: ASSISTANT_INTENT_TYPES.DOCUMENT_ACTION,
      action: "rename_document",
      title: parseRenameTarget(normalized),
    };
  }

  if (DELETE_RE.test(normalized) && /\bdocument|doc|file\b/i.test(normalized)) {
    return {
      type: ASSISTANT_INTENT_TYPES.DOCUMENT_ACTION,
      action: "delete_document",
    };
  }

  if (EXPORT_RE.test(normalized)) {
    return {
      type: ASSISTANT_INTENT_TYPES.DOCUMENT_ACTION,
      action: "export_document",
      format: /\bpdf\b/i.test(normalized)
        ? "pdf"
        : /\bdocx?\b/i.test(normalized)
          ? "docx"
          : /\bmarkdown|md\b/i.test(normalized)
            ? "markdown"
            : /\btext|txt\b/i.test(normalized)
              ? "txt"
              : "",
    };
  }

  if (PRINT_RE.test(normalized)) {
    return {
      type: ASSISTANT_INTENT_TYPES.DOCUMENT_ACTION,
      action: "print_document",
    };
  }

  if (INSERT_TABLE_RE.test(normalized)) {
    return {
      type: ASSISTANT_INTENT_TYPES.DOCUMENT_ACTION,
      action: "insert_table",
      ...parseTableSize(normalized),
    };
  }

  if (ADD_HEADING_RE.test(normalized)) {
    return {
      type: ASSISTANT_INTENT_TYPES.DOCUMENT_ACTION,
      action: "add_heading",
      headingText: parseHeadingText(normalized),
    };
  }

  if (ADD_CONCLUSION_RE.test(normalized)) {
    return {
      type: ASSISTANT_INTENT_TYPES.DOCUMENT_ACTION,
      action: "add_conclusion_section",
    };
  }

  return null;
}

function detectFormattingIntent(question = "") {
  const normalized = normalizeQuestion(question);
  if (
    FORMAT_VERB_RE.test(normalized) &&
    (EXISTING_CONTEXT_RE.test(normalized) ||
      /\b(report|bullet points|bullets|table|outline|summary)\b/i.test(normalized))
  ) {
    return {
      type: ASSISTANT_INTENT_TYPES.FORMAT_CONTENT,
      action: "format_content",
    };
  }
  return null;
}

function detectEditIntent(question = "") {
  const normalized = normalizeQuestion(question);
  if (!EDIT_VERB_RE.test(normalized)) return null;

  if (/\bsummarize\b/i.test(normalized)) {
    return {
      type: ASSISTANT_INTENT_TYPES.EDIT_EXISTING_CONTENT,
      action: "summarize",
      requiresExistingContext: true,
    };
  }

  if (/\brewrite|reword\b/i.test(normalized)) {
    return {
      type: ASSISTANT_INTENT_TYPES.EDIT_EXISTING_CONTENT,
      action: "rewrite_selection",
      requiresExistingContext: true,
    };
  }

  if (/\bfix|grammar|proofread\b/i.test(normalized)) {
    return {
      type: ASSISTANT_INTENT_TYPES.EDIT_EXISTING_CONTENT,
      action: "fix_grammar",
      requiresExistingContext: true,
    };
  }

  if (/\bimprove|polish|refine|clarify\b/i.test(normalized)) {
    return {
      type: ASSISTANT_INTENT_TYPES.EDIT_EXISTING_CONTENT,
      action: "improve_writing",
      requiresExistingContext: true,
    };
  }

  if (/\bexpand\b/i.test(normalized)) {
    return {
      type: ASSISTANT_INTENT_TYPES.EDIT_EXISTING_CONTENT,
      action: "expand_text",
      requiresExistingContext: true,
    };
  }

  if (/\bshorten\b/i.test(normalized)) {
    return {
      type: ASSISTANT_INTENT_TYPES.EDIT_EXISTING_CONTENT,
      action: "shorten_text",
      requiresExistingContext: true,
    };
  }

  return {
    type: ASSISTANT_INTENT_TYPES.EDIT_EXISTING_CONTENT,
    action: "edit_existing_content",
    requiresExistingContext: true,
  };
}

function detectCreateIntent(question = "") {
  const normalized = normalizeQuestion(question);
  if (!CREATE_START_RE.test(normalized)) return null;

  const referencesExistingContent =
    EXISTING_CONTEXT_RE.test(normalized) &&
    (EDIT_VERB_RE.test(normalized) || FORMAT_VERB_RE.test(normalized));

  if (referencesExistingContent) return null;

  const startsWithDocumentAction = DOCUMENT_ACTION_VERB_RE.test(normalized) && !CREATE_NOUN_RE.test(normalized);
  if (/^(?:share|rename|export|download|print|insert|add)\b/i.test(normalized) && !CREATE_NOUN_RE.test(normalized)) {
    return null;
  }

  return {
    type: ASSISTANT_INTENT_TYPES.CREATE_NEW_CONTENT,
    action: "create_new_content",
    wordCountTarget: parseWordCountTarget(normalized),
    documentKind:
      normalized.match(CREATE_NOUN_RE)?.[1]?.toLowerCase().replace(/\s+/g, "_") ||
      "",
    prompt: normalized,
    startsWithDocumentAction,
  };
}

export function classifyAssistantIntent(question = "", context = {}) {
  const normalized = normalizeQuestion(question);
  const scope = detectActiveAssistantScope(context.scope);

  if (!normalized) {
    return {
      type: ASSISTANT_INTENT_TYPES.CHAT,
      action: "chat",
      scope,
      question: normalized,
    };
  }

  const documentAction = detectDocumentAction(normalized);
  if (documentAction) {
    return {
      ...documentAction,
      scope,
      question: normalized,
    };
  }

  const formatIntent = detectFormattingIntent(normalized);
  if (formatIntent) {
    return {
      ...formatIntent,
      scope,
      question: normalized,
    };
  }

  const editIntent = detectEditIntent(normalized);
  if (editIntent) {
    return {
      ...editIntent,
      scope,
      question: normalized,
    };
  }

  const createIntent = detectCreateIntent(normalized);
  if (createIntent) {
    return {
      ...createIntent,
      scope,
      question: normalized,
    };
  }

  return {
    type: ASSISTANT_INTENT_TYPES.CHAT,
    action: "chat",
    scope,
    question: normalized,
  };
}
