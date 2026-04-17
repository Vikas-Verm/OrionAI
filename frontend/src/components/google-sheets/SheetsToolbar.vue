<template>
  <div class="gst-toolbar-shell">
    <div ref="toolbarRef" class="gst-toolbar" :class="{ disabled }">
      <div class="gst-toolbar-group gst-toolbar-group--iconic">
        <button
          class="gst-tool-btn gst-tool-btn--icon"
          type="button"
          :title="headerCollapsed ? 'Expand top controls' : 'Collapse top controls'"
          @click="emitAction('toggle_top_shell')"
        >
          {{ headerCollapsed ? "▾" : "▴" }}
        </button>
        <button class="gst-tool-btn gst-tool-btn--icon" type="button" :disabled="disabled" title="Undo" @click="emitAction('undo')">
          ↶
        </button>
        <button class="gst-tool-btn gst-tool-btn--icon" type="button" :disabled="disabled" title="Redo" @click="emitAction('redo')">
          ↷
        </button>
        <button class="gst-tool-btn gst-tool-btn--icon" type="button" title="Print" @click="emitAction('print')">
          🖨
        </button>
      </div>

      <div class="gst-toolbar-divider"></div>

      <div class="gst-toolbar-group">
        <button
          ref="zoomTriggerRef"
          class="gst-tool-select gst-tool-button gst-tool-select--compact"
          type="button"
          @click.stop="togglePicker('zoom')"
        >
          <span>{{ zoomLabel }}</span>
          <span class="gst-tool-button-caret">▾</span>
        </button>

        <button
          ref="fontTriggerRef"
          class="gst-tool-select gst-tool-button gst-tool-select--font"
          type="button"
          :disabled="disabled"
          @click.stop="togglePicker('font')"
        >
          <span>{{ selectedFontFamilyLabel }}</span>
          <span class="gst-tool-button-caret">▾</span>
        </button>

        <button
          ref="sizeTriggerRef"
          class="gst-tool-select gst-tool-button gst-tool-select--compact"
          type="button"
          :disabled="disabled"
          @click.stop="togglePicker('size')"
        >
          <span>{{ selectedFontSizeLabel }}</span>
          <span class="gst-tool-button-caret">▾</span>
        </button>
      </div>

      <div class="gst-toolbar-divider"></div>

      <div class="gst-toolbar-group gst-toolbar-group--iconic">
        <button class="gst-tool-btn gst-tool-btn--icon" type="button" :disabled="disabled" title="Currency" @click="emitAction('apply_number_format', { type: 'currency', pattern: '$#,##0.00' })">
          $
        </button>
        <button class="gst-tool-btn gst-tool-btn--icon" type="button" :disabled="disabled" title="Percent" @click="emitAction('apply_number_format', { type: 'percent', pattern: '0.00%' })">
          %
        </button>
        <button class="gst-tool-btn gst-tool-btn--icon" type="button" :disabled="disabled" title="Decrease decimal places" @click="emitAction('decrease_decimals')">
          .0
        </button>
        <button class="gst-tool-btn gst-tool-btn--icon" type="button" :disabled="disabled" title="Increase decimal places" @click="emitAction('increase_decimals')">
          .00
        </button>
      </div>

      <div class="gst-toolbar-divider"></div>

      <div class="gst-toolbar-group gst-toolbar-group--iconic">
        <button class="gst-tool-btn gst-tool-btn--icon" :class="{ active: format?.bold }" type="button" :disabled="disabled" title="Bold" @click="emitAction('toggle_bold')">
          <strong>B</strong>
        </button>
        <button class="gst-tool-btn gst-tool-btn--icon" :class="{ active: format?.italic }" type="button" :disabled="disabled" title="Italic" @click="emitAction('toggle_italic')">
          <em>I</em>
        </button>
        <button class="gst-tool-btn gst-tool-btn--icon" :class="{ active: format?.underline }" type="button" :disabled="disabled" title="Underline" @click="emitAction('toggle_underline')">
          <span class="gst-tool-underline">U</span>
        </button>

        <label class="gst-color-chip" title="Text color">
          <span class="gst-color-chip-label">A</span>
          <input type="color" :disabled="disabled" :value="textColorValue" @input="emitColor('set_text_color', $event)" />
        </label>
        <label class="gst-color-chip" title="Fill color">
          <span class="gst-color-chip-label gst-color-chip-label--fill">▣</span>
          <input type="color" :disabled="disabled" :value="fillColorValue" @input="emitColor('set_fill_color', $event)" />
        </label>
      </div>

      <div class="gst-toolbar-divider"></div>

      <div class="gst-toolbar-group">
        <button
          ref="alignTriggerRef"
          class="gst-tool-select gst-tool-button gst-tool-select--compact"
          type="button"
          :disabled="disabled"
          @click.stop="togglePicker('align')"
        >
          <span>{{ selectedHorizontalAlignmentLabel }}</span>
          <span class="gst-tool-button-caret">▾</span>
        </button>

        <button
          ref="verticalTriggerRef"
          class="gst-tool-select gst-tool-button gst-tool-select--compact"
          type="button"
          :disabled="disabled"
          @click.stop="togglePicker('vertical')"
        >
          <span>{{ selectedVerticalAlignmentLabel }}</span>
          <span class="gst-tool-button-caret">▾</span>
        </button>

        <button
          ref="borderTriggerRef"
          class="gst-tool-select gst-tool-button gst-tool-select--compact"
          type="button"
          :disabled="disabled"
          @click.stop="togglePicker('border')"
        >
          <span>Borders</span>
          <span class="gst-tool-button-caret">▾</span>
        </button>
      </div>

      <div class="gst-toolbar-divider"></div>

      <div class="gst-toolbar-group gst-toolbar-group--iconic">
        <button class="gst-tool-btn" type="button" :disabled="disabled" title="Merge cells" @click="emitAction('toggle_merge')">
          Merge
        </button>
        <button class="gst-tool-btn" type="button" :disabled="disabled" title="Wrap text" @click="emitAction('toggle_wrap')">
          Wrap
        </button>
        <button class="gst-tool-btn gst-tool-btn--icon" type="button" :disabled="disabled" title="Insert link" @click="emitAction('insert_link')">
          🔗
        </button>
        <button class="gst-tool-btn" type="button" title="Filter" @click="emitAction('open_filter')">
          Filter
        </button>
        <button class="gst-tool-btn" type="button" title="Insert chart" @click="emitAction('open_chart')">
          Chart
        </button>
      </div>

      <div class="gst-toolbar-spacer"></div>

      <div class="gst-toolbar-group gst-toolbar-group--iconic">
        <button class="gst-tool-mode" type="button" disabled>Editing</button>
        <div class="gst-toolbar-menu-wrap">
          <button
            ref="menuTriggerRef"
            class="gst-tool-btn gst-tool-btn--icon"
            type="button"
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
        class="gst-toolbar-menu"
        :style="{ top: `${menuPosition.top}px`, left: `${menuPosition.left}px` }"
      >
        <button type="button" @click="emitMenuAction('toggle_top_shell')">
          {{ headerCollapsed ? "Expand top controls" : "Collapse top controls" }}
        </button>
        <button type="button" @click="emitMenuAction('freeze_row')">Freeze first row</button>
        <button type="button" @click="emitMenuAction('freeze_column')">Freeze first column</button>
        <button type="button" @click="emitMenuAction('clear_formatting')">Clear formatting</button>
      </div>
    </teleport>

    <teleport to="body">
      <div
        v-if="activePicker"
        ref="pickerMenuRef"
        :class="[
          'gst-toolbar-menu',
          'gst-toolbar-menu--picker',
          activePicker === 'font' ? 'gst-toolbar-menu--font-picker' : '',
        ]"
        :style="{ top: `${pickerPosition.top}px`, left: `${pickerPosition.left}px` }"
      >
        <template v-if="activePicker === 'zoom'">
          <button
            v-for="level in zoomOptions"
            :key="level.value"
            type="button"
            :class="{ 'is-active': Number(zoom) === level.value }"
            @click="selectZoom(level.value)"
          >
            {{ level.label }}
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
        <template v-else-if="activePicker === 'size'">
          <button
            v-for="option in fontSizeOptions"
            :key="option.value"
            type="button"
            :class="{ 'is-active': String(currentFontSize) === String(option.value) }"
            @click="selectFontSize(option)"
          >
            {{ option.label }}
          </button>
        </template>
        <template v-else-if="activePicker === 'align'">
          <button
            v-for="option in horizontalAlignmentOptions"
            :key="option.value"
            type="button"
            :class="{ 'is-active': currentHorizontalAlignment === option.value }"
            @click="selectHorizontalAlignment(option)"
          >
            {{ option.label }}
          </button>
        </template>
        <template v-else-if="activePicker === 'vertical'">
          <button
            v-for="option in verticalAlignmentOptions"
            :key="option.value"
            type="button"
            :class="{ 'is-active': currentVerticalAlignment === option.value }"
            @click="selectVerticalAlignment(option)"
          >
            {{ option.label }}
          </button>
        </template>
        <template v-else-if="activePicker === 'border'">
          <button
            v-for="option in borderOptions"
            :key="option.value"
            type="button"
            @click="selectBorder(option)"
          >
            {{ option.label }}
          </button>
        </template>
      </div>
    </teleport>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";

const props = defineProps({
  disabled: {
    type: Boolean,
    default: false,
  },
  zoom: {
    type: Number,
    default: 100,
  },
  format: {
    type: Object,
    default: () => ({}),
  },
  headerCollapsed: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(["action"]);

const toolbarRef = ref(null);
const menuTriggerRef = ref(null);
const menuRef = ref(null);
const zoomTriggerRef = ref(null);
const fontTriggerRef = ref(null);
const sizeTriggerRef = ref(null);
const alignTriggerRef = ref(null);
const verticalTriggerRef = ref(null);
const borderTriggerRef = ref(null);
const pickerMenuRef = ref(null);
const moreMenuOpen = ref(false);
const activePicker = ref("");
const menuPosition = ref({ top: 0, left: 0 });
const pickerPosition = ref({ top: 0, left: 0 });

const zoomOptions = [50, 75, 90, 100, 110, 125, 150].map((value) => ({
  label: `${value}%`,
  value,
}));

const fontFamilyOptions = [
  { label: "Arial", value: "Arial" },
  { label: "Google Sans", value: "Google Sans" },
  { label: "Calibri", value: "Calibri" },
  { label: "Cambria", value: "Cambria" },
  { label: "Georgia", value: "Georgia" },
  { label: "Helvetica Neue", value: "Helvetica Neue" },
  { label: "Inter", value: "Inter" },
  { label: "Montserrat", value: "Montserrat" },
  { label: "Roboto", value: "Roboto" },
  { label: "Times New Roman", value: "Times New Roman" },
  { label: "Verdana", value: "Verdana" },
  { label: "Courier New", value: "Courier New" },
];

const fontSizeOptions = [8, 9, 10, 11, 12, 13, 14, 16, 18, 20, 24, 30, 36].map((value) => ({
  label: String(value),
  value,
}));

const horizontalAlignmentOptions = [
  { label: "Left", value: "left" },
  { label: "Center", value: "center" },
  { label: "Right", value: "right" },
];

const verticalAlignmentOptions = [
  { label: "Top", value: "top" },
  { label: "Middle", value: "middle" },
  { label: "Bottom", value: "bottom" },
];

const borderOptions = [
  { label: "All borders", value: "all" },
];

const currentFontFamily = computed(() => String(props.format?.fontFamily || "Arial"));
const currentFontSize = computed(() => Number(props.format?.fontSize || 10));
const currentHorizontalAlignment = computed(() =>
  String(props.format?.horizontalAlignment || "left")
);
const currentVerticalAlignment = computed(() =>
  String(props.format?.verticalAlignment || "middle")
);
const selectedFontFamilyLabel = computed(() => {
  const match = fontFamilyOptions.find(
    (option) => option.value.toLowerCase() === currentFontFamily.value.toLowerCase()
  );
  return match?.label || currentFontFamily.value || "Arial";
});
const selectedFontSizeLabel = computed(() => String(currentFontSize.value || 10));
const selectedHorizontalAlignmentLabel = computed(() => {
  const match = horizontalAlignmentOptions.find(
    (option) => option.value === currentHorizontalAlignment.value
  );
  return match?.label || "Left";
});
const selectedVerticalAlignmentLabel = computed(() => {
  const match = verticalAlignmentOptions.find(
    (option) => option.value === currentVerticalAlignment.value
  );
  return match?.label || "Middle";
});
const zoomLabel = computed(() => `${Number(props.zoom || 100)}%`);
const textColorValue = computed(() => props.format?.textColor || "#111827");
const fillColorValue = computed(() => props.format?.fillColor || "#ffffff");

function emitAction(type, value = null) {
  moreMenuOpen.value = false;
  activePicker.value = "";
  emit("action", { type, value });
}

function emitColor(type, event) {
  emitAction(type, event.target.value);
}

function pickerTriggerFor(type) {
  return {
    zoom: zoomTriggerRef.value,
    font: fontTriggerRef.value,
    size: sizeTriggerRef.value,
    align: alignTriggerRef.value,
    vertical: verticalTriggerRef.value,
    border: borderTriggerRef.value,
  }[type] || null;
}

function updateMenuPosition() {
  if (!moreMenuOpen.value || !menuTriggerRef.value) return;
  const rect = menuTriggerRef.value.getBoundingClientRect();
  const menuWidth = menuRef.value?.offsetWidth || 190;
  const viewportWidth = window.innerWidth || 0;
  menuPosition.value = {
    top: rect.bottom + 10,
    left: Math.max(12, Math.min(rect.right - menuWidth, viewportWidth - menuWidth - 12)),
  };
}

function updatePickerPosition() {
  if (!activePicker.value) return;
  const trigger = pickerTriggerFor(activePicker.value);
  if (!trigger) return;
  const rect = trigger.getBoundingClientRect();
  const menuWidth = pickerMenuRef.value?.offsetWidth || 196;
  const viewportWidth = window.innerWidth || 0;
  pickerPosition.value = {
    top: rect.bottom + 10,
    left: Math.max(12, Math.min(rect.left, viewportWidth - menuWidth - 12)),
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

function togglePicker(type) {
  if (props.disabled && type !== "zoom") return;
  moreMenuOpen.value = false;
  activePicker.value = activePicker.value === type ? "" : type;
  if (activePicker.value) {
    nextTick(() => {
      updatePickerPosition();
    });
  }
}

function selectZoom(value) {
  emitAction("set_zoom", value);
}

function selectFontFamily(option) {
  emitAction("set_font_family", option.value);
}

function selectFontSize(option) {
  emitAction("set_font_size", option.value);
}

function selectHorizontalAlignment(option) {
  emitAction("set_horizontal_alignment", option.value);
}

function selectVerticalAlignment(option) {
  emitAction("set_vertical_alignment", option.value);
}

function selectBorder(option) {
  emitAction("set_border", option.value);
}

function emitMenuAction(type) {
  emitAction(type);
}

function handleOutsideClick(event) {
  if (
    !event.target.closest(".gst-toolbar-menu-wrap") &&
    !event.target.closest(".gst-toolbar-menu") &&
    !event.target.closest(".gst-tool-button")
  ) {
    moreMenuOpen.value = false;
    activePicker.value = "";
  }
}

function handleViewportUpdate() {
  if (moreMenuOpen.value) updateMenuPosition();
  if (activePicker.value) updatePickerPosition();
}

onMounted(() => {
  document.addEventListener("click", handleOutsideClick);
  window.addEventListener("resize", handleViewportUpdate);
  window.addEventListener("scroll", handleViewportUpdate, true);
  toolbarRef.value?.addEventListener("scroll", handleViewportUpdate, { passive: true });
});

onBeforeUnmount(() => {
  document.removeEventListener("click", handleOutsideClick);
  window.removeEventListener("resize", handleViewportUpdate);
  window.removeEventListener("scroll", handleViewportUpdate, true);
  toolbarRef.value?.removeEventListener("scroll", handleViewportUpdate);
});
</script>

<style scoped>
.gst-toolbar-shell {
  position: relative;
}

.gst-toolbar {
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

.gst-toolbar::-webkit-scrollbar {
  display: none;
}

.gst-toolbar.disabled {
  opacity: 0.9;
}

.gst-toolbar-group {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.gst-toolbar-group--iconic {
  gap: 4px;
}

.gst-toolbar-divider {
  width: 1px;
  height: 20px;
  background: rgba(176, 201, 255, 0.08);
  flex-shrink: 0;
}

.gst-tool-btn,
.gst-tool-select,
.gst-color-chip,
.gst-tool-mode {
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

.gst-tool-btn:hover,
.gst-tool-select:hover,
.gst-color-chip:hover {
  color: var(--text-primary);
  background: rgba(255, 255, 255, 0.05);
  border-color: rgba(176, 201, 255, 0.08);
}

.gst-tool-btn:disabled,
.gst-tool-select:disabled,
.gst-color-chip:has(input:disabled),
.gst-tool-mode:disabled {
  opacity: 0.42;
  cursor: default;
}

.gst-tool-btn.active {
  color: var(--text-primary);
  background: rgba(78, 127, 255, 0.14);
  border-color: rgba(78, 127, 255, 0.18);
}

.gst-tool-btn--icon {
  min-width: 28px;
  padding: 0 7px;
  justify-content: center;
}

.gst-tool-button {
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.gst-tool-button-caret {
  opacity: 0.72;
  font-size: 10px;
}

.gst-tool-select--font {
  min-width: 150px;
}

.gst-tool-select--compact {
  min-width: 58px;
}

.gst-color-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding-inline: 8px;
}

.gst-color-chip-label {
  position: relative;
  font-weight: 700;
}

.gst-color-chip-label::after {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  bottom: -2px;
  height: 2px;
  background: currentColor;
  border-radius: 999px;
}

.gst-color-chip-label--fill::after {
  background: #8bdab0;
}

.gst-color-chip input {
  width: 14px;
  height: 14px;
  padding: 0;
  border: none;
  background: transparent;
}

.gst-tool-underline {
  text-decoration: underline;
  text-underline-offset: 2px;
}

.gst-toolbar-spacer {
  flex: 1;
}

.gst-toolbar-menu-wrap {
  position: relative;
}

.gst-tool-mode {
  color: rgba(232, 239, 255, 0.76);
  background: rgba(255, 255, 255, 0.02);
  border-color: rgba(176, 201, 255, 0.08);
}

.gst-toolbar-menu {
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
  z-index: 70;
}

.gst-toolbar-menu--picker {
  min-width: 184px;
  max-height: min(320px, calc(100vh - 80px));
  overflow: auto;
}

.gst-toolbar-menu--font-picker {
  min-width: 218px;
}

.gst-toolbar-menu button {
  border: none;
  background: transparent;
  color: rgba(224, 232, 246, 0.8);
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  text-align: left;
  padding: 9px 11px;
  border-radius: 10px;
  cursor: pointer;
}

.gst-toolbar-menu button:hover,
.gst-toolbar-menu button.is-active {
  background: rgba(255, 255, 255, 0.05);
  color: white;
}
</style>
