import { ref } from "vue";
import { store, resetCanvas } from "../stores/app";
import { ragAPI, dbAPI, streamChat, sessionsAPI } from "../services/api";
import { buildSessionTitle, upsertVisibleSession } from "../utils/sessionTitles";
import { marked } from "marked";
import hljs from "highlight.js";

marked.setOptions({
  highlight(code, lang) {
    if (lang && hljs.getLanguage(lang)) return hljs.highlight(code, { language: lang }).value;
    return hljs.highlightAuto(code).value;
  },
  breaks: true,
  gfm: true,
});

async function refreshSessions() {
  try {
    const res = await sessionsAPI.list("");
    store.sessions = res.data;
  } catch (e) {
    console.error("Session refresh failed:", e);
  }
}

export function useChat() {
  const isTyping = ref(false);
  let chatAbortController = null;

  function revealCurrentSession(userMessage, priorUserMessageCount) {
    if (!store.currentSessionId || priorUserMessageCount > 0) return;

    const title = buildSessionTitle(userMessage);
    if (title === "New Chat") return;

    const currentSession = store.sessions.find(
      (session) => session.sessionId === store.currentSessionId
    );
    const currentTitle = String(currentSession?.title || "").trim();
    if (currentSession && currentTitle && currentTitle !== "New Chat") return;

    store.sessions = upsertVisibleSession(store.sessions, {
      sessionId: store.currentSessionId,
      title,
      mode: currentSession?.mode || store.mode || "chat",
    });
  }

  function renderMarkdown(content) {
    if (!content) return "";
    const html = marked.parse(content);
    return html.replace(/<pre><code class="(.*?)">([\s\S]*?)<\/code><\/pre>/g, (_, lang, code) => {
      const language = lang.replace("language-", "") || "code";
      return `<div class="code-block">
          <div class="code-header">
            <span class="code-lang">${language}</span>
            <button class="copy-btn" onclick="copyCode(this)">Copy</button>
          </div>
          <pre><code class="${lang}">${code}</code></pre>
        </div>`;
    });
  }

  function detectCanvas(content) {
    const match = content.match(/```(html|javascript|js)\n([\s\S]*?)```/);
    if (!match) return;
    const lang = match[1];
    const code = match[2].trim();
    const isDomCode =
      /document\.|window\.|getElementById|querySelector|innerHTML|createElement|canvas|WebGL/.test(
        code
      );
    if (lang === "html" || isDomCode) {
      store.canvasLang = lang === "javascript" ? "js" : lang;
      store.canvasCode = code;
    } else {
      resetCanvas();
    }
  }

  function hasRenderableCode(content) {
    const match = content.match(/```(html|javascript|js)\n([\s\S]*?)```/);
    if (!match) return false;
    const lang = match[1];
    const code = match[2].trim();
    if (lang === "html") return true;
    return /document\.|window\.|getElementById|querySelector|innerHTML|createElement|canvas|WebGL/.test(
      code
    );
  }

  function openPreviewFromMessage(content) {
    const match = content.match(/```(html|javascript|js)\n([\s\S]*?)```/);
    if (!match) return;
    store.canvasLang = match[1] === "javascript" ? "js" : match[1];
    store.canvasCode = match[2].trim();
    store.showCanvas = true;
  }

  async function sendMessage(
    userInput,
    scrollToBottom,
    scrollDuringStream,
    skipUserMessage = false
  ) {
    if (!userInput.trim() || store.loading) return null;
    if (store.mode === "rag" && !store.documentIngested) return null;

    const userMessage = userInput.trim();
    const priorUserMessageCount = store.messages.filter(
      (message) => message.role === "user"
    ).length;
    revealCurrentSession(userMessage, priorUserMessageCount);
    if (!skipUserMessage) store.messages.push({ role: "user", content: userMessage });
    isTyping.value = true;
    let aiMessageIndex = -1;
    store.loading = true;

    try {
      if (store.mode === "rag") {
        const res = await ragAPI.chat(userMessage, store.currentSessionId);
        store.messages.push({ role: "assistant", content: res.data.reply });
        detectCanvas(res.data.reply);
        refreshSessions();
        return userMessage;
      }

      if (store.mode === "db") {
        const res = await dbAPI.chat(userMessage, store.currentSessionId);
        store.messages.push({
          role: "assistant",
          content: res.data.reply,
          recordCount: res.data.recordCount,
        });
        extractChartData(res.data.reply);
        refreshSessions();
        return userMessage;
      }

      // Chat streaming
      chatAbortController = new AbortController();
      const response = await streamChat(userMessage, store.currentSessionId, store.webMode, chatAbortController.signal);

      if (!response.ok) throw new Error(`Server error: ${response.status}`);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let streamDone = false;

      while (!streamDone) {
        const { done, value } = await reader.read();
        if (done) break;

        const lines = decoder
          .decode(value, { stream: true })
          .split("\n")
          .filter((l) => l.trim());

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6);
          if (data === "[DONE]") {
            streamDone = true;
            break;
          }

          try {
            const parsed = JSON.parse(data);
            if (parsed.token) {
              if (isTyping.value) {
                isTyping.value = false;
                store.messages.push({ role: "assistant", content: "" });
                aiMessageIndex = store.messages.length - 1;
              }
              store.messages[aiMessageIndex].content += parsed.token;
              scrollDuringStream?.();
            }
          } catch {
            /* skip malformed */
          }
        }
      }

      // Post-stream — outside the loop
      if (aiMessageIndex >= 0) {
        detectCanvas(store.messages[aiMessageIndex].content);
        if (store.webMode) store.messages[aiMessageIndex].webSearched = true;
      }

      refreshSessions(); // fire and forget
    } catch (e) {
      console.error("Chat error:", e);
      if (aiMessageIndex >= 0) {
        store.messages[aiMessageIndex].content = "❌ Something went wrong. Please try again.";
      } else {
        store.messages.push({
          role: "assistant",
          content: "❌ Something went wrong. Please try again.",
        });
      }
    } finally {
      store.loading = false;
      isTyping.value = false;
      chatAbortController = null;
      scrollToBottom?.();
    }

    return userMessage;
  }

  async function regenerate(scrollToBottom) {
    if (store.messages[store.messages.length - 1]?.role === "assistant") store.messages.pop();
    const lastUser = [...store.messages].reverse().find((m) => m.role === "user");
    if (!lastUser) return;
    store.messages.pop();
    await sendMessage(lastUser.content, scrollToBottom);
  }

  async function extractChartData(replyText) {
    try {
      const res = await dbAPI.extractChart(replyText);
      const parsed = res.data;
      if (parsed.chartable && parsed.labels?.length) {
        store.chartData = null;
        setTimeout(() => {
          store.chartData = {
            chartable: parsed.chartable,
            type: parsed.type,
            title: parsed.title,
            labels: [...parsed.labels],
            values: [...parsed.values],
          };
        }, 50);
      } else {
        store.chartData = null;
      }
    } catch (e) {
      console.error("Chart extraction failed:", e);
      store.chartData = null;
    }
  }

  function stopChat() {
    if (chatAbortController) {
      chatAbortController.abort();
    }
  }

  return {
    isTyping,
    sendMessage,
    regenerate,
    stopChat,
    renderMarkdown,
    detectCanvas,
    hasRenderableCode,
    openPreviewFromMessage,
    extractChartData,
  };
}
