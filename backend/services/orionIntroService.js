"use strict";

const {
  ORION_IDENTITY,
  hasPublicDeploymentConfig,
} = require("../config/orionIdentity");
const { normalizeOnboarding, toPlainObject } = require("../utils/onboarding");
const { isConnectedIntegration } = require("./integrationConnectionState");

const APP_LABELS = Object.freeze({
  gmail: "Gmail",
  slack: "Slack",
  telegram: "Telegram",
  signal: "Signal",
  whatsapp: "WhatsApp",
  jira: "Jira",
  google_calendar: "Google Calendar",
  google_docs: "Google Docs",
  google_sheets: "Google Sheets",
  database: "Database",
  razorpay: "Razorpay",
  notion: "Notion",
  webhook: "Webhook",
});

const GREETING_RE = /^(hi+|hello+|hey+|heya|hiya|namaste|yo)[.!?\s]*$/i;

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[\u2019']/g, "'")
    .replace(/[^a-z0-9#+./\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function includesAny(text, phrases = []) {
  return phrases.some((phrase) => text.includes(phrase));
}

function detectIntroMetaIntent(message) {
  const text = normalizeText(message);
  if (!text) return null;

  if (GREETING_RE.test(text)) return "greeting";

  const asksName = includesAny(text, [
    "what is your name",
    "what's your name",
    "your name",
  ]);
  const asksIdentity = includesAny(text, [
    "who are you",
    "what are you",
    "introduce yourself",
    "tell me about yourself",
  ]);
  if (asksName || asksIdentity) return "identity";

  if (
    includesAny(text, [
      "what can you do",
      "what do you do",
      "how can you help",
      "your capabilities",
      "your features",
    ])
  ) {
    return "capabilities";
  }

  if (
    includesAny(text, [
      "what is orionai",
      "what is orion ai",
      "about orionai",
      "about orion ai",
    ])
  ) {
    return "product";
  }

  if (
    includesAny(text, [
      "your configuration",
      "orionai configuration",
      "orion ai configuration",
      "configured",
      "configuration orionai",
      "configuration orion ai",
      "not chatgpt",
    ])
  ) {
    return "configuration";
  }

  if (
    includesAny(text, [
      "which stack",
      "what stack",
      "on which stack",
      "tech stack",
      "technical stack",
      "built on",
      "created on",
      "created with",
      "built with",
      "which model",
      "what model",
      "model are you using",
      "ai model",
      "llm",
      "provider",
    ])
  ) {
    return "stack";
  }

  if (
    includesAny(text, [
      "are you chatgpt",
      "r u chatgpt",
      "are u chatgpt",
      "is this chatgpt",
    ])
  ) {
    return "chatgpt";
  }

  return null;
}

function listWithAnd(items = []) {
  const values = items.map((item) => String(item || "").trim()).filter(Boolean);
  if (values.length <= 1) return values.join("");
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(", ")}, and ${values[values.length - 1]}`;
}

function selectProductModules(enabledModules = []) {
  const modules = enabledModules.length
    ? enabledModules
    : [
        "My Day",
        "Messages",
        "Bills & Documents",
        "Study & Learning",
        "Career & Interviews",
        "Team & Work",
        "Engineering & Releases",
      ];
  return modules.slice(0, 8);
}

function normalizeEnabledModules(user = {}, identity = ORION_IDENTITY) {
  const onboarding = normalizeOnboarding(toPlainObject(user).onboarding);
  const supported = new Set(identity.supportedModules);
  return onboarding.focusAreas.filter((area) => supported.has(area));
}

function summarizeConnectedApps(integrations = []) {
  return integrations
    .filter((integration) => integration?.enabled !== false)
    .filter((integration) => isConnectedIntegration(integration))
    .map((integration) => APP_LABELS[integration.type] || integration.type)
    .filter(Boolean);
}

function getSelectedRole(context = {}) {
  const user = toPlainObject(context.user);
  const candidates = [
    context.role,
    user.role,
    user.userRole,
    user.profileRole,
    user.workspaceRole,
  ];

  for (const candidate of candidates) {
    const value = String(candidate || "").trim();
    if (value) return value;
  }

  return "";
}

function buildWorkspaceContext(context = {}) {
  const identity = context.identity || ORION_IDENTITY;
  return {
    selectedRole: getSelectedRole(context),
    enabledModules: normalizeEnabledModules(context.user, identity),
    connectedApps: summarizeConnectedApps(context.integrations),
    fileCount: Array.isArray(context.sessionFiles) ? context.sessionFiles.length : 0,
  };
}

function buildDeploymentConfigLines(config = {}) {
  const lines = [];
  if (config.frontend) lines.push(`Frontend: ${config.frontend}`);
  if (config.backend) lines.push(`Backend: ${config.backend}`);
  if (config.database) lines.push(`Database: ${config.database}`);
  if (config.hosting) lines.push(`Hosting: ${config.hosting}`);
  if (config.aiProvider) lines.push(`AI provider: ${config.aiProvider}`);
  if (config.aiModel) lines.push(`AI model: ${config.aiModel}`);
  if (Array.isArray(config.integrations) && config.integrations.length) {
    lines.push(`Integrations: ${config.integrations.join(", ")}`);
  }
  return lines;
}

function buildContextSentence(workspace) {
  const parts = [];
  if (workspace.selectedRole) {
    parts.push(`Selected role: ${workspace.selectedRole}`);
  }
  if (workspace.enabledModules.length) {
    parts.push(`Enabled modules: ${workspace.enabledModules.join(", ")}`);
  }
  if (workspace.connectedApps.length) {
    parts.push(`Connected apps I can currently use: ${workspace.connectedApps.join(", ")}`);
  }
  if (workspace.fileCount > 0) {
    parts.push(`Uploaded files in this session: ${workspace.fileCount}`);
  }

  return parts.length ? `\n\nCurrent workspace context: ${parts.join(". ")}.` : "";
}

function buildIntroMetaResponse(intent, context = {}) {
  const identity = context.identity || ORION_IDENTITY;
  const workspace = buildWorkspaceContext({ ...context, identity });
  const deploymentConfig = context.deploymentConfig || {};
  const modules = selectProductModules(workspace.enabledModules);
  const moduleList = listWithAnd(modules);
  const contextSentence = buildContextSentence(workspace);

  if (intent === "greeting") {
    return `Hi! I'm ${identity.productName}. I can help you organize your day, messages, documents, learning, work, projects, and connected app information into clear actions. What would you like to work on today?`;
  }

  if (intent === "identity") {
    return `My name is ${identity.productName}. I'm a personal AI workspace built to help you manage different parts of your life and work, like ${moduleList}. I become more useful based on the modules you enable, the role you choose, and the apps or files you connect.${contextSentence}`;
  }

  if (intent === "capabilities" || intent === "product") {
    const connectedLine = workspace.connectedApps.length
      ? ` Right now, I can use connected apps like ${listWithAnd(workspace.connectedApps)}.`
      : " Once you connect relevant apps or files, I can give deeper insights from your real workspace data.";
    return `${identity.productName} is ${identity.shortIntro} I can help across modules like ${moduleList}.${connectedLine}${contextSentence}`;
  }

  if (intent === "chatgpt") {
    return `I'm ${identity.productName}, the OrionAI product experience. I should not answer with a generic ChatGPT identity or invent model/provider details. I can explain OrionAI's product behavior and capabilities, and I only share technical configuration when it is explicitly available in this environment.`;
  }

  if (intent === "configuration") {
    const enabled = workspace.enabledModules.length
      ? ` Enabled modules: ${workspace.enabledModules.join(", ")}.`
      : ` Available product modules include ${identity.supportedModules.join(", ")}.`;
    const apps = workspace.connectedApps.length
      ? ` Connected apps I can currently use: ${workspace.connectedApps.join(", ")}.`
      : " No connected apps are available to this chat context right now.";
    const files = workspace.fileCount > 0
      ? ` Uploaded files in this session: ${workspace.fileCount}.`
      : "";
    return `Understood. ${identity.productName}'s product configuration is based on enabled modules, selected role, connected apps, uploaded files, and available user data. I should not describe generic ChatGPT configuration or invent deployment details.${enabled}${apps}${files}`;
  }

  if (intent === "stack") {
    const lines = buildDeploymentConfigLines(deploymentConfig);
    if (hasPublicDeploymentConfig(deploymentConfig) && lines.length) {
      return `${identity.productName} is currently configured with:\n${lines.join(
        "\n"
      )}\nI only show values that are available in the current configuration.`;
    }

    return `I'm ${identity.productName}, the product. I should not guess my technical stack. ${identity.deploymentConfigUnavailable}`;
  }

  return null;
}

function maybeBuildIntroMetaResponse(message, context = {}) {
  const intent = detectIntroMetaIntent(message);
  if (!intent) return null;
  return buildIntroMetaResponse(intent, context);
}

module.exports = {
  detectIntroMetaIntent,
  buildIntroMetaResponse,
  maybeBuildIntroMetaResponse,
  buildWorkspaceContext,
  __test: {
    normalizeText,
    summarizeConnectedApps,
    buildDeploymentConfigLines,
  },
};
