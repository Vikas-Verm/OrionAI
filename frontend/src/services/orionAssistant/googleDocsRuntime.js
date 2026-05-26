import { ASSISTANT_INTENT_TYPES } from "./intents";

function hasExistingContext(runtime = {}) {
  return Boolean(
    runtime.getSelectionText?.().trim() ||
      runtime.getCurrentSectionText?.().trim() ||
      runtime.getDocumentText?.().trim()
  );
}

function activeDocumentLabel(runtime = {}) {
  return runtime.getActiveEntityTitle?.() || "the current document";
}

function getPermissions(runtime = {}) {
  return runtime.getPermissions?.() || {};
}

export async function executeGoogleDocsAssistantCommand({ intent, runtime, conversationHistory = [] }) {
  const activeDocumentId = runtime.getActiveEntityId?.();
  if (!activeDocumentId) {
    return {
      handled: true,
      assistantText: "Open a Google Doc first so I can work on the active document.",
    };
  }

  const isStillActive = () =>
    runtime.getScope?.() === "google_docs" &&
    runtime.getActiveEntityId?.() === activeDocumentId;

  if (intent.type === ASSISTANT_INTENT_TYPES.CREATE_NEW_CONTENT) {
    if (!getPermissions(runtime).canEdit) {
      return {
        handled: true,
        assistantText:
          "This document is view-only right now, so I can’t write into it.",
      };
    }

    const data = await runtime.runAiAction({
      action: "chat",
      question: intent.question,
      intentType: intent.type,
      wordCountTarget: intent.wordCountTarget || undefined,
      documentKind: intent.documentKind || undefined,
    });

    if (!isStillActive()) {
      return {
        handled: true,
        assistantText:
          "The active document changed before the draft finished, so I stopped before writing into the wrong file.",
      };
    }

    await runtime.streamInsertContent?.(data?.result || "");

    return {
      handled: true,
      assistantText: `I wrote new content into "${activeDocumentLabel(runtime)}".`,
    };
  }

  if (
    intent.type === ASSISTANT_INTENT_TYPES.EDIT_EXISTING_CONTENT ||
    intent.type === ASSISTANT_INTENT_TYPES.FORMAT_CONTENT
  ) {
    if (intent.requiresExistingContext && !hasExistingContext(runtime)) {
      return {
        handled: true,
        assistantText:
          "Select text or place your cursor inside the section you want me to work on first, then try again.",
      };
    }

    const data = await runtime.runAiAction({
      action: intent.action || "chat",
      question: intent.question,
      intentType: intent.type,
    });

    if (!isStillActive()) {
      return {
        handled: true,
        assistantText:
          "The active document changed before the response finished, so I skipped applying it to the wrong file.",
      };
    }

    return {
      handled: true,
      assistantText: data?.result || "No response returned.",
    };
  }

  if (intent.type === ASSISTANT_INTENT_TYPES.DOCUMENT_ACTION) {
    if (intent.action === "share_document") {
      if (!getPermissions(runtime).canShare) {
        return {
          handled: true,
          assistantText:
            "You do not have permission to share the active document.",
        };
      }

      if (!intent.emails?.length) {
        return {
          handled: true,
          assistantText:
            "Include one or more email addresses and I’ll share the active document for you.",
        };
      }

      const data = await runtime.shareCurrentDocument?.({
        emails: intent.emails,
        role: "writer",
      });

      if (!isStillActive()) {
        return {
          handled: true,
          assistantText:
            "The active document changed before sharing finished, so I skipped posting a stale update.",
        };
      }

      return {
        handled: true,
        assistantText: `I shared "${activeDocumentLabel(runtime)}" with ${data?.shared
          ?.map((item) => item.email)
          .join(", ")}.`,
      };
    }

    if (intent.action === "rename_document") {
      if (!getPermissions(runtime).canRename) {
        return {
          handled: true,
          assistantText:
            "You do not have permission to rename the active document.",
        };
      }

      if (!intent.title) {
        return {
          handled: true,
          assistantText: "Tell me the new document name and I’ll rename the active file.",
        };
      }

      await runtime.renameCurrentDocument?.(intent.title);

      return {
        handled: true,
        assistantText: `I renamed the active document to "${activeDocumentLabel(runtime)}".`,
      };
    }

    if (intent.action === "export_document") {
      if (!getPermissions(runtime).canDownload) {
        return {
          handled: true,
          assistantText:
            "You do not have permission to download the active document.",
        };
      }

      await runtime.exportCurrentDocument?.(intent.format || "pdf");
      return {
        handled: true,
        assistantText: `I exported "${activeDocumentLabel(runtime)}"${
          intent.format ? ` as ${String(intent.format).toUpperCase()}` : ""
        }.`,
      };
    }

    if (intent.action === "print_document") {
      runtime.printCurrentDocument?.();
      return {
        handled: true,
        assistantText: `I opened the print flow for "${activeDocumentLabel(runtime)}".`,
      };
    }

    if (intent.action === "insert_table") {
      if (!getPermissions(runtime).canEdit) {
        return {
          handled: true,
          assistantText:
            "This document is view-only right now, so I can’t insert content into it.",
        };
      }

      runtime.execEditorAction?.("insertTable", {
        rows: intent.rows || 3,
        columns: intent.columns || 3,
      });
      return {
        handled: true,
        assistantText: `I inserted a ${intent.rows || 3} × ${intent.columns || 3} table into "${activeDocumentLabel(
          runtime
        )}".`,
      };
    }

    if (intent.action === "add_heading") {
      if (!getPermissions(runtime).canEdit) {
        return {
          handled: true,
          assistantText:
            "This document is view-only right now, so I can’t add a heading here.",
        };
      }

      await runtime.streamInsertContent?.(`## ${intent.headingText || "New heading"}\n\n`);
      return {
        handled: true,
        assistantText: `I added a heading to "${activeDocumentLabel(runtime)}".`,
      };
    }

    if (intent.action === "add_conclusion_section") {
      if (!getPermissions(runtime).canEdit) {
        return {
          handled: true,
          assistantText:
            "This document is view-only right now, so I can’t add a conclusion section.",
        };
      }

      const data = await runtime.runAiAction({
        action: "chat",
        question:
          "Write a polished conclusion section for the current document. Return only clean markdown-ready document content with a heading and concise closing paragraphs.",
        intentType: ASSISTANT_INTENT_TYPES.FORMAT_CONTENT,
      });

      if (!isStillActive()) {
        return {
          handled: true,
          assistantText:
            "The active document changed before the conclusion finished, so I stopped before writing into the wrong file.",
        };
      }

      await runtime.streamInsertContent?.(data?.result || "## Conclusion\n\n");

      return {
        handled: true,
        assistantText: `I added a conclusion section to "${activeDocumentLabel(runtime)}".`,
      };
    }

    if (intent.action === "add_content") {
      if (!getPermissions(runtime).canEdit) {
        return {
          handled: true,
          assistantText:
            "This document is view-only right now, so I can't add content.",
        };
      }

      const data = await runtime.runAiAction({
        action: "chat",
        question:
          `The user asked: "${intent.question}"\n\nBased on the document context, generate ONLY the new content to add. Do not repeat existing content. Do not include instructions or meta commentary. Return only clean markdown text ready to insert.`,
        intentType: ASSISTANT_INTENT_TYPES.EDIT_EXISTING_CONTENT,
        conversationHistory,
      });

      if (!isStillActive()) {
        return {
          handled: true,
          assistantText:
            "The active document changed before the content was ready, so I stopped before writing into the wrong file.",
        };
      }

      const result = data?.result || "";
      if (result) {
        await runtime.streamInsertContent?.(result);
        return {
          handled: true,
          assistantText: `I added the content to "${activeDocumentLabel(runtime)}".`,
        };
      }

      return {
        handled: true,
        assistantText: "I couldn't generate the content to add. Please try again with more details.",
      };
    }

    if (intent.action === "delete_document") {
      if (!getPermissions(runtime).canDelete) {
        return {
          handled: true,
          assistantText:
            "You do not have permission to delete the active document.",
        };
      }

      const deletedLabel = activeDocumentLabel(runtime);
      await runtime.deleteCurrentDocument?.();
      return {
        handled: true,
        assistantText: `I moved "${deletedLabel}" to trash.`,
      };
    }
  }

  const data = await runtime.runAiAction({
    action: intent.action || "chat",
    question: intent.question,
    intentType: intent.type || ASSISTANT_INTENT_TYPES.CHAT,
    conversationHistory,
  });

  if (!isStillActive()) {
    return {
      handled: true,
      assistantText:
        "The active document changed before the response finished, so I skipped posting a stale answer.",
    };
  }

  return {
    handled: true,
    assistantText: data?.result || "No response returned.",
  };
}
