/**
 * googleDocsAgent.js
 *
 * Sub-agent for all Google Docs operations.
 */

const BaseAgent = require("./baseAgent");
const {
  toolGoogleDocsListDocs,
  toolGoogleDocsGetDoc,
  toolGoogleDocsCreateDoc,
  toolGoogleDocsUpdateDoc,
  toolGoogleDocsShareDoc,
  toolGoogleDocsDeleteDoc,
  toolGoogleDocsSearchDocs,
} = require("../tools/toolGoogleDocs");

const TOOLS = [
  "google_docs_list",
  "google_docs_get",
  "google_docs_create",
  "google_docs_update",
  "google_docs_share",
  "google_docs_delete",
  "google_docs_search",
];

class GoogleDocsAgent extends BaseAgent {
  constructor() {
    super("google_docs", TOOLS);
  }

  async execute(tool, params, ctx) {
    switch (tool) {
      case "google_docs_list":
        return toolGoogleDocsListDocs(params, ctx);

      case "google_docs_get": {
        const result = await toolGoogleDocsGetDoc(params, ctx);
        ctx.lastGoogleDoc = result.richGoogleDoc;
        return result;
      }

      case "google_docs_create": {
        const result = await toolGoogleDocsCreateDoc(params, ctx);
        ctx.lastGoogleDoc = result.richGoogleDoc;
        return result;
      }

      case "google_docs_update":
        return toolGoogleDocsUpdateDoc(params, ctx);

      case "google_docs_share":
        return toolGoogleDocsShareDoc(params, ctx);

      case "google_docs_delete":
        return toolGoogleDocsDeleteDoc(params, ctx);

      case "google_docs_search":
        return toolGoogleDocsSearchDocs(params, ctx);

      default:
        throw new Error(`GoogleDocsAgent: unknown tool "${tool}"`);
    }
  }
}

module.exports = new GoogleDocsAgent();
