import { ref, nextTick } from "vue";
import { store } from "../stores/app";
import { agentAPI, streamAgentRun } from "../services/api";
import { buildSessionTitle, upsertVisibleSession } from "../utils/sessionTitles";

export function useAgent() {
  const agentRunning = ref(false);
  const pendingParams = ref(null);

  function revealCurrentSession(message) {
    if (!store.currentSessionId) return;

    const priorUserMessageCount = store.messages.filter(
      (entry) => entry.role === "user"
    ).length;
    if (priorUserMessageCount > 0) return;

    const title = buildSessionTitle(message);
    if (title === "New Chat") return;

    const currentSession = store.sessions.find(
      (session) => session.sessionId === store.currentSessionId
    );
    const currentTitle = String(currentSession?.title || "").trim();
    if (currentSession && currentTitle && currentTitle !== "New Chat") return;

    store.sessions = upsertVisibleSession(store.sessions, {
      sessionId: store.currentSessionId,
      title,
      mode: currentSession?.mode || store.mode || "agent",
    });
  }

  // ── Step missing param check ───────────────────────────
  function getMissingParams(steps) {
    return steps
      .filter((s) => (s.tool === "send_email" || s.tool === "send_whatsapp") && !s.params?.to)
      .map((s) => ({
        tool: s.tool,
        label: s.tool === "send_email" ? "Email address" : "WhatsApp number (+91...)",
        type: s.tool === "send_email" ? "email" : "tel",
      }));
  }

  // ── Push user message to chat ─────────────────────────
  async function pushUserMsg(message, scrollToBottom) {
    revealCurrentSession(message);
    store.messages.push({ role: "user", content: message });
    await nextTick();
    scrollToBottom?.();
  }

  // ── Create agent bubble in chat ───────────────────────
  function createAgentBubble(plan) {
    const idx = store.messages.length;
    store.messages.push({
      role: "assistant",
      content: "",
      isAgent: true,
      intent: plan.intent,
      agentDone: false,
      agentSuccess: false,
      steps: plan.steps.map((s) => ({
        tool: s.tool,
        params: s.params,
        status: "pending",
        summary: null,
        error: null,
      })),
    });
    return idx;
  }

  // ── Reactive splice helpers ───────────────────────────
  function patchMsg(idx, patch) {
    const msg = store.messages[idx];
    if (!msg) return;
    store.messages.splice(idx, 1, { ...msg, ...patch });
  }

  function patchStep(idx, tool, patch) {
    const msg = store.messages[idx];
    if (!msg) return;
    const steps = msg.steps.map((s) => (s.tool === tool ? { ...s, ...patch } : s));
    store.messages.splice(idx, 1, { ...msg, steps });
  }

  // ── Execute plan via SSE ──────────────────────────────
  // confirmFn: (preview) => Promise<boolean> — passed from App.vue via confirmRef
  async function executePlan(plan, scrollToBottom, userMessage, confirmFn = null) {
    agentRunning.value = true;
    const bubbleIdx = createAgentBubble(plan);
    await nextTick();
    scrollToBottom?.();

    if (store.currentSessionId) {
      localStorage.setItem("orion_session", store.currentSessionId);
    }

    return new Promise((resolve) => {
      streamAgentRun(plan.steps, store.currentSessionId, userMessage)
        .then((response) => {
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";

          function read() {
            reader
              .read()
              .then(({ done, value }) => {
                if (done) {
                  finish();
                  return;
                }

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                buffer = lines.pop();

                // Process lines sequentially — await needed for confirm_needed
                processLines(lines).then(() => read());
              })
              .catch(() => finish());
          }

          // ── Process lines — async so confirm_needed can await modal ──
          async function processLines(lines) {
            for (const line of lines) {
              if (!line.startsWith("data: ")) continue;
              const raw = line.slice(6).trim();
              if (raw === "[DONE]") {
                finish();
                return;
              }
              try {
                await handleEvent(JSON.parse(raw), bubbleIdx, scrollToBottom, confirmFn);
              } catch {
                /* skip malformed */
              }
            }
          }

          read();
        })
        .catch((err) => {
          patchMsg(bubbleIdx, {
            content: `❌ ${err.message}`,
            agentDone: true,
            agentSuccess: false,
          });
          finish();
        });

      function finish() {
        agentRunning.value = false;
        resolve();
      }
    });
  }

  // ── Handle individual SSE events ──────────────────────
  // Now async — confirm_needed awaits the modal response
  async function handleEvent(event, bubbleIdx, scrollToBottom, confirmFn) {
    switch (event.type) {
      case "step_start":
        patchStep(bubbleIdx, event.tool, {
          status: "running",
          icon: event.icon,
          label: event.label,
        });
        break;

      case "step_done":
        patchStep(bubbleIdx, event.tool, {
          status: "done",
          summary: event.summary,
          richSummary: event.richSummary || null,

          // ── Jira ──────────────────────────────────────
          richTickets: event.richTickets || null,
          byAssignee: event.byAssignee || null,
          jiraDomain: event.jiraDomain || null,
          sprintName: event.sprintName || null,
          notifications: event.notifications || null,

          // ── Gmail ─────────────────────────────────────
          richEmails: event.richEmails || null,
          emailQuery: event.emailQuery || null,

          // ── Calendar ──────────────────────────────────
          richEvents: event.richEvents || null,
          calendarByDay: event.calendarByDay || null,

          // ── Telegram ──────────────────────────────────
          richTelegramMessages: event.richTelegramMessages || null,
          telegramChatName: event.telegramChatName || null,
          telegramChatId: event.telegramChatId || null,
          telegramChatUsername: event.telegramChatUsername || null,
          telegramChats: event.telegramChats || null,
          telegramUnreadChats: event.telegramUnreadChats || null,
          telegramSearchResults: event.telegramSearchResults || null,
          telegramQuery: event.telegramQuery || null,
          telegramSent: event.telegramSent || null,
          telegramContact: event.telegramContact || null,

          // ── Slack ─────────────────────────────────────
          richSlackMessages: event.richSlackMessages || null,
          richSlackChannels: event.richSlackChannels || null,
          richSlackUnread: event.richSlackUnread || null,
          slackChannel: event.slackChannel || null,
          slackChannelId: event.slackChannelId || null,
          slackSent: event.slackSent || null,
          slackMessage: event.slackMessage || null,
          totalUnread: event.totalUnread || null,

          // ── Google Docs ────────────────────────────────
          richGoogleDocs: event.richGoogleDocs || null,
          richGoogleDoc: event.richGoogleDoc || null,
          richGoogleDocShare: event.richGoogleDocShare || null,

          // ── Google Sheets ───────────────────────────────
          richGoogleSheets: event.richGoogleSheets || null,
          richGoogleSheet: event.richGoogleSheet || null,
          richGoogleSheetShare: event.richGoogleSheetShare || null,

          // ── WhatsApp ──────────────────────────────────
          richWhatsAppMessages: event.richWhatsAppMessages || null,
          richWhatsAppUnread: event.richWhatsAppUnread || null,
          richWhatsAppChats: event.richWhatsAppChats || null,
          whatsappChatName: event.whatsappChatName || null,
          whatsappChatId: event.whatsappChatId || null,
          whatsappSent: event.whatsappSent || null,
          whatsappTo: event.whatsappTo || null,
          whatsappMessage: event.whatsappMessage || null,

          icon: event.icon,
          label: event.label,
        });
        break;

      case "step_error":
        patchStep(bubbleIdx, event.tool, { status: "error", error: event.error });
        break;

      // ── CONFIRMATION NEEDED ────────────────────────────────
      // Backend sends this before executing a destructive action.
      // We pause the stream, show the modal, and send the user's
      // decision back to the backend via a separate POST request.
      case "confirm_needed": {
        // Show a "waiting for confirmation" state on the step
        patchStep(bubbleIdx, event.tool, {
          status: "confirming",
          icon: event.icon || "⚠️",
          label: event.label || event.tool,
          summary: "Waiting for your confirmation…",
        });

        // If no confirmFn provided (e.g. testing), auto-approve
        if (!confirmFn) {
          console.warn("confirm_needed received but no confirmFn provided — auto-approving");
          break;
        }

        // Show the modal and wait for user to click Yes or Cancel
        const approved = await confirmFn(event.preview);

        if (approved) {
          // User approved — update step back to running
          patchStep(bubbleIdx, event.tool, {
            status: "running",
            summary: null,
          });
          // Send approval to backend
          try {
            const { default: api } = await import("../services/api");
            await api.post("/api/agent/confirm", {
              sessionId: store.currentSessionId,
              tool: event.tool,
              approved: true,
            });
          } catch (err) {
            console.error("Failed to send confirmation:", err.message);
          }
        } else {
          // User cancelled — mark step as skipped
          patchStep(bubbleIdx, event.tool, {
            status: "skipped",
            summary: "Cancelled by you",
            icon: "⛔",
          });
          // Send cancellation to backend
          try {
            const { default: api } = await import("../services/api");
            await api.post("/api/agent/confirm", {
              sessionId: store.currentSessionId,
              tool: event.tool,
              approved: false,
            });
          } catch (err) {
            console.error("Failed to send cancellation:", err.message);
          }
        }
        break;
      }

      case "complete":
      case "error": {
        const content = event.summary || event.error || "✅ Done";
        patchMsg(bubbleIdx, {
          content,
          agentDone: true,
          agentSuccess: event.success !== false && event.type !== "error",
        });
        nextTick(() => scrollToBottom?.());
        break;
      }
    }
  }

  // ── Public: called from App.vue onSend ────────────────
  // confirmFn is passed in from App.vue: () => confirmRef.value.show(preview)
  async function handleAgentMessage(message, scrollToBottom, confirmFn = null) {
    await pushUserMsg(message, scrollToBottom);

    let plan;
    try {
      const res = await agentAPI.parse(message, store.messages.slice(-6));
      plan = res.data;
    } catch (err) {
      console.error("Intent parse failed:", err);
      return false;
    }

    if (!plan.isAgentTask || plan.confidence < 0.6) return false;

    const missing = getMissingParams(plan.steps);
    if (missing.length) {
      pendingParams.value = { plan, missing, userMessage: message };
      return "needs_params";
    }

    await executePlan(plan, scrollToBottom, message, confirmFn);
    return true;
  }

  // ── Provide missing params then execute ───────────────
  async function provideMissingParams(values, scrollToBottom, confirmFn = null) {
    if (!pendingParams.value) return;
    const { plan, userMessage } = pendingParams.value;

    for (const step of plan.steps) {
      if (step.tool === "send_email" && values.emailTo) step.params.to = values.emailTo;
      if (step.tool === "send_whatsapp" && values.whatsappTo) step.params.to = values.whatsappTo;
    }

    pendingParams.value = null;
    await executePlan(plan, scrollToBottom, userMessage, confirmFn);
  }

  return { agentRunning, pendingParams, handleAgentMessage, provideMissingParams };
}
