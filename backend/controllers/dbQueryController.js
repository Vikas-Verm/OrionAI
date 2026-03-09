const { chatComplete } = require("../services/llmService");
const {
  queryCollection,
  aggregateCollection,
  countDocuments,
} = require("../services/dbQueryService");
const {
  DB_QUERY_SYSTEM_PROMPT,
  DB_FORMAT_PROMPT,
} = require("../prompts/dbPrompts");
const {
  loadConversation,
  saveConversation,
  updateSessionTitle,
  appendActivityLog,
} = require("../services/conversationService");

async function handleDbChat(req, res) {
  const { message, sessionId = "default" } = req.body;
  const userId = req.user.username;

  // Load conversation history
  const conversationHistory = await loadConversation(sessionId);
  conversationHistory.push({ role: "user", content: message });

  try {
    // Step 1 — Generate query
    const queryResponse = await chatComplete(
      [
        { role: "system", content: DB_QUERY_SYSTEM_PROMPT },
        { role: "user", content: message },
      ],
      600,
      0.1
    );
    console.log("DB chat request body:", DB_QUERY_SYSTEM_PROMPT, queryResponse);

    // Step 2 — Parse query plan
    let queryPlan;
    try {
      queryPlan = JSON.parse(queryResponse.replace(/```json|```/g, "").trim());
      console.log("Parsed query plan:", queryPlan);
    } catch (e) {
      const reply =
        "Could you rephrase that? Try: 'How many pending POs?' or 'Show unpaid bills from February'";
      conversationHistory.push({ role: "assistant", content: reply });
      await saveConversation(sessionId, conversationHistory);
      return res.json({ reply });
    }

    if (queryPlan.error) {
      conversationHistory.push({ role: "assistant", content: queryPlan.error });
      await saveConversation(sessionId, conversationHistory);
      return res.json({ reply: queryPlan.error });
    }

    // Step 3 — Execute query
    let results, resultCount;

    if (queryPlan.queryType === "aggregate") {
      results = await aggregateCollection(
        queryPlan.collection,
        queryPlan.pipeline
      );
    } else if (queryPlan.queryType === "count") {
      resultCount = await countDocuments(queryPlan.collection, queryPlan.query);
      results = [{ count: resultCount }];
    } else {
      results = await queryCollection(
        queryPlan.collection,
        queryPlan.query,
        queryPlan.sort,
        queryPlan.limit || 20
      );
    }

    resultCount = resultCount ?? results.length;

    // Step 4 — Format response
    const reply = await chatComplete(
      [
        {
          role: "user",
          content: DB_FORMAT_PROMPT(message, queryPlan, results, resultCount),
        },
      ],
      800,
      0.7
    );
    console.log("DB chat formatted reply:", reply);
    // Step 5 — Save conversation
    conversationHistory.push({ role: "assistant", content: reply });
    await saveConversation(sessionId, conversationHistory);

    // Step 6 — Auto title from first message
    const userMessageCount = conversationHistory.filter(
      (m) => m.role === "user"
    ).length;
    if (userMessageCount === 1) {
      const title = `📊 ${message.substring(0, 35)}${
        message.length > 35 ? "..." : ""
      }`;
      await updateSessionTitle(sessionId, title);
    }

    // Step 7 — Save activity log entry
    await appendActivityLog(sessionId, {
      message,
      collection: queryPlan.collection,
      queryType: queryPlan.queryType,
      explanation: queryPlan.explanation,
      recordCount: resultCount,
    });

    res.json({ reply, recordCount: resultCount, queryPlan });
  } catch (error) {
    console.error("DB chat error:", error.message);

    if (error.message.includes("not accessible")) {
      return res.json({ reply: "I don't have access to that collection." });
    }

    res.status(500).json({ error: "Something went wrong" });
  }
}

module.exports = { handleDbChat };
