const {
  loadConversation,
  saveConversation,
  updateSessionTitle,
} = require("../services/conversationService");
const { loadMemory, saveMemory } = require("../services/memoryService");
const { chatStream, chatComplete } = require("../services/llmService");
const { retrieveChunks, getSessionFiles } = require("../services/fileService");
const User = require("../models/user");
const Integration = require("../models/Integration");
const {
  buildOrionIdentitySystemPrompt,
  getPublicDeploymentConfig,
} = require("../config/orionIdentity");
const {
  detectIntroMetaIntent,
  buildIntroMetaResponse,
} = require("../services/orionIntroService");

const CHAT_BEHAVIOR_PROMPT = `You help OrionAI users with clear, practical answers.
Explain concepts with useful examples when helpful.
Format responses using readable markdown.
Stay helpful, accurate, and concise.`;

const SUMMARY_THRESHOLD = 10;
const RECENT_MESSAGES_TO_KEEP = 4;

const continueKeywords = [
  "continue",
  "where we left",
  "previous",
  "last time",
  "what did we",
  "what have we",
  "remind me",
  "recap",
  "what was",
  "carry on",
  "from before",
];

// ── Helper: build RAG context string ──────────────────────
function buildRagContext(chunks, fileNames) {
  return `\n\nRelevant information from: "${fileNames}"\n\n${chunks
    .map((c, i) => `[${i + 1}] ${c.content}`)
    .join(
      "\n\n"
    )}\n\nAnswer using the above context. If unrelated to files, use general knowledge.`;
}

// ── Helper: smart conversation summarization ──────────────
async function getSmartContext(conversationHistory) {
  if (conversationHistory.length <= SUMMARY_THRESHOLD) {
    return conversationHistory;
  }

  const oldMessages = conversationHistory.slice(0, -RECENT_MESSAGES_TO_KEEP);
  const recentMessages = conversationHistory.slice(-RECENT_MESSAGES_TO_KEEP);

  const alreadySummarized =
    oldMessages[0]?.role === "assistant" &&
    oldMessages[0]?.content.startsWith("To summarize");

  let summaryMessage;

  if (alreadySummarized) {
    summaryMessage = oldMessages[0];
  } else {
    const summaryText = await chatComplete([
      {
        role: "user",
        content: `Summarize this conversation in 3-4 bullet points. Brief and factual only:\n\n${oldMessages
          .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
          .join("\n")}`,
      },
    ]);
    summaryMessage = {
      role: "assistant",
      content: `To summarize what we discussed: ${summaryText}`,
    };
  }

  return [summaryMessage, ...recentMessages];
}

// ── Helper: build RAG context from session files ──────────
async function buildFileContext(message, sessionId, sessionFiles) {
  if (sessionFiles.length === 0) return "";

  let goodChunks = [];
  console.log(
    "📁 Session files:",
    sessionFiles.map((f) => f.filename)
  );
  console.log("🔍 Query:", message);
  if (sessionFiles.length === 1) {
    // Single file — retrieve directly, no routing needed
    const chunks = await retrieveChunks(
      message,
      sessionId,
      8,
      sessionFiles[0].fileId
    );
    goodChunks = chunks.filter((c) => c.score > 0.3);
  } else {
    // Multiple files — ask AI which file is relevant first
    const fileList = sessionFiles
      .map(
        (f, i) =>
          `${i + 1}. "${f.filename}" (${f.totalChunks} chunks, type: ${
            f.fileType
          })`
      )
      .join("\n");

    const filePickResponse = await chatComplete(
      [
        {
          role: "system",
          content: `You are a file routing assistant. Given a user question and a list of uploaded files, respond with ONLY a JSON array of filename strings that are relevant to the question. Example: ["ArtiTicket18April.pdf"] or ["file1.pdf", "file2.pdf"] if multiple files are needed. Never explain, never add text outside the JSON array.`,
        },
        {
          role: "user",
          content: `Files available:\n${fileList}\n\nUser question: "${message}"\n\nWhich files are relevant?`,
        },
      ],
      100,
      0.1
    );

    // Parse which files AI picked
    let pickedNames = [];
    try {
      pickedNames = JSON.parse(
        filePickResponse.replace(/```json|```/g, "").trim()
      );
    } catch (e) {
      // Fallback — search all files
      pickedNames = sessionFiles.map((f) => f.filename);
    }

    // Match picked names to actual files
    const targetFiles = sessionFiles.filter((f) =>
      pickedNames.includes(f.filename)
    );
    const searchFiles = targetFiles.length > 0 ? targetFiles : sessionFiles;

    // Retrieve chunks from picked files only
    const allChunks = [];
    for (const file of searchFiles) {
      const chunks = await retrieveChunks(message, sessionId, 5, file.fileId);
      allChunks.push(...chunks);
    }
    console.log(
      "✅ Good chunks:",
      goodChunks.length,
      goodChunks.map((c) => ({ file: c.filename, score: c.score.toFixed(2) }))
    );
    // Sort by score and filter low relevance
    goodChunks = allChunks
      .sort((a, b) => b.score - a.score)
      .filter((c) => c.score > 0.3)
      .slice(0, 8);
  }

  if (goodChunks.length === 0) return "";

  const fileNames = [...new Set(goodChunks.map((c) => c.filename))].join(", ");
  return buildRagContext(goodChunks, fileNames);
}

function writeSseHeaders(res) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
}

async function saveCompletedChatReply(sessionId, conversationHistory, message, reply) {
  conversationHistory.push({ role: "user", content: message });
  conversationHistory.push({ role: "assistant", content: reply });

  const userMessageCount = conversationHistory.filter(
    (m) => m.role === "user"
  ).length;

  if (userMessageCount === 1) {
    const title = message.substring(0, 40) + (message.length > 40 ? "..." : "");
    await updateSessionTitle(sessionId, title);
  }

  await saveConversation(sessionId, conversationHistory);
  return userMessageCount;
}

async function sendControlledIntroResponse({
  req,
  res,
  message,
  sessionId,
  userId,
  intent,
}) {
  const deploymentConfig = getPublicDeploymentConfig();
  const [conversationHistory, user, integrations, sessionFiles] = await Promise.all([
    loadConversation(sessionId),
    req.user?.userId
      ? User.findById(req.user.userId).lean().catch(() => null)
      : Promise.resolve(null),
    userId ? Integration.find({ userId }).lean().catch(() => []) : Promise.resolve([]),
    getSessionFiles(sessionId).catch(() => []),
  ]);

  const reply = buildIntroMetaResponse(intent, {
    user,
    integrations,
    sessionFiles,
    deploymentConfig,
  });

  writeSseHeaders(res);
  res.write(`data: ${JSON.stringify({ token: reply })}\n\n`);
  res.write("data: [DONE]\n\n");

  try {
    await saveCompletedChatReply(sessionId, conversationHistory, message, reply);
  } catch (error) {
    console.error("Controlled intro save failed:", error.message);
  }

  res.end();
}

// ── Main chat handler ─────────────────────────────────────
async function handleChat(req, res) {
  const {
    message,
    sessionId = "default",
    webSearch: useWebSearch = false,
  } = req.body; // ← added useWebSearch

  const userId = req.user.username;
  const userMessage = String(message || "").trim();

  if (!userMessage) {
    return res.status(400).json({ error: "Message is required" });
  }

  const introIntent = detectIntroMetaIntent(userMessage);
  if (introIntent) {
    try {
      await sendControlledIntroResponse({
        req,
        res,
        message: userMessage,
        sessionId,
        userId,
        intent: introIntent,
      });
    } catch (error) {
      console.error("Controlled intro response failed:", error.message);
      res.status(500).json({ error: "Something went wrong" });
    }
    return;
  }

  let searchContext = "";

  if (useWebSearch) {
    try {
      const { webSearch } = require("../services/searchService");
      const { answer, results } = await webSearch(userMessage); // ← Tavily returns { answer, results }

      if (results.length > 0) {
        searchContext = `\n\nWeb search results for: "${userMessage}"\n`;

        if (answer) {
          searchContext += `Quick answer: ${answer}\n\n`;
        }

        searchContext += results
          .map(
            (r, i) =>
              `[${i + 1}] ${r.title}\nURL: ${r.url}\nContent: ${r.snippet}`
          )
          .join("\n\n");

        searchContext += `\n\nInstructions: Use the above results to answer accurately. Cite sources inline as [1], [2] etc. Today's date: ${new Date().toLocaleDateString(
          "en-IN"
        )}.`;
      }
    } catch (e) {
      console.error("Search failed, continuing without:", e.message);
    }
  }

  const wantsContext = continueKeywords.some((kw) =>
    userMessage.toLowerCase().includes(kw)
  );

  const [conversationHistory, userMemory, sessionFiles] = await Promise.all([
    loadConversation(sessionId),
    wantsContext ? loadMemory(userId) : Promise.resolve(null),
    getSessionFiles(sessionId),
  ]);

  const ragContext = await buildFileContext(userMessage, sessionId, sessionFiles);

  conversationHistory.push({ role: "user", content: userMessage });

  const dynamicSystemPrompt = `${buildOrionIdentitySystemPrompt({
    deploymentConfig: getPublicDeploymentConfig(),
  })}\n\n${CHAT_BEHAVIOR_PROMPT}${
    userMemory ? `\n\nContext from previous sessions:\n${userMemory}` : ""
  }${ragContext}${searchContext}`; // ← searchContext injected here

  try {
    const smartContext = await getSmartContext(conversationHistory);

    writeSseHeaders(res);

    const response = await chatStream([
      { role: "system", content: dynamicSystemPrompt },
      ...smartContext.map((m) => ({
        role: m.role,
        content: String(m.content || ""),
      })),
    ]);

    let fullReply = "";

    response.data.on("data", (chunk) => {
      const lines = chunk
        .toString()
        .split("\n")
        .filter((l) => l.trim());
      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6);
          if (data === "[DONE]") {
            res.write("data: [DONE]\n\n");
            continue;
          }
          try {
            const parsed = JSON.parse(data);
            const token = parsed.choices?.[0]?.delta?.content;
            if (token) {
              fullReply += token;
              res.write(`data: ${JSON.stringify({ token })}\n\n`);
            }
          } catch (e) {}
        }
      }
    });

    response.data.on("end", async () => {
      conversationHistory.push({ role: "assistant", content: fullReply });

      const userMessageCount = conversationHistory.filter(
        (m) => m.role === "user"
      ).length;

      if (userMessageCount === 1) {
        const title =
          userMessage.substring(0, 40) + (userMessage.length > 40 ? "..." : "");
        await updateSessionTitle(sessionId, title);
      }

      await saveConversation(sessionId, conversationHistory);

      if (userMessageCount % 4 === 0) {
        const currentMemory = await loadMemory(userId);
        const conversationText = conversationHistory
          .slice(-6)
          .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
          .join("\n");

        chatComplete([
          {
            role: "user",
            content: `Update this memory profile with new info from conversation. Bullet points only:\n\nCurrent:\n${
              currentMemory || "None"
            }\n\nConversation:\n${conversationText}`,
          },
        ])
          .then((updated) => saveMemory(userId, updated))
          .catch((err) => console.error("Memory update failed:", err));
      }

      res.end();
    });

    response.data.on("error", () => res.end());
  } catch (error) {
    console.error("Chat error:", error);
    res.status(500).json({ error: "Something went wrong" });
  }
}

module.exports = { handleChat };
