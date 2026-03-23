/**
 * baseAgent.js
 *
 * Abstract base class for all sub-agents.
 * Each agent owns a set of tools and knows how to execute them.
 */

class BaseAgent {
  /**
   * @param {string} name       - Agent identifier, e.g. "slack"
   * @param {string[]} tools    - Tool names this agent handles
   */
  constructor(name, tools) {
    this.name = name;
    this.tools = tools;
  }

  /** Returns true if this agent handles the given tool name */
  handles(toolName) {
    return this.tools.includes(toolName);
  }

  /**
   * Execute a single tool step.
   * @param {string} tool    - Tool name
   * @param {object} params  - Tool params (already resolved)
   * @param {object} ctx     - Shared execution context (userId, lastCreatedTicketKey, etc.)
   * @returns {Promise<object>} - Tool result
   */
  // eslint-disable-next-line no-unused-vars
  async execute(tool, params, ctx) {
    throw new Error(`${this.name}Agent.execute() not implemented`);
  }
}

module.exports = BaseAgent;
