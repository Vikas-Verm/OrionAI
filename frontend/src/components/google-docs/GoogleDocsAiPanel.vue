<template>
  <aside class="gd-ai">
    <div class="gd-ai-top">
      <div class="gd-ai-heading">
        <div class="gd-ai-dot"></div>
        <span>AI Assistant</span>
      </div>
      <div class="gd-ai-top-actions">
        <button class="gd-ai-top-btn" type="button" aria-label="Assistant options">⌁</button>
        <button class="gd-ai-close" type="button" aria-label="Close assistant" @click="$emit('close')">×</button>
      </div>
    </div>

    <div class="gd-ai-tabs">
      <button
        v-for="tab in tabs"
        :key="tab"
        class="gd-ai-tab"
        :class="{ active: activeTab === tab }"
        type="button"
        @click="$emit('set-tab', tab)"
      >
        {{ tabLabels[tab] }}
      </button>
    </div>

    <div class="gd-ai-body">
      <template v-if="messages.length">
        <div class="gd-ai-log">
          <div v-for="message in messages" :key="message.id" class="gd-ai-message" :class="`gd-ai-message--${message.role}`">
            <div class="gd-ai-message-role">{{ message.role === 'user' ? 'You' : 'OrionAI' }}</div>
            <div
              v-if="message.role === 'assistant'"
              class="gd-ai-message-text gd-ai-message-text--rich"
              v-html="renderAssistantMessage(message.text)"
            ></div>
            <div v-else class="gd-ai-message-text">{{ message.text }}</div>
          </div>
        </div>
      </template>

      <template v-else>
        <div class="gd-ai-intro">
          Hi {{ userName }}, how can I help with this document?
        </div>

        <div class="gd-ai-actions">
          <button
            v-for="action in visibleActions"
            :key="action.type"
            class="gd-ai-action"
            type="button"
            :disabled="loading"
            @click="$emit('quick-action', action.type)"
          >
            {{ action.label }}
          </button>
        </div>

        <div class="gd-ai-suggested">
          <div class="gd-ai-suggested-title">Suggested</div>
          <button
            v-for="prompt in suggestedPrompts"
            :key="prompt"
            class="gd-ai-suggested-item"
            type="button"
            @click="$emit('send', prompt)"
          >
            {{ prompt }}
          </button>
        </div>
      </template>
    </div>

    <form class="gd-ai-input-wrap" @submit.prevent="submit">
      <textarea
        v-model="draft"
        class="gd-ai-input"
        placeholder="Ask anything about this document..."
        rows="3"
        @keydown="handleKeydown"
      />
      <button class="gd-ai-send" type="submit" :disabled="loading || !draft.trim()">
        Go
      </button>
    </form>
  </aside>
</template>

<script setup>
import { computed, ref } from "vue";
import { marked } from "marked";

const props = defineProps({
  activeTab: { type: String, default: "chat" },
  loading: { type: Boolean, default: false },
  messages: { type: Array, default: () => [] },
  userName: { type: String, default: "there" },
});

const emit = defineEmits(["set-tab", "quick-action", "send", "close"]);

const draft = ref("");
const tabs = ["chat", "summary", "insights"];
const tabLabels = {
  chat: "Chat",
  summary: "Summary",
  insights: "Insights",
};

const actionsByTab = {
  chat: [
    { type: "summarize", label: "Summarize" },
    { type: "improve_writing", label: "Improve writing" },
    { type: "fix_grammar", label: "Fix grammar" },
    { type: "extract_action_items", label: "Extract next steps" },
    { type: "create_outline", label: "Create outline" },
    { type: "shorten_text", label: "Shorten" },
  ],
  summary: [
    { type: "summarize", label: "Executive summary" },
    { type: "extract_action_items", label: "Action items" },
    { type: "create_outline", label: "Create outline" },
    { type: "shorten_text", label: "Shorten" },
  ],
  insights: [
    { type: "insights", label: "Generate insights" },
    { type: "extract_action_items", label: "Risks and next steps" },
    { type: "expand_text", label: "Expand section" },
    { type: "rewrite_selection", label: "Rewrite selection" },
  ],
};

const suggestedByTab = {
  chat: [
    "What are the key objectives?",
    "List the key deliverables",
    "Summarize the timeline",
    "Extract all risks",
  ],
  summary: [
    "Turn this into a concise executive summary",
    "Summarize each section in one line",
    "Create a clean outline for this document",
  ],
  insights: [
    "What decisions are implied here?",
    "Which sections need clarification?",
    "What should be done next?",
  ],
};

const visibleActions = computed(() => actionsByTab[props.activeTab] || actionsByTab.chat);
const suggestedPrompts = computed(() => suggestedByTab[props.activeTab] || suggestedByTab.chat);

function sanitizeHtml(html = "") {
  if (typeof window === "undefined") return html;

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  doc.querySelectorAll("script,style,iframe,object,embed").forEach((node) => node.remove());
  doc.body.querySelectorAll("*").forEach((element) => {
    Array.from(element.attributes).forEach((attribute) => {
      if (/^on/i.test(attribute.name)) {
        element.removeAttribute(attribute.name);
      }
    });
  });
  return doc.body.innerHTML;
}

function renderAssistantMessage(text = "") {
  return sanitizeHtml(
    marked.parse(String(text || ""), {
      breaks: true,
      gfm: true,
    })
  );
}

function submit() {
  const text = draft.value.trim();
  if (!text) return;
  emit("send", text);
  draft.value = "";
}

function handleKeydown(event) {
  if (event.key !== "Enter") return;
  if (event.shiftKey) return;
  event.preventDefault();
  submit();
}
</script>

<style scoped>
.gd-ai {
  width: 260px;
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
  border-radius: var(--radius-md);
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  }

.gd-ai-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 14px 10px;
}

.gd-ai-heading {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: rgba(244, 248, 255, 0.92);
  font-size: 12px;
  font-weight: 700;
}

.gd-ai-top-actions {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.gd-ai-top-btn,
.gd-ai-close {
  border: none;
  background: transparent;
  color: var(--text-faint);
  font-size: 16px;
  cursor: pointer;
  padding: 0;
}

.gd-ai-dot {
  width: 8px;
  height: 8px;
  border-radius: var(--radius-sm);
  background: #4ef0be;
  box-shadow: 0 0 10px rgba(47, 211, 157, 0.45);
}

.gd-ai-tabs {
  display: flex;
  gap: 14px;
  padding: 0 14px 12px;
}

.gd-ai-tab {
  border: none;
  background: transparent;
  color: var(--text-faint);
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  padding: 0;
}

.gd-ai-tab.active {
  color: var(--text-primary);
}

.gd-ai-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 0 14px 14px;
}

.gd-ai-intro {
  color: rgba(244, 248, 255, 0.84);
  font-size: 13px;
  line-height: 1.65;
  margin-bottom: 14px;
}

.gd-ai-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.gd-ai-action {
  min-height: 38px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-subtle);
  background: rgba(255, 255, 255, 0.025);
  color: rgba(228, 236, 250, 0.84);
  font: inherit;
  font-size: 11.5px;
  font-weight: 600;
  text-align: left;
  padding: 10px 12px;
  cursor: pointer;
}

.gd-ai-action:hover {
  background: var(--bg-elevated);
}

.gd-ai-suggested {
  margin-top: 18px;
  padding-top: 16px;
  border-top: 1px solid var(--border-subtle);
}

.gd-ai-suggested-title {
  margin-bottom: 12px;
  color: var(--text-faint);
  font-size: 12px;
  font-weight: 700;
}

.gd-ai-suggested-item {
  width: 100%;
  text-align: left;
  border: none;
  background: transparent;
  color: rgba(206, 216, 234, 0.72);
  font: inherit;
  font-size: 12px;
  padding: 9px 0;
  cursor: pointer;
  position: relative;
  padding-left: 16px;
}

.gd-ai-suggested-item::before {
  content: "◷";
  position: absolute;
  left: 0;
  top: 9px;
  font-size: 10px;
  color: rgba(146, 164, 202, 0.72);
}

.gd-ai-suggested-item:hover {
  color: var(--text-primary);
}

.gd-ai-log {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.gd-ai-message {
  padding: 12px 14px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-subtle);
  background: var(--bg-surface);
}

.gd-ai-message-text--rich :deep(p) {
  margin: 0 0 10px;
}

.gd-ai-message-text--rich :deep(p:last-child) {
  margin-bottom: 0;
}

.gd-ai-message-text--rich :deep(ul),
.gd-ai-message-text--rich :deep(ol) {
  margin: 8px 0 10px 18px;
  padding: 0;
}

.gd-ai-message-text--rich :deep(li) {
  margin-bottom: 6px;
}

.gd-ai-message-text--rich :deep(h1),
.gd-ai-message-text--rich :deep(h2),
.gd-ai-message-text--rich :deep(h3),
.gd-ai-message-text--rich :deep(h4) {
  margin: 0 0 10px;
  color: rgba(244, 248, 255, 0.92);
  font-size: 13px;
  line-height: 1.4;
}

.gd-ai-message--assistant {
  background: rgba(54, 106, 226, 0.1);
  border-color: rgba(54, 106, 226, 0.14);
}

.gd-ai-message-role {
  margin-bottom: 6px;
  color: var(--text-faint);
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-weight: 700;
}

.gd-ai-message-text {
  white-space: pre-wrap;
  color: rgba(239, 244, 255, 0.86);
  font-size: 12.5px;
  line-height: 1.65;
}

.gd-ai-input-wrap {
  position: relative;
  padding: 0 14px 14px;
}

.gd-ai-input {
  width: 100%;
  box-sizing: border-box;
  resize: none;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-subtle);
  background: var(--bg-surface);
  color: var(--text-primary);
  padding: 14px 44px 14px 14px;
  min-height: 72px;
  font: inherit;
  font-size: 13px;
}

.gd-ai-send {
  position: absolute;
  right: 22px;
  bottom: 22px;
  min-width: 42px;
  height: 32px;
  border-radius: var(--radius-sm);
  border: none;
  background: #4e7fff;
  color: white;
  padding: 0 12px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 8px 18px rgba(78, 127, 255, 0.26);
}

.gd-ai-send:disabled {
  opacity: 0.55;
  cursor: default;
}

@media (max-width: 1320px) {
  .gd-ai {
    width: 100%;
    max-height: min(44dvh, 420px);
  }
}

@media (max-width: 640px) {
  .gd-ai {
    border-radius: var(--radius-md);
  }

  .gd-ai-tabs {
    flex-wrap: wrap;
    gap: 10px;
  }

  .gd-ai-actions {
    grid-template-columns: 1fr;
  }

  .gd-ai-input-wrap {
    padding-bottom: calc(14px + env(safe-area-inset-bottom, 0px));
  }
}
</style>
