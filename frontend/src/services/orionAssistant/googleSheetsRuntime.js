function normalizeQuestion(question = "") {
  return String(question || "").trim().replace(/\s+/g, " ");
}

function extractEmails(question = "") {
  return Array.from(
    new Set(
      String(question || "").match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []
    )
  );
}

function inferChartType(question = "") {
  const text = String(question || "").toLowerCase();
  if (text.includes("pie")) return "pie";
  if (text.includes("line")) return "line";
  if (text.includes("area")) return "area";
  if (text.includes("bar")) return "bar";
  return "column";
}

function activeLabel(runtime = {}) {
  const title = runtime.getActiveEntityTitle?.() || "the active spreadsheet";
  const sheet = runtime.getActiveSheetTitle?.();
  return sheet ? `${title} / ${sheet}` : title;
}

function classifySheetIntent(question = "") {
  const normalized = normalizeQuestion(question);
  const lower = normalized.toLowerCase();

  if (/\bshare\b/.test(lower)) {
    return { action: "share_spreadsheet", emails: extractEmails(normalized) };
  }

  if (/\b(rename|retitle)\b/.test(lower) && /\b(spreadsheet|sheet|file)\b/.test(lower)) {
    const renameMatch =
      normalized.match(/\brename(?:\s+this)?\s+(?:spreadsheet|sheet|file)\s+to\s+["“]?(.+?)["”]?$/i) ||
      normalized.match(/\brename\s+to\s+["“]?(.+?)["”]?$/i);
    return {
      action: "rename_spreadsheet",
      title: renameMatch?.[1]?.trim() || "",
    };
  }

  if (/\b(export|download)\b/.test(lower)) {
    return {
      action: "export_spreadsheet",
      format: lower.includes("pdf")
        ? "pdf"
        : lower.includes("csv")
          ? "csv"
          : "xlsx",
    };
  }

  if (/\bprint\b/.test(lower)) {
    return { action: "print_spreadsheet" };
  }

  if (/\bwhich month\b/.test(lower) && /\bhighest\b/.test(lower)) {
    return { action: "highest_month" };
  }

  if ((/\bcalculate\b/.test(lower) && /\btotal\b/.test(lower)) || /\btotal spend\b/.test(lower)) {
    return { action: "calculate_total_spend" };
  }

  if (/\b(chart|graph|plot|visualize)\b/.test(lower)) {
    return {
      action: "create_chart",
      chartType: inferChartType(lower),
    };
  }

  if (/\b(clean|dedupe|deduplicate|duplicate rows?|remove duplicates)\b/.test(lower)) {
    return { action: "remove_duplicates" };
  }

  if ((/\bformat\b/.test(lower) && /\b(sheet|table)\b/.test(lower)) || /\bprofessionally\b/.test(lower)) {
    return { action: "format_sheet_professionally" };
  }

  if (/\bmonthly summary\b/.test(lower) || /\bsummary sheet\b/.test(lower)) {
    return { action: "create_monthly_summary_sheet" };
  }

  if (/\bhighlight\b/.test(lower) && /\b(remaining|budget|balance)\b/.test(lower)) {
    return { action: "highlight_low_remaining_budget" };
  }

  if (/\badd\b/.test(lower) && /\bformula/.test(lower) && /\bremaining\b/.test(lower)) {
    return { action: "add_remaining_formulas" };
  }

  if (/\btotals row\b/.test(lower) || /\btotal row\b/.test(lower)) {
    return { action: "create_totals_row" };
  }

  if (/\bsort\b/.test(lower)) {
    return {
      action: lower.includes("desc") || lower.includes("z to a") ? "sort_desc" : "sort_asc",
    };
  }

  if (/\bfilter\b/.test(lower)) {
    return { action: "open_filter" };
  }

  if (/\bformula\b/.test(lower) || /\bexplain\b/.test(lower)) {
    return { action: "formula_help" };
  }

  if (/\bforecast\b/.test(lower)) {
    return { action: "forecast" };
  }

  if (/\b(summary|summarize|report)\b/.test(lower)) {
    return { action: "summarize_sheet" };
  }

  if (/\b(trend|insight|analyze|analysis)\b/.test(lower)) {
    return { action: "analyze_data" };
  }

  return { action: "chat" };
}

function permissions(runtime = {}) {
  return runtime.getPermissions?.() || {};
}

export async function executeGoogleSheetsAssistantCommand({ question, runtime }) {
  const normalized = normalizeQuestion(question);
  if (!runtime.getActiveEntityId?.()) {
    return {
      handled: true,
      assistantText: "Open a Google Sheet first so I can work on the active spreadsheet.",
    };
  }

  const activeSpreadsheetId = runtime.getActiveEntityId?.();
  const activeSheetTitle = runtime.getActiveSheetTitle?.();
  const intent = classifySheetIntent(normalized);
  const isStillActive = () =>
    runtime.getScope?.() === "google_sheets" &&
    runtime.getActiveEntityId?.() === activeSpreadsheetId &&
    runtime.getActiveSheetTitle?.() === activeSheetTitle;

  if (intent.action === "share_spreadsheet") {
    if (!permissions(runtime).canShare) {
      return {
        handled: true,
        assistantText: "You do not have permission to share the active spreadsheet.",
      };
    }
    if (!intent.emails?.length) {
      return {
        handled: true,
        assistantText: "Include one or more email addresses and I’ll share the active spreadsheet for you.",
      };
    }
    await runtime.shareCurrentFile?.({ emails: intent.emails, role: "writer" });
    return {
      handled: true,
      assistantText: `I shared ${activeLabel(runtime)} with ${intent.emails.join(", ")}.`,
    };
  }

  if (intent.action === "rename_spreadsheet") {
    if (!permissions(runtime).canRename) {
      return {
        handled: true,
        assistantText: "You do not have permission to rename the active spreadsheet.",
      };
    }
    if (!intent.title) {
      return {
        handled: true,
        assistantText: "Tell me the new spreadsheet name and I’ll rename it.",
      };
    }
    await runtime.renameCurrentFile?.(intent.title);
    return {
      handled: true,
      assistantText: `I renamed the active spreadsheet to "${intent.title}".`,
    };
  }

  if (intent.action === "export_spreadsheet") {
    if (!permissions(runtime).canDownload) {
      return {
        handled: true,
        assistantText: "You do not have permission to download the active spreadsheet.",
      };
    }
    await runtime.exportCurrentFile?.(intent.format || "xlsx");
    return {
      handled: true,
      assistantText: `I exported ${activeLabel(runtime)} as ${(intent.format || "xlsx").toUpperCase()}.`,
    };
  }

  if (intent.action === "print_spreadsheet") {
    runtime.printCurrentFile?.();
    return {
      handled: true,
      assistantText: `I opened the print flow for ${activeLabel(runtime)}.`,
    };
  }

  if (intent.action === "calculate_total_spend") {
    const summary = runtime.calculateTotalSpend?.();
    if (summary) {
      return {
        handled: true,
        assistantText: summary,
      };
    }
  }

  if (intent.action === "highest_month") {
    const summary = runtime.findHighestMonth?.();
    if (summary) {
      return {
        handled: true,
        assistantText: summary,
      };
    }
  }

  if (intent.action === "create_chart") {
    const created = await runtime.createChartFromSelection?.({
      chartType: intent.chartType || "column",
    });
    return {
      handled: true,
      assistantText: created
        ? `I created a ${intent.chartType || "column"} chart for the active range in ${activeLabel(runtime)}.`
        : "Select at least two columns of data first so I can build a chart from the active range.",
    };
  }

  if (intent.action === "remove_duplicates") {
    const cleaned = await runtime.removeDuplicateRows?.();
    return {
      handled: true,
      assistantText: cleaned
        ? `I removed duplicate rows from the active range in ${activeLabel(runtime)}.`
        : "Select a range first so I know which rows to clean.",
    };
  }

  if (intent.action === "format_sheet_professionally") {
    if (!permissions(runtime).canEdit) {
      return {
        handled: true,
        assistantText: "This spreadsheet is view-only right now, so I can’t apply formatting changes.",
      };
    }
    const formatted = await runtime.formatSheetProfessionally?.();
    return {
      handled: true,
      assistantText: formatted
        ? `I formatted the active table in ${activeLabel(runtime)} with a cleaner spreadsheet layout.`
        : "Select a table or make sure the active sheet has tabular data first, then try again.",
    };
  }

  if (intent.action === "create_monthly_summary_sheet") {
    if (!permissions(runtime).canEdit) {
      return {
        handled: true,
        assistantText: "This spreadsheet is view-only right now, so I can’t create a summary sheet.",
      };
    }
    const created = await runtime.createMonthlySummarySheet?.();
    return {
      handled: true,
      assistantText: created
        ? `I created a summary sheet from ${activeLabel(runtime)}.`
        : "I couldn’t find enough numeric columns in the active sheet to build a useful summary sheet.",
    };
  }

  if (intent.action === "highlight_low_remaining_budget") {
    if (!permissions(runtime).canEdit) {
      return {
        handled: true,
        assistantText: "This spreadsheet is view-only right now, so I can’t highlight cells for you.",
      };
    }
    const highlighted = await runtime.highlightLowRemainingBudget?.();
    return {
      handled: true,
      assistantText: highlighted
        ? `I highlighted low remaining-budget cells in ${activeLabel(runtime)}.`
        : "I couldn’t find a remaining or balance column to highlight in the active table.",
    };
  }

  if (intent.action === "add_remaining_formulas") {
    if (!permissions(runtime).canEdit) {
      return {
        handled: true,
        assistantText: "This spreadsheet is view-only right now, so I can’t write formulas into it.",
      };
    }
    const applied = await runtime.addRemainingFormulas?.();
    return {
      handled: true,
      assistantText: applied
        ? `I added remaining formulas to the active table in ${activeLabel(runtime)}.`
        : "I couldn’t detect budget, spend, and remaining columns in the active table.",
    };
  }

  if (intent.action === "create_totals_row") {
    if (!permissions(runtime).canEdit) {
      return {
        handled: true,
        assistantText: "This spreadsheet is view-only right now, so I can’t add a totals row.",
      };
    }
    const created = await runtime.createTotalsRow?.();
    return {
      handled: true,
      assistantText: created
        ? `I added a totals row below the active table in ${activeLabel(runtime)}.`
        : "I couldn’t find a numeric table to total in the active sheet.",
    };
  }

  if (intent.action === "sort_asc" || intent.action === "sort_desc") {
    if (!permissions(runtime).canEdit) {
      return {
        handled: true,
        assistantText: "This spreadsheet is view-only right now, so I can’t sort the active range.",
      };
    }
    await runtime.sortActiveRange?.(intent.action === "sort_desc" ? "desc" : "asc");
    return {
      handled: true,
      assistantText: `I sorted the active range in ${activeLabel(runtime)} ${intent.action === "sort_desc" ? "Z to A" : "A to Z"}.`,
    };
  }

  if (intent.action === "open_filter") {
    runtime.openFilterDialog?.();
    return {
      handled: true,
      assistantText: `I opened the filter controls for ${activeLabel(runtime)}.`,
    };
  }

  if (intent.action === "formula_help") {
    const activeCell = runtime.getActiveCell?.();
    if (!activeCell?.formula) {
      return {
        handled: true,
        assistantText: "Select a cell with a formula first, then I can explain exactly what it is doing.",
      };
    }
    const data = await runtime.runAiAction?.({
      action: "formula_help",
      question: normalized,
    });
    if (!isStillActive()) {
      return {
        handled: true,
        assistantText: "The active sheet changed before the formula explanation finished, so I skipped returning a stale answer.",
      };
    }
    return {
      handled: true,
      assistantText: data?.result || "No response returned.",
    };
  }

  const action =
    intent.action === "forecast"
      ? "forecast"
      : intent.action === "summarize_sheet"
        ? "summarize_sheet"
        : "analyze_data";

  const data = await runtime.runAiAction?.({
    action,
    question: normalized,
  });

  if (!isStillActive()) {
    return {
      handled: true,
      assistantText: "The active sheet changed before the response finished, so I skipped returning a stale answer.",
    };
  }

  return {
    handled: true,
    assistantText: data?.result || "No response returned.",
  };
}
