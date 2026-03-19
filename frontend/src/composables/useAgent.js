import { ref, nextTick } from "vue";
import { store } from "../stores/app";
import { agentAPI, streamAgentRun } from "../services/api";

export function useAgent() {
  const agentRunning = ref(false);
  const pendingParams = ref(null);

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

  // ── Reactive splice helper ────────────────────────────
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
  async function executePlan(plan, scrollToBottom, userMessage) {
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

                for (const line of lines) {
                  if (!line.startsWith("data: ")) continue;
                  const raw = line.slice(6).trim();
                  if (raw === "[DONE]") {
                    finish();
                    return;
                  }
                  try {
                    handleEvent(JSON.parse(raw), bubbleIdx, scrollToBottom);
                  } catch {
                    /* skip malformed */
                  }
                }
                read();
              })
              .catch(() => finish());
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
  function handleEvent(event, bubbleIdx, scrollToBottom) {
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

          icon: event.icon,
          label: event.label,
        });
        break;

      case "step_error":
        patchStep(bubbleIdx, event.tool, { status: "error", error: event.error });
        break;

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
  async function handleAgentMessage(message, scrollToBottom) {
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

    await executePlan(plan, scrollToBottom, message);
    return true;
  }

  // ── Provide missing params then execute ───────────────
  async function provideMissingParams(values, scrollToBottom) {
    if (!pendingParams.value) return;
    const { plan, userMessage } = pendingParams.value;

    for (const step of plan.steps) {
      if (step.tool === "send_email" && values.emailTo) step.params.to = values.emailTo;
      if (step.tool === "send_whatsapp" && values.whatsappTo) step.params.to = values.whatsappTo;
    }

    pendingParams.value = null;
    await executePlan(plan, scrollToBottom, userMessage);
  }

  return { agentRunning, pendingParams, handleAgentMessage, provideMissingParams };
}
