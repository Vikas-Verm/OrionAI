/**
 * agentRegistry.js
 *
 * Central registry of all sub-agents.
 * The super-agent uses this to route each step to the right agent.
 *
 * To add a new integration, create its agent file and add it here.
 * Nothing else needs to change.
 */

const slackAgent = require("./slackAgent");
const telegramAgent = require("./telegramAgent");
const jiraAgent = require("./jiraAgent");
const gmailAgent = require("./gmailAgent");
const calendarAgent = require("./calendarAgent");
const googleDocsAgent = require("./googleDocsAgent");
const googleSheetsAgent = require("./googleSheetsAgent");
const documentAgent = require("./documentAgent");

/** Ordered list of all registered sub-agents */
const AGENTS = [
  slackAgent,
  telegramAgent,
  jiraAgent,
  gmailAgent,
  calendarAgent,
  googleDocsAgent,
  googleSheetsAgent,
  documentAgent,
];

/**
 * Resolve the sub-agent that handles a given tool name.
 * @param {string} toolName
 * @returns {BaseAgent|null}
 */
function resolveAgent(toolName) {
  return AGENTS.find((a) => a.handles(toolName)) || null;
}

/**
 * All tool names across all agents (used for validation / prompt building).
 */
function getAllTools() {
  return AGENTS.flatMap((a) => a.tools);
}

module.exports = { AGENTS, resolveAgent, getAllTools };
