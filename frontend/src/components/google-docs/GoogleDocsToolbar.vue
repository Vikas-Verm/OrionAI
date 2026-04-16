<template>
  <div class="gd-toolbar-shell">
    <div ref="toolbarRef" class="gd-toolbar">
      <div class="gd-toolbar-group gd-toolbar-group--iconic">
        <button
          class="gd-tool-btn gd-tool-btn--icon"
          type="button"
          :disabled="disabled"
          :title="headerCollapsed ? 'Expand top controls' : 'Collapse top controls'"
          @click="emitAction('toggleTopShell')"
        >
          {{ headerCollapsed ? "▾" : "▴" }}
        </button>
        <button
          class="gd-tool-btn gd-tool-btn--icon"
          type="button"
          :disabled="disabled"
          title="Undo"
          @click="emitAction('undo')"
        >
          ↶
        </button>
        <button
          class="gd-tool-btn gd-tool-btn--icon"
          type="button"
          :disabled="disabled"
          title="Redo"
          @click="emitAction('redo')"
        >
          ↷
        </button>
        <button class="gd-tool-btn gd-tool-btn--icon" type="button" title="Print" @click="emitAction('printDocument')">
          🖨
        </button>
      </div>

      <div class="gd-toolbar-divider"></div>

      <div class="gd-toolbar-group">
        <button class="gd-tool-badge" type="button" disabled>
          {{ zoom }}%
        </button>

        <button
          ref="styleTriggerRef"
          class="gd-tool-select gd-tool-button gd-tool-select--wide"
          type="button"
          :disabled="disabled"
          @click.stop="togglePicker('style', $event)"
        >
          <span>{{ selectedStyleLabel }}</span>
          <span class="gd-tool-button-caret">▾</span>
        </button>

        <button
          ref="fontTriggerRef"
          class="gd-tool-select gd-tool-button gd-tool-select--font"
          type="button"
          :disabled="disabled"
          @click.stop="togglePicker('font', $event)"
        >
          <span>{{ selectedFontFamilyLabel }}</span>
          <span class="gd-tool-button-caret">▾</span>
        </button>

        <button
          ref="sizeTriggerRef"
          class="gd-tool-select gd-tool-button gd-tool-select--compact"
          type="button"
          :disabled="disabled"
          @click.stop="togglePicker('size', $event)"
        >
          <span>{{ selectedFontSizeLabel }}</span>
          <span class="gd-tool-button-caret">▾</span>
        </button>
      </div>

      <div class="gd-toolbar-divider"></div>

      <div class="gd-toolbar-group gd-toolbar-group--iconic">
        <button
          class="gd-tool-btn gd-tool-btn--icon"
          type="button"
          :disabled="disabled"
          title="Bold"
          @click="emitAction('bold')"
        >
          <strong>B</strong>
        </button>
        <button
          class="gd-tool-btn gd-tool-btn--icon"
          type="button"
          :disabled="disabled"
          title="Italic"
          @click="emitAction('italic')"
        >
          <em>I</em>
        </button>
        <button
          class="gd-tool-btn gd-tool-btn--icon"
          type="button"
          :disabled="disabled"
          title="Underline"
          @click="emitAction('underline')"
        >
          <span class="gd-tool-underline">U</span>
        </button>

        <label class="gd-color-chip" title="Text color">
          <span class="gd-color-chip-label">A</span>
          <input type="color" :disabled="disabled" @input="emitColor('foreColor', $event)" />
        </label>
        <label class="gd-color-chip" title="Highlight color">
          <span class="gd-color-chip-label gd-color-chip-label--highlight">A</span>
          <input type="color" :disabled="disabled" @input="emitColor('hiliteColor', $event)" />
        </label>
      </div>

      <div class="gd-toolbar-divider"></div>

      <div class="gd-toolbar-group gd-toolbar-group--iconic">
        <button
          class="gd-tool-btn gd-tool-btn--icon"
          type="button"
          :disabled="disabled"
          title="Align left"
          @click="emitAction('justifyLeft')"
        >
          ≡
        </button>
        <button
          class="gd-tool-btn gd-tool-btn--icon"
          type="button"
          :disabled="disabled"
          title="Align center"
          @click="emitAction('justifyCenter')"
        >
          ☷
        </button>
        <button
          class="gd-tool-btn gd-tool-btn--icon"
          type="button"
          :disabled="disabled"
          title="Align right"
          @click="emitAction('justifyRight')"
        >
          ☰
        </button>

        <button
          ref="listTriggerRef"
          class="gd-tool-select gd-tool-button gd-tool-select--list"
          type="button"
          :disabled="disabled"
          @click.stop="togglePicker('list', $event)"
        >
          <span>{{ selectedListLabel }}</span>
          <span class="gd-tool-button-caret">▾</span>
        </button>

        <button
          class="gd-tool-btn gd-tool-btn--icon"
          type="button"
          :disabled="disabled"
          title="Indent"
          @click="emitAction('indent')"
        >
          →
        </button>
        <button
          class="gd-tool-btn gd-tool-btn--icon"
          type="button"
          :disabled="disabled"
          title="Outdent"
          @click="emitAction('outdent')"
        >
          ←
        </button>
      </div>

      <div class="gd-toolbar-divider"></div>

      <div class="gd-toolbar-group gd-toolbar-group--iconic">
        <button
          class="gd-tool-btn gd-tool-btn--icon"
          type="button"
          :disabled="disabled"
          title="Insert link"
          @click="emitAction('openLinkDialog')"
        >
          🔗
        </button>
        <button
          class="gd-tool-btn gd-tool-btn--icon"
          type="button"
          :disabled="disabled"
          title="Insert image from local computer"
          @click="emitAction('openImageDialog')"
        >
          🖼
        </button>
        <button
          class="gd-tool-btn gd-tool-btn--icon"
          type="button"
          :disabled="disabled"
          title="Insert chart"
          @click="emitAction('openChartDialog')"
        >
          📊
        </button>
        <button
          class="gd-tool-btn gd-tool-btn--icon"
          type="button"
          :disabled="disabled"
          title="Insert table"
          @click="emitAction('openTablePicker')"
        >
          ▦
        </button>
        <button
          class="gd-tool-btn gd-tool-btn--icon"
          type="button"
          :disabled="disabled"
          title="Clear formatting"
          @click="emitAction('removeFormat')"
        >
          Tx
        </button>
      </div>

      <div class="gd-toolbar-spacer"></div>

      <div class="gd-toolbar-group gd-toolbar-group--iconic">
        <button class="gd-tool-mode" type="button" disabled>Editing</button>
        <div class="gd-toolbar-menu-wrap">
          <button
            ref="menuTriggerRef"
            class="gd-tool-btn gd-tool-btn--icon"
            type="button"
            :disabled="disabled"
            title="More actions"
            @click.stop="toggleMoreMenu"
          >
            ⋮
          </button>
        </div>
      </div>
    </div>

    <teleport to="body">
      <div
        v-if="moreMenuOpen"
        ref="menuRef"
        class="gd-toolbar-menu"
        :style="{ top: `${menuPosition.top}px`, left: `${menuPosition.left}px` }"
      >
        <button type="button" @click="emitMenuAction('downloadDocument')">Download document</button>
        <button type="button" @click="emitMenuAction('printDocument')">Print</button>
        <button type="button" @click="emitMenuAction('openChartDialog')">Insert chart</button>
        <button type="button" @click="emitMenuAction('toggleTopShell')">
          {{ headerCollapsed ? "Expand top controls" : "Collapse top controls" }}
        </button>
      </div>
    </teleport>

    <teleport to="body">
      <div
        v-if="activePicker"
        ref="pickerMenuRef"
        :class="[
          'gd-toolbar-menu',
          'gd-toolbar-menu--picker',
          activePicker === 'font' ? 'gd-toolbar-menu--font-picker' : '',
        ]"
        :style="{ top: `${pickerPosition.top}px`, left: `${pickerPosition.left}px` }"
      >
        <template v-if="activePicker === 'style'">
          <button
            v-for="option in textStyleOptions"
            :key="option.value"
            type="button"
            :class="{ 'is-active': selectedStyleLabel === option.label }"
            @click="selectTextStyle(option)"
          >
            {{ option.label }}
          </button>
        </template>
        <template v-else-if="activePicker === 'size'">
          <button
            v-for="option in fontSizeOptions"
            :key="option.value"
            type="button"
            :class="{ 'is-active': selectedFontSizeLabel === option.label }"
            @click="selectFontSize(option)"
          >
            {{ option.label }}
          </button>
        </template>
        <template v-else-if="activePicker === 'font'">
          <button
            v-for="option in fontFamilyOptions"
            :key="option.value"
            type="button"
            :class="{ 'is-active': selectedFontFamilyLabel === option.label }"
            @click="selectFontFamily(option)"
          >
            {{ option.label }}
          </button>
        </template>
        <template v-else-if="activePicker === 'list'">
          <button
            v-for="option in listOptions"
            :key="option.value"
            type="button"
            :class="{ 'is-active': selectedListLabel === option.label }"
            @click="selectListStyle(option)"
          >
            {{ option.label }}
          </button>
        </template>
      </div>
    </teleport>
  </div>
</template>

<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";

const props = defineProps({
  disabled: { type: Boolean, default: false },
  zoom: { type: Number, default: 100 },
  headerCollapsed: { type: Boolean, default: false },
});

const emit = defineEmits(["action"]);
const moreMenuOpen = ref(false);
const toolbarRef = ref(null);
const menuTriggerRef = ref(null);
const menuRef = ref(null);
const styleTriggerRef = ref(null);
const fontTriggerRef = ref(null);
const sizeTriggerRef = ref(null);
const listTriggerRef = ref(null);
const pickerMenuRef = ref(null);
const menuPosition = ref({
  top: 0,
  left: 0,
});
const activePicker = ref("");
const pickerPosition = ref({
  top: 0,
  left: 0,
});
const selectedStyleLabel = ref("Normal text");
const selectedFontFamilyLabel = ref("Inter");
const selectedFontSizeLabel = ref("11");
const selectedListLabel = ref("Lists");

const textStyleOptions = [
  { label: "Normal text", value: "P" },
  { label: "Title", value: "TITLE" },
  { label: "Subtitle", value: "SUBTITLE" },
  { label: "Heading 1", value: "H1" },
  { label: "Heading 2", value: "H2" },
  { label: "Heading 3", value: "H3" },
  { label: "Heading 4", value: "H4" },
  { label: "Heading 5", value: "H5" },
  { label: "Heading 6", value: "H6" },
];

const fontSizeOptions = [
  "8",
  "9",
  "10",
  "11",
  "12",
  "14",
  "18",
  "20",
  "22",
  "24",
  "26",
  "28",
  "30",
  "32",
  "36",
  "42",
  "48",
  "54",
  "60",
  "72",
  "96",
].map((value) => ({ label: value, value }));

const fontFamilyOptions = [
  { label: "Inter", value: "Inter, sans-serif" },
  { label: "Google Sans", value: "'Google Sans', 'Helvetica Neue', sans-serif" },
  { label: "Arial", value: "Arial, sans-serif" },
  { label: "Arial Black", value: "'Arial Black', Gadget, sans-serif" },
  { label: "Calibri", value: "Calibri, 'Trebuchet MS', sans-serif" },
  { label: "Cambria", value: "Cambria, Georgia, serif" },
  { label: "Comic Sans MS", value: "'Comic Sans MS', cursive, sans-serif" },
  { label: "Courier New", value: "'Courier New', monospace" },
  { label: "Georgia", value: "Georgia, serif" },
  { label: "Garamond", value: "Garamond, 'Times New Roman', serif" },
  { label: "Helvetica Neue", value: "'Helvetica Neue', Arial, sans-serif" },
  { label: "Impact", value: "Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif" },
  { label: "Merriweather", value: "'Merriweather', Georgia, serif" },
  { label: "Montserrat", value: "'Montserrat', 'Trebuchet MS', sans-serif" },
  { label: "Palatino", value: "'Palatino Linotype', Palatino, serif" },
  { label: "Tahoma", value: "Tahoma, Geneva, sans-serif" },
  { label: "Times New Roman", value: "'Times New Roman', Times, serif" },
  { label: "Trebuchet MS", value: "'Trebuchet MS', sans-serif" },
  { label: "Verdana", value: "Verdana, Geneva, sans-serif" },
];

const listOptions = [
  { label: "Bullets", value: "disc" },
  { label: "Numbered list", value: "decimal" },
  { label: "A, B, C", value: "upper-alpha" },
  { label: "a, b, c", value: "lower-alpha" },
  { label: "I, II, III", value: "upper-roman" },
  { label: "i, ii, iii", value: "lower-roman" },
];

function emitAction(type, value = null) {
  emit("action", { type, value });
}

function emitColor(type, event) {
  emitAction(type, event.target.value);
}

function updateMenuPosition() {
  const trigger = menuTriggerRef.value;
  const menu = menuRef.value;
  if (!trigger || !moreMenuOpen.value) return;

  const rect = trigger.getBoundingClientRect();
  const menuWidth = menu?.offsetWidth || 190;
  const viewportWidth = window.innerWidth || 0;
  menuPosition.value = {
    top: rect.bottom + 10,
    left: Math.max(12, Math.min(rect.right - menuWidth, viewportWidth - menuWidth - 12)),
  };
}

function toggleMoreMenu() {
  activePicker.value = "";
  moreMenuOpen.value = !moreMenuOpen.value;
  if (moreMenuOpen.value) {
    nextTick(() => {
      updateMenuPosition();
    });
  }
}

function pickerTriggerFor(type) {
  return {
    style: styleTriggerRef.value,
    font: fontTriggerRef.value,
    size: sizeTriggerRef.value,
    list: listTriggerRef.value,
  }[type] || null;
}

function updatePickerPosition() {
  if (!activePicker.value) return;
  const trigger = pickerTriggerFor(activePicker.value);
  const menuWidth = pickerMenuRef.value?.offsetWidth || 196;
  if (!trigger) return;
  const rect = trigger.getBoundingClientRect();
  const viewportWidth = window.innerWidth || 0;
  pickerPosition.value = {
    top: rect.bottom + 10,
    left: Math.max(12, Math.min(rect.left, viewportWidth - menuWidth - 12)),
  };
}

function togglePicker(type) {
  moreMenuOpen.value = false;
  activePicker.value = activePicker.value === type ? "" : type;
  if (activePicker.value) {
    nextTick(() => {
      updatePickerPosition();
    });
  }
}

function selectTextStyle(option) {
  selectedStyleLabel.value = option.label;
  activePicker.value = "";
  emitAction("applyNamedStyle", option.value);
}

function selectFontFamily(option) {
  selectedFontFamilyLabel.value = option.label;
  activePicker.value = "";
  emitAction("fontName", option.value);
}

function selectFontSize(option) {
  selectedFontSizeLabel.value = option.label;
  activePicker.value = "";
  emitAction("fontSize", option.value);
}

function selectListStyle(option) {
  selectedListLabel.value = option.label;
  activePicker.value = "";
  emitAction("applyListStyle", option.value);
}

function emitMenuAction(type) {
  moreMenuOpen.value = false;
  emitAction(type);
}

function handleOutsideClick(event) {
  if (
    !event.target.closest(".gd-toolbar-menu-wrap") &&
    !event.target.closest(".gd-toolbar-menu") &&
    !event.target.closest(".gd-tool-button")
  ) {
    moreMenuOpen.value = false;
    activePicker.value = "";
  }
}

function handleToolbarScroll() {
  if (moreMenuOpen.value) {
    updateMenuPosition();
  }
  if (activePicker.value) {
    updatePickerPosition();
  }
}

function handleViewportUpdate() {
  if (moreMenuOpen.value) {
    updateMenuPosition();
  }
  if (activePicker.value) {
    updatePickerPosition();
  }
}

onMounted(() => {
  document.addEventListener("click", handleOutsideClick);
  window.addEventListener("resize", handleViewportUpdate);
  window.addEventListener("scroll", handleViewportUpdate, true);
  toolbarRef.value?.addEventListener("scroll", handleToolbarScroll, { passive: true });
});

onBeforeUnmount(() => {
  document.removeEventListener("click", handleOutsideClick);
  window.removeEventListener("resize", handleViewportUpdate);
  window.removeEventListener("scroll", handleViewportUpdate, true);
  toolbarRef.value?.removeEventListener("scroll", handleToolbarScroll);
});

watch(
  () => props.headerCollapsed,
  () => {
    nextTick(() => {
      if (moreMenuOpen.value) updateMenuPosition();
      if (activePicker.value) updatePickerPosition();
    });
  }
);

watch(activePicker, (value) => {
  if (value) {
    nextTick(() => {
      updatePickerPosition();
    });
  }
});
</script>

<style scoped>
.gd-toolbar-shell {
  position: relative;
}

.gd-toolbar {
  display: flex;
  align-items: center;
  gap: 7px;
  min-height: 42px;
  padding: 6px 8px;
  border-radius: 14px;
  background: rgba(18, 24, 40, 0.92);
  border: 1px solid rgba(176, 201, 255, 0.07);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.02);
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
}

.gd-toolbar::-webkit-scrollbar {
  display: none;
}

.gd-toolbar-group {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.gd-toolbar-group--iconic {
  gap: 4px;
}

.gd-toolbar-divider {
  width: 1px;
  height: 20px;
  background: rgba(176, 201, 255, 0.08);
  flex-shrink: 0;
}

.gd-tool-btn,
.gd-tool-select,
.gd-color-chip,
.gd-tool-badge,
.gd-tool-mode {
  border: 1px solid transparent;
  background: transparent;
  color: rgba(232, 239, 255, 0.78);
  border-radius: 10px;
  min-height: 28px;
  padding: 0 10px;
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.16s ease, color 0.16s ease, border-color 0.16s ease;
}

.gd-tool-btn:hover,
.gd-tool-select:hover,
.gd-color-chip:hover {
  color: var(--text-primary);
  background: rgba(255, 255, 255, 0.05);
  border-color: rgba(176, 201, 255, 0.08);
}

.gd-tool-btn:disabled,
.gd-tool-select:disabled,
.gd-color-chip:has(input:disabled),
.gd-tool-badge:disabled,
.gd-tool-mode:disabled {
  opacity: 0.42;
  cursor: default;
}

.gd-tool-btn--icon {
  min-width: 28px;
  padding: 0 7px;
  justify-content: center;
}

.gd-tool-select {
  appearance: none;
  background:
    linear-gradient(45deg, transparent 50%, rgba(200, 210, 228, 0.68) 50%),
    linear-gradient(135deg, rgba(200, 210, 228, 0.68) 50%, transparent 50%);
  background-position:
    calc(100% - 14px) calc(50% - 2px),
    calc(100% - 10px) calc(50% - 2px);
  background-size: 4px 4px, 4px 4px;
  background-repeat: no-repeat;
  padding-right: 22px;
}

.gd-tool-button {
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.gd-tool-button-caret {
  opacity: 0.72;
  font-size: 10px;
}

.gd-tool-select--wide {
  min-width: 122px;
}

.gd-tool-select--font {
  min-width: 160px;
}

.gd-tool-select--compact {
  min-width: 58px;
}

.gd-tool-select--list {
  min-width: 108px;
}

.gd-tool-badge,
.gd-tool-mode {
  color: rgba(232, 239, 255, 0.76);
  background: rgba(255, 255, 255, 0.02);
  border-color: rgba(176, 201, 255, 0.08);
}

.gd-color-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding-inline: 8px;
}

.gd-color-chip-label {
  position: relative;
  font-weight: 700;
}

.gd-color-chip-label::after {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  bottom: -2px;
  height: 2px;
  background: currentColor;
  border-radius: 999px;
}

.gd-color-chip-label--highlight::after {
  background: #f4d35e;
}

.gd-color-chip input {
  width: 14px;
  height: 14px;
  padding: 0;
  border: none;
  background: transparent;
}

.gd-tool-underline {
  text-decoration: underline;
  text-underline-offset: 2px;
}

.gd-toolbar-spacer {
  flex: 1;
}

.gd-toolbar-menu-wrap {
  position: relative;
}

.gd-toolbar-menu {
  position: fixed;
  min-width: 190px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px;
  border-radius: 14px;
  border: 1px solid rgba(176, 201, 255, 0.12);
  background: rgba(10, 16, 28, 0.98);
  box-shadow: 0 14px 36px rgba(2, 8, 24, 0.34);
  z-index: 40;
}

.gd-toolbar-menu button {
  border: none;
  background: transparent;
  color: rgba(224, 232, 246, 0.82);
  text-align: left;
  font: inherit;
  font-size: 12px;
  padding: 8px 10px;
  border-radius: 10px;
  cursor: pointer;
}

.gd-toolbar-menu button:hover {
  background: rgba(255, 255, 255, 0.06);
}

.gd-toolbar-menu--picker {
  max-height: 320px;
  overflow: auto;
}

.gd-toolbar-menu--font-picker {
  min-width: 220px;
}

.gd-toolbar-menu--picker button {
  min-height: 34px;
  padding: 9px 12px;
  white-space: nowrap;
}

.gd-toolbar-menu--picker button.is-active {
  background: rgba(64, 108, 227, 0.16);
  color: rgba(244, 248, 255, 0.96);
}
</style>
