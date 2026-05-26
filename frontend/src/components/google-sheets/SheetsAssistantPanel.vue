<template>
  <aside class="gsa-panel">
    <div class="gsa-top">
      <div class="gsa-heading">
        <div class="gsa-dot"></div>
        <span>AI Assistant</span>
      </div>
      <div class="gsa-top-actions">
        <button class="gsa-top-btn" type="button" aria-label="Assistant options">⌁</button>
        <button class="gsa-close" type="button" aria-label="Close assistant" @click="$emit('close')">×</button>
      </div>
    </div>

    <div class="gsa-tabs">
      <button
        v-for="tab in tabs"
        :key="tab"
        class="gsa-tab"
        :class="{ active: activeTab === tab }"
        type="button"
        @click="$emit('set-tab', tab)"
      >
        {{ tabLabels[tab] }}
      </button>
    </div>

    <div class="gsa-body">
      <template v-if="messages.length">
        <div class="gsa-log">
          <div v-for="message in messages" :key="message.id" class="gsa-message" :class="`gsa-message--${message.role}`">
            <div class="gsa-message-role">{{ message.role === "user" ? "You" : "OrionAI" }}</div>
            <div
              v-if="message.role === 'assistant'"
              class="gsa-message-text gsa-message-text--rich"
              v-html="renderAssistantMessage(message.text)"
            ></div>
            <div v-else class="gsa-message-text">{{ message.text }}</div>
          </div>
        </div>
      </template>

      <template v-else>
        <div class="gsa-intro">
          Hi {{ userName }}, how can I help with this sheet? I’ll stay scoped to the active spreadsheet, tab, and selection.
        </div>

        <div class="gsa-actions">
          <button
            v-for="action in visibleActions"
            :key="action.type"
            class="gsa-action"
            type="button"
            :disabled="loading"
            @click="$emit('quick-action', action.type)"
          >
            {{ action.label }}
          </button>
        </div>

        <div class="gsa-suggested">
          <div class="gsa-suggested-title">Suggested</div>
          <button
            v-for="prompt in visiblePrompts"
            :key="prompt"
            class="gsa-suggested-item"
            type="button"
            @click="$emit('send', prompt)"
          >
            {{ prompt }}
          </button>
        </div>
      </template>
    </div>

    <form class="gsa-input-wrap" @submit.prevent="submit">
      <textarea
        v-model="draft"
        class="gsa-input"
        placeholder="Ask anything about this sheet..."
        rows="3"
        :disabled="loading"
        @keydown="handleKeydown"
      />
      <button class="gsa-send" type="submit" :disabled="loading || !draft.trim()">
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
  suggestions: { type: Array, default: () => [] },
  userName: { type: String, default: "there" },
});

const emit = defineEmits(["set-tab", "quick-action", "send", "close"]);

const draft = ref("");
const tabs = ["chat", "insights", "formulas"];
const tabLabels = {
  chat: "Chat",
  insights: "Insights",
  formulas: "Formulas",
};

const actionsByTab = {
  chat: [
    { type: "analyze_data", label: "Analyze data" },
    { type: "calculate_totals", label: "Calculate totals" },
    { type: "generate_chart", label: "Generate chart" },
    { type: "format_sheet", label: "Format table" },
    { type: "monthly_summary", label: "Monthly summary" },
    { type: "clean_data", label: "Clean data" },
  ],
  insights: [
    { type: "summarize_sheet", label: "Summarize sheet" },
    { type: "find_trends", label: "Find trends" },
    { type: "highlight_low_budget", label: "Highlight low budget" },
    { type: "forecast", label: "Create forecast" },
  ],
  formulas: [
    { type: "formula_help", label: "Explain formula" },
    { type: "add_remaining_formulas", label: "Add remaining formulas" },
    { type: "create_totals_row", label: "Create totals row" },
    { type: "remove_duplicates", label: "Remove duplicates" },
  ],
};

const promptsByTab = {
  chat: [
    "Calculate total spend",
    "Format this sheet professionally",
    "Create a monthly summary sheet",
    "Generate a chart for this range",
  ],
  insights: [
    "Analyze this sheet and tell me the key insights",
    "Which month has the highest spend?",
    "Highlight cells with low remaining budget",
    "Forecast the next 3 months",
  ],
  formulas: [
    "Explain the selected formula",
    "Add formulas for remaining amount in this column",
    "Create a totals row for this table",
    "Clean duplicate rows",
  ],
};

const visibleActions = computed(() => actionsByTab[props.activeTab] || actionsByTab.chat);
const visiblePrompts = computed(() => {
  const localPrompts = promptsByTab[props.activeTab] || promptsByTab.chat;
  return props.suggestions?.length && props.activeTab === "chat"
    ? props.suggestions
    : localPrompts;
});

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
  const value = draft.value.trim();
  if (!value) return;
  emit("send", value);
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
.gsa-panel {
  width: 270px;
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-radius: var(--radius-md);
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  }

.gsa-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 14px 10px;
}

.gsa-heading {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: rgba(244, 248, 255, 0.92);
  font-size: 12px;
  font-weight: 700;
}

.gsa-top-actions {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.gsa-top-btn,
.gsa-close {
  border: none;
  background: transparent;
  color: var(--text-faint);
  font-size: 16px;
  cursor: pointer;
  padding: 0;
}

.gsa-dot {
  width: 8px;
  height: 8px;
  border-radius: var(--radius-sm);
  background: #4ef0be;
  box-shadow: 0 0 10px rgba(47, 211, 157, 0.45);
}

.gsa-tabs {
  display: flex;
  gap: 14px;
  padding: 0 14px 12px;
}

.gsa-tab {
  border: none;
  background: transparent;
  color: var(--text-faint);
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  padding: 0 0 8px;
  position: relative;
}

.gsa-tab.active {
  color: var(--text-primary);
}

.gsa-tab.active::after {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 2px;
  border-radius: var(--radius-sm);
  background: #4e7fff;
}

.gsa-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 0 14px 14px;
}

.gsa-intro {
  color: rgba(244, 248, 255, 0.84);
  font-size: 13px;
  line-height: 1.65;
  margin-bottom: 14px;
}

.gsa-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.gsa-action {
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

.gsa-action:hover {
  background: var(--bg-elevated);
}

.gsa-suggested {
  margin-top: 18px;
  padding-top: 16px;
  border-top: 1px solid var(--border-subtle);
}

.gsa-suggested-title {
  margin-bottom: 12px;
  color: var(--text-faint);
  font-size: 12px;
  font-weight: 700;
}

.gsa-suggested-item {
  width: 100%;
  text-align: left;
  border: none;
  background: transparent;
  color: rgba(206, 216, 234, 0.72);
  font: inherit;
  font-size: 12px;
  padding: 9px 0 9px 16px;
  cursor: pointer;
  position: relative;
}

.gsa-suggested-item::before {
  content: "◷";
  position: absolute;
  left: 0;
  top: 9px;
  font-size: 10px;
  color: rgba(146, 164, 202, 0.72);
}

.gsa-suggested-item:hover {
  color: var(--text-primary);
}

.gsa-log {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.gsa-message {
  padding: 12px 14px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-subtle);
  background: var(--bg-surface);
}

.gsa-message--assistant {
  background: rgba(87, 82, 185, 0.16);
  border-color: rgba(108, 112, 228, 0.18);
}

.gsa-message-role {
  margin-bottom: 6px;
  color: var(--text-faint);
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-weight: 700;
}

.gsa-message-text {
  white-space: pre-wrap;
  color: rgba(239, 244, 255, 0.86);
  font-size: 12.5px;
  line-height: 1.65;
}

.gsa-message-text--rich :deep(p) {
  margin: 0 0 10px;
}

.gsa-message-text--rich :deep(p:last-child) {
  margin-bottom: 0;
}

.gsa-message-text--rich :deep(ul),
.gsa-message-text--rich :deep(ol) {
  margin: 8px 0 10px 18px;
  padding: 0;
}

.gsa-message-text--rich :deep(li) {
  margin-bottom: 6px;
}

.gsa-message-text--rich :deep(h1),
.gsa-message-text--rich :deep(h2),
.gsa-message-text--rich :deep(h3),
.gsa-message-text--rich :deep(h4) {
  margin: 0 0 10px;
  color: rgba(244, 248, 255, 0.92);
  font-size: 13px;
  line-height: 1.4;
}

.gsa-input-wrap {
  position: relative;
  padding: 0 14px 14px;
}

.gsa-input {
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

.gsa-send {
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

.gsa-send:disabled {
  opacity: 0.55;
  cursor: default;
}

@media (max-width: 1200px) {
  .gsa-panel {
    width: 100%;
    min-width: 0;
    max-height: min(44dvh, 420px);
  }
}

@media (max-width: 640px) {
  .gsa-panel {
    border-radius: var(--radius-md);
  }

  .gsa-tabs {
    flex-wrap: wrap;
    gap: 10px;
  }

  .gsa-actions {
    grid-template-columns: 1fr;
  }

  .gsa-input-wrap {
    padding-bottom: calc(14px + env(safe-area-inset-bottom, 0px));
  }
}
</style>
