import { classifyAssistantIntent } from "./intents";
import { executeGoogleDocsAssistantCommand } from "./googleDocsRuntime";
import { executeGoogleSheetsAssistantCommand } from "./googleSheetsRuntime";

const scopeHandlers = new Map([
  ["google_docs", executeGoogleDocsAssistantCommand],
  ["google_sheets", executeGoogleSheetsAssistantCommand],
]);

export function registerAssistantScopeHandler(scope, handler) {
  if (!scope || typeof handler !== "function") return;
  scopeHandlers.set(scope, handler);
}

export async function executeScopedAssistantCommand({
  question,
  scope,
  runtime,
  conversationHistory = [],
}) {
  const intent = classifyAssistantIntent(question, { scope });
  const handler = scopeHandlers.get(intent.scope || scope);

  if (!handler) {
    return {
      handled: true,
      intent,
      assistantText:
        "This OrionAI assistant action is not available on the current page yet.",
    };
  }

  const result = await handler({
    question,
    intent,
    runtime,
    conversationHistory,
  });

  return {
    intent,
    ...result,
  };
}
