<template>
  <div ref="shellRef" class="gd-editor-shell" @scroll.passive="handleShellScroll">
    <div ref="pageRef" class="gd-editor-page" :style="{ zoom: zoom / 100 }">
      <!-- Page breaks -->
      <div
        v-for="p in localPageCount - 1"
        :key="p"
        class="gd-page-break"
        :style="{ top: `${p * GOOGLE_DOCS_PAGE_HEIGHT}px` }"
        contenteditable="false"
      >
        <span class="gd-page-break-text">Page {{ p + 1 }}</span>
      </div>

      <div
        ref="editorRef"
        class="gd-editor"
        :contenteditable="!disabled"
        spellcheck="true"
        @input="handleInput"
        @keyup="emitSelectionContext"
        @mouseup="handlePointerSelection"
        @click="handleEditorClick"
        @contextmenu="handleContextMenu"
        @dragstart="handleDragStart"
        @dragover="handleDragOver"
        @drop="handleDrop"
        @dragend="handleDragEnd"
      ></div>
    </div>

    <button
      v-if="selectedMedia?.visible"
      class="gd-media-resize-handle"
      type="button"
      :style="{ top: `${selectedMedia.handleTop}px`, left: `${selectedMedia.handleLeft}px` }"
      @mousedown.prevent="startResize"
    ></button>

    <button
      v-if="selectedTable?.visible"
      class="gd-table-corner"
      type="button"
      :style="{ top: `${selectedTable.cornerTop}px`, left: `${selectedTable.cornerLeft}px` }"
      @click.stop="toggleTableMenu"
    >
      ▦
    </button>

    <div
      v-if="floatingMenu.visible"
      ref="floatingMenuRef"
      class="gd-editor-menu"
      :style="{ top: `${floatingMenu.top}px`, left: `${floatingMenu.left}px` }"
    >
      <template v-if="floatingMenu.type === 'table'">
        <button type="button" @click="runTableAction('insertRowAbove')">Insert row above</button>
        <button type="button" @click="runTableAction('insertRowBelow')">Insert row below</button>
        <button type="button" @click="runTableAction('insertColumnLeft')">Insert column left</button>
        <button type="button" @click="runTableAction('insertColumnRight')">Insert column right</button>
        <button type="button" @click="runTableAction('deleteRow')">Delete row</button>
        <button type="button" @click="runTableAction('deleteColumn')">Delete column</button>
        <button type="button" @click="runTableAction('deleteTable')">Delete table</button>
      </template>

      <template v-else-if="floatingMenu.type === 'media'">
        <button type="button" @click="removeSelectedMedia">Remove image</button>
      </template>
    </div>
  </div>
</template>

<script setup>
import { marked } from "marked";
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";

const GOOGLE_DOCS_PAGE_HEIGHT = 1122;
const GOOGLE_DOCS_BODY_HEIGHT = 1180;
const ORDERED_LIST_STYLES = new Set([
  "decimal",
  "upper-alpha",
  "lower-alpha",
  "upper-roman",
  "lower-roman",
]);
const INLINE_STREAM_TAGS = new Set([
  "A",
  "B",
  "BLOCKQUOTE",
  "CODE",
  "EM",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "LI",
  "OL",
  "P",
  "PRE",
  "SPAN",
  "STRONG",
  "TD",
  "TH",
  "U",
  "UL",
]);

const props = defineProps({
  modelValue: { type: String, default: "" },
  zoom: { type: Number, default: 100 },
  disabled: { type: Boolean, default: false },
  documentId: { type: String, default: "" },
});

const emit = defineEmits([
  "update:modelValue",
  "outline-change",
  "selection-change",
  "metrics-change",
]);

const editorRef = ref(null);
const pageRef = ref(null);
const shellRef = ref(null);
const floatingMenuRef = ref(null);
const selectedMedia = ref(null);
const selectedTable = ref(null);
const localPageCount = ref(1);
const floatingMenu = ref({
  visible: false,
  type: "",
  top: 0,
  left: 0,
});

const historyByDocument = new Map();
let syncingFromProps = false;
let resizeState = null;
let streamCancelled = false;
let historyCommitTimer = null;
let suppressHistoryCapture = false;
let draggedBlock = null;
let savedSelectionRange = null;

function normalizeHtml(value) {
  return value && value.trim() ? value : "<p><br /></p>";
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function sanitizeHtml(html = "") {
  if (typeof window === "undefined") return html;

  const parser = new DOMParser();
  const doc = parser.parseFromString(String(html || ""), "text/html");
  doc.querySelectorAll("script,style,iframe,object,embed").forEach((node) => node.remove());
  doc.body.querySelectorAll("*").forEach((element) => {
    Array.from(element.attributes).forEach((attribute) => {
      const name = attribute.name.toLowerCase();
      if (name.startsWith("on")) {
        element.removeAttribute(attribute.name);
      }
    });
  });

  doc.body.querySelectorAll("font").forEach((font) => {
    const span = doc.createElement("span");
    if (font.getAttribute("size")) {
      const sizeMap = { "1": "8pt", "2": "10pt", "3": "12pt", "4": "14pt", "5": "18pt", "6": "24pt", "7": "36pt" };
      span.style.fontSize = sizeMap[font.getAttribute("size")] || "11pt";
    }
    if (font.getAttribute("face")) {
      span.style.fontFamily = font.getAttribute("face");
    }
    if (font.getAttribute("color")) {
      span.style.color = font.getAttribute("color");
    }
    if (font.style.cssText) {
      span.style.cssText += font.style.cssText;
    }
    span.innerHTML = font.innerHTML;
    font.replaceWith(span);
  });

  return doc.body.innerHTML || "<p><br /></p>";
}

function topLevelChildForNode(node) {
  const editor = editorRef.value;
  if (!editor || !node) return null;

  let current = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
  while (current && current.parentElement !== editor) {
    current = current.parentElement;
  }
  return current && current.parentElement === editor ? current : null;
}

function currentHistoryKey() {
  return props.documentId || "__default_google_doc__";
}

function getHistoryState(initialHtml = props.modelValue) {
  const key = currentHistoryKey();
  const normalized = normalizeHtml(initialHtml);
  let state = historyByDocument.get(key);
  if (!state) {
    state = {
      undoStack: [normalized],
      redoStack: [],
      hasEdits: false,
    };
    historyByDocument.set(key, state);
  }
  return state;
}

function flushHistoryCapture() {
  if (!historyCommitTimer) return;
  clearTimeout(historyCommitTimer);
  historyCommitTimer = null;
  if (!syncingFromProps && !suppressHistoryCapture) {
    captureHistorySnapshot();
  }
}

function captureHistorySnapshot(html = getEditorHtml()) {
  if (syncingFromProps || suppressHistoryCapture) return;
  const normalized = normalizeHtml(html);
  const state = getHistoryState(normalized);
  if (state.undoStack[state.undoStack.length - 1] !== normalized) {
    state.undoStack.push(normalized);
    if (state.undoStack.length > 140) {
      state.undoStack.shift();
    }
    state.redoStack = [];
    state.hasEdits = true;
  }
}

function scheduleHistoryCapture() {
  if (syncingFromProps || suppressHistoryCapture) return;
  if (historyCommitTimer) clearTimeout(historyCommitTimer);
  historyCommitTimer = window.setTimeout(() => {
    historyCommitTimer = null;
    captureHistorySnapshot();
  }, 240);
}

function applyHistorySnapshot(html) {
  const editor = editorRef.value;
  if (!editor) return;

  const nextHtml = normalizeHtml(html);
  suppressHistoryCapture = true;
  syncingFromProps = true;
  clearSelections();
  editor.innerHTML = nextHtml;
  emit("update:modelValue", nextHtml);
  emitOutline();
  nextTick(() => {
    emitMetrics();
    emitSelectionContext();
    syncingFromProps = false;
    suppressHistoryCapture = false;
  });
}

function undoHistory() {
  flushHistoryCapture();
  const state = getHistoryState(getEditorHtml());
  if (state.undoStack.length < 2) return;
  const current = state.undoStack.pop();
  if (current != null) {
    state.redoStack.push(current);
  }
  applyHistorySnapshot(state.undoStack[state.undoStack.length - 1]);
}

function redoHistory() {
  flushHistoryCapture();
  const state = getHistoryState(getEditorHtml());
  const next = state.redoStack.pop();
  if (!next) return;
  state.undoStack.push(next);
  applyHistorySnapshot(next);
}

function ensureHeadingIds() {
  const editor = editorRef.value;
  if (!editor) return [];

  let index = 1;
  return Array.from(editor.querySelectorAll("h1,h2,h3,h4,h5,h6")).map((heading) => {
    if (!heading.id) {
      const slug =
        heading.textContent
          ?.trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "") || "section";
      heading.id = `${slug}-${index}`;
    }
    const item = {
      id: heading.id,
      title: heading.textContent?.trim() || `Section ${index}`,
      level: Number(heading.tagName.slice(1)),
    };
    index += 1;
    return item;
  });
}

function emitOutline() {
  emit("outline-change", ensureHeadingIds());
}

function emitMetrics() {
  const editor = editorRef.value;
  const shell = shellRef.value;
  if (!editor) return;

  const scale = props.zoom / 100 || 1;
  const pageCount = Math.max(
    1,
    Math.ceil(editor.scrollHeight / GOOGLE_DOCS_PAGE_HEIGHT)
  );
  localPageCount.value = pageCount;
  const currentPage = shell
    ? Math.min(
        pageCount,
        Math.max(
          1,
          Math.floor(
            (shell.scrollTop + shell.clientHeight * 0.35) /
              (GOOGLE_DOCS_PAGE_HEIGHT * scale)
          ) + 1
        )
      )
    : 1;

  emit("metrics-change", {
    pageCount,
    currentPage,
  });
}

function getEditorHtml() {
  return normalizeHtml(editorRef.value?.innerHTML || "");
}

function findCurrentSectionHeading(block) {
  const editor = editorRef.value;
  if (!editor) return null;

  let current = block;
  while (current) {
    if (/H[1-6]/.test(current.tagName)) return current;
    current = current.previousElementSibling;
  }

  return editor.querySelector("h1,h2,h3,h4,h5,h6");
}

function extractSectionText(heading) {
  if (!heading) return "";
  const parts = [heading.textContent?.trim() || ""];
  let node = heading.nextElementSibling;
  while (node && !/H[1-6]/.test(node.tagName)) {
    const text = node.textContent?.replace(/\s+/g, " ").trim();
    if (text) parts.push(text);
    node = node.nextElementSibling;
  }
  return parts.filter(Boolean).join("\n\n").trim();
}

function emitSelectionContext() {
  const editor = editorRef.value;
  const selection = window.getSelection();
  if (!editor || !selection?.rangeCount) return;

  const anchorNode = selection.anchorNode;
  if (!anchorNode || !editor.contains(anchorNode)) return;
  savedSelectionRange = selection.getRangeAt(0).cloneRange();

  const selectionText = selection.toString().trim();
  const currentBlock = topLevelChildForNode(anchorNode);
  const heading = findCurrentSectionHeading(currentBlock);
  const currentSectionText = heading
    ? extractSectionText(heading)
    : editor.textContent?.replace(/\s+/g, " ").trim() || "";

  const parentElement = anchorNode.nodeType === Node.ELEMENT_NODE ? anchorNode : anchorNode.parentElement;
  let activeFontFamily = "Inter";
  let activeFontSize = "11";
  let activeBold = false;
  let activeItalic = false;
  let activeUnderline = false;
  let activeAlign = "left";
  let activeStyle = "P";

  if (parentElement && editor.contains(parentElement)) {
    const computedStyle = window.getComputedStyle(parentElement);
    activeFontFamily = computedStyle.fontFamily;

    const inlineSize = parentElement.style?.fontSize || "";
    if (inlineSize && inlineSize.includes("pt")) {
      activeFontSize = inlineSize;
    } else {
      let el = parentElement;
      let found = false;
      while (el && el !== editor) {
        if (el.style?.fontSize?.includes("pt")) {
          activeFontSize = el.style.fontSize;
          found = true;
          break;
        }
        el = el.parentElement;
      }
      if (!found) {
        activeFontSize = computedStyle.fontSize;
      }
    }
    activeBold = computedStyle.fontWeight === "bold" || Number(computedStyle.fontWeight) >= 700;
    activeItalic = computedStyle.fontStyle === "italic";
    activeUnderline = computedStyle.textDecorationLine?.includes("underline") ||
                      computedStyle.textDecoration?.includes("underline") ||
                      parentElement.closest("u") !== null;
    activeAlign = computedStyle.textAlign || "left";

    let block = parentElement;
    while (block && block !== editor && !/^(P|H[1-6]|DIV|PRE|BLOCKQUOTE)$/.test(block.tagName)) {
      block = block.parentElement;
    }
    if (block && block !== editor) {
      activeStyle = block.tagName;
    }
  }

  emit("selection-change", {
    selectionText,
    currentSectionText,
    fontFamily: activeFontFamily,
    fontSize: activeFontSize,
    bold: activeBold,
    italic: activeItalic,
    underline: activeUnderline,
    align: activeAlign,
    style: activeStyle,
  });
}

function currentSelectionRange() {
  const editor = editorRef.value;
  const selection = window.getSelection();
  if (!editor || !selection?.rangeCount) return null;
  const range = selection.getRangeAt(0);
  return editor.contains(range.startContainer) ? range : null;
}

function isRangeInsideEditor(range) {
  const editor = editorRef.value;
  return Boolean(
    editor &&
      range &&
      editor.contains(range.startContainer) &&
      editor.contains(range.endContainer)
  );
}

function createRangeAtDocumentStart() {
  const editor = editorRef.value;
  if (!editor) return null;

  const range = document.createRange();
  range.selectNodeContents(editor);
  range.collapse(true);
  return range;
}

function createRangeAtDocumentEnd() {
  const editor = editorRef.value;
  if (!editor) return null;

  const range = document.createRange();
  range.selectNodeContents(editor);
  range.collapse(false);
  return range;
}

function setSelectionRange(range) {
  const selection = window.getSelection();
  if (!selection || !range) return;
  selection.removeAllRanges();
  selection.addRange(range);
  if (isRangeInsideEditor(range)) {
    savedSelectionRange = range.cloneRange();
  }
}

function focusEditor() {
  editorRef.value?.focus();
}

function closeFloatingMenu() {
  floatingMenu.value = {
    visible: false,
    type: "",
    top: 0,
    left: 0,
  };
}

function openFloatingMenu(type, top, left) {
  floatingMenu.value = {
    visible: true,
    type,
    top: Math.max(12, top),
    left: Math.max(12, left),
  };
}

function clearSelectedMedia() {
  if (selectedMedia.value?.element) {
    selectedMedia.value.element.classList.remove("gd-media-selected");
  }
  selectedMedia.value = null;
  if (floatingMenu.value.type === "media") closeFloatingMenu();
}

function clearSelectedTable() {
  if (selectedTable.value?.element) {
    selectedTable.value.element.classList.remove("gd-table-selected");
  }
  selectedTable.value = null;
  if (floatingMenu.value.type === "table") closeFloatingMenu();
}

function clearSelections() {
  clearSelectedMedia();
  clearSelectedTable();
}

function updateSelectedMediaOverlay() {
  const element = selectedMedia.value?.element;
  if (!element) return;
  const rect = element.getBoundingClientRect();

  if (rect.width <= 0 || rect.height <= 0) {
    clearSelectedMedia();
    return;
  }

  selectedMedia.value = {
    ...selectedMedia.value,
    handleTop: rect.bottom - 7,
    handleLeft: rect.right - 7,
    visible: true,
  };
}

function updateSelectedTableOverlay() {
  const table = selectedTable.value?.element;
  if (!table) return;
  const rect = table.getBoundingClientRect();

  if (rect.width <= 0 || rect.height <= 0) {
    clearSelectedTable();
    return;
  }

  selectedTable.value = {
    ...selectedTable.value,
    cornerTop: Math.max(12, rect.top - 12),
    cornerLeft: Math.max(12, rect.left - 12),
    visible: true,
  };
}

function selectMediaElement(element, type = "image") {
  if (!element) return;

  clearSelectedTable();
  clearSelectedMedia();
  element.classList.add("gd-media-selected");
  selectedMedia.value = {
    type,
    element,
    handleTop: 0,
    handleLeft: 0,
    visible: true,
  };
  updateSelectedMediaOverlay();
}

function selectTableElement(table, activeCell = null) {
  if (!table) return;

  clearSelectedMedia();
  clearSelectedTable();
  table.classList.add("gd-table-selected");
  selectedTable.value = {
    element: table,
    activeCell:
      (activeCell && activeCell.isConnected ? activeCell : null) ||
      table.querySelector("td,th") ||
      null,
    cornerTop: 0,
    cornerLeft: 0,
    visible: true,
  };
  updateSelectedTableOverlay();
}

function syncFromProps(html) {
  const editor = editorRef.value;
  if (!editor) return;

  const nextHtml = normalizeHtml(html);
  const history = getHistoryState(nextHtml);
  if (!history.hasEdits && history.undoStack.length === 1 && history.undoStack[0] !== nextHtml) {
    history.undoStack[0] = nextHtml;
  }

  if (editor.innerHTML === nextHtml) {
    emitOutline();
    emitMetrics();
    return;
  }

  syncingFromProps = true;
  clearSelections();
  closeFloatingMenu();
  editor.innerHTML = nextHtml;
  savedSelectionRange = null;
  emitOutline();
  nextTick(() => {
    emitMetrics();
    syncingFromProps = false;
  });
}

function handleInput() {
  if (syncingFromProps) return;
  emit("update:modelValue", getEditorHtml());
  emitOutline();
  emitMetrics();
  updateSelectedMediaOverlay();
  updateSelectedTableOverlay();
  scheduleHistoryCapture();
}

function insertHtml(html, { appendToEnd = false } = {}) {
  const editor = editorRef.value;
  if (!editor || props.disabled) return;

  const range = appendToEnd
    ? createRangeAtDocumentEnd()
    : currentInsertionRange();
  if (!range) return;
  focusEditor();
  setSelectionRange(range);

  range.deleteContents();
  const fragment = range.createContextualFragment(sanitizeHtml(html));
  const lastNode = fragment.lastChild;
  range.insertNode(fragment);

  if (lastNode) {
    range.setStartAfter(lastNode);
    range.collapse(true);
    setSelectionRange(range);
  }

  handleInput();
  emitSelectionContext();
}

function isEmptyEditorBlock(node) {
  if (!node || node.nodeType !== Node.ELEMENT_NODE) return false;
  const text = node.textContent?.replace(/\u200b/g, "").trim() || "";
  if (text) return false;
  const normalizedHtml = (node.innerHTML || "")
    .replace(/\s+/g, "")
    .replace(/<br\s*\/?>/gi, "<br>")
    .toLowerCase();
  return !normalizedHtml || normalizedHtml === "<br>";
}

function insertBlockHtml(html, { appendToEnd = false } = {}) {
  const editor = editorRef.value;
  if (!editor || props.disabled) return;

  const range = appendToEnd ? createRangeAtDocumentEnd() : currentInsertionRange();
  if (!range) return;

  const fragment = range.createContextualFragment(sanitizeHtml(html));
  const lastNode = fragment.lastChild;
  if (!lastNode) return;

  focusEditor();
  setSelectionRange(range);

  const currentBlock = appendToEnd ? editor.lastElementChild : topLevelChildForNode(range.startContainer);
  const blankDocument =
    editor.children.length === 1 && isEmptyEditorBlock(editor.firstElementChild);

  if (blankDocument && editor.firstElementChild) {
    editor.firstElementChild.replaceWith(fragment);
  } else if (currentBlock?.parentElement === editor) {
    if (isEmptyEditorBlock(currentBlock)) {
      currentBlock.replaceWith(fragment);
    } else {
      currentBlock.after(fragment);
    }
  } else {
    editor.appendChild(fragment);
  }

  const cursorTarget = lastNode.isConnected ? lastNode : editor.lastChild;
  if (cursorTarget?.parentNode) {
    const nextRange = document.createRange();
    nextRange.setStartAfter(cursorTarget);
    nextRange.collapse(true);
    setSelectionRange(nextRange);
  }

  handleInput();
  emitSelectionContext();
}

function wrapSelectionWithStyle(styleProp, styleValue) {
  const selection = window.getSelection();
  if (!selection || !selection.rangeCount) return;

  if (!selection.isCollapsed) {
    const range = selection.getRangeAt(0);
    const fragment = range.extractContents();

    function applyToTextNodes(node) {
      if (node.nodeType === Node.TEXT_NODE) {
        if (!node.textContent) return node;
        const span = document.createElement("span");
        span.style[styleProp] = styleValue;
        span.appendChild(node.cloneNode(true));
        return span;
      }
      if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node;
        el.style[styleProp] = styleValue;
        return el;
      }
      return node;
    }

    const wrapper = document.createDocumentFragment();
    Array.from(fragment.childNodes).forEach((child) => {
      wrapper.appendChild(applyToTextNodes(child));
    });

    range.insertNode(wrapper);

    selection.removeAllRanges();
    selection.addRange(range);
  } else {
    const range = selection.getRangeAt(0);
    const span = document.createElement("span");
    span.style[styleProp] = styleValue;
    span.innerHTML = "​";

    range.insertNode(span);

    const nextRange = document.createRange();
    nextRange.setStart(span.firstChild, 1);
    nextRange.collapse(true);
    selection.removeAllRanges();
    selection.addRange(nextRange);
    savedSelectionRange = nextRange.cloneRange();
  }
}

function applyFontSize(size) {
  const pt = Number(size || 11);
  wrapSelectionWithStyle("fontSize", `${pt}pt`);
}

function applyFontFamily(fontFamily = "Inter, sans-serif") {
  // Extract primary font name only — Google Docs HTML converter
  // can't parse CSS fallback stacks like "'Roboto', sans-serif".
  const primary = fontFamily
    .split(",")[0]
    .trim()
    .replace(/^['"]|['"]$/g, "");
  wrapSelectionWithStyle("fontFamily", primary);
}

function applyNamedStyle(style = "P") {
  const normalized = String(style || "P").toUpperCase();
  const tagMap = {
    P: "P",
    NORMAL_TEXT: "P",
    TITLE: "H1",
    SUBTITLE: "H2",
    H1: "H1",
    H2: "H2",
    H3: "H3",
    H4: "H4",
    H5: "H5",
    H6: "H6",
  };

  applyFormatBlock(tagMap[normalized] || "P");
}

function applyFormatBlock(tagName = "P") {
  const tag = String(tagName || "P").toLowerCase();
  document.execCommand("formatBlock", false, `<${tag}>`);
}

function closestListFromSelection() {
  const selection = window.getSelection();
  const editor = editorRef.value;
  if (!selection?.anchorNode || !editor) return null;

  let node =
    selection.anchorNode.nodeType === Node.ELEMENT_NODE
      ? selection.anchorNode
      : selection.anchorNode.parentElement;

  while (node && node !== editor) {
    if (node.tagName === "OL" || node.tagName === "UL") return node;
    node = node.parentElement;
  }

  return null;
}

function applyListStyle(style = "disc") {
  const ordered = ORDERED_LIST_STYLES.has(style);
  const listCommand = ordered ? "insertOrderedList" : "insertUnorderedList";
  const targetTag = ordered ? "OL" : "UL";

  document.execCommand(listCommand, false);

  let list = closestListFromSelection();
  if (!list || list.tagName !== targetTag) {
    document.execCommand(listCommand, false);
    list = closestListFromSelection();
  }

  if (!list) return;
  list.style.listStyleType = ordered ? style : "disc";
  handleInput();
  emitSelectionContext();
}

function buildBlankTable(rows = 3, columns = 3) {
  return `<table><tbody>${Array.from({ length: rows }, () =>
    `<tr>${Array.from(
      { length: columns },
      () => '<td><p><br /></p></td>'
    ).join("")}</tr>`
  ).join("")}</tbody></table><p><br /></p>`;
}

function mediaFigureMarkup({
  className = "gd-image-block",
  src = "",
  alt = "",
  width = 520,
  height = 320,
  caption = "",
} = {}) {
  const safeWidth = Math.max(160, Number(width) || 520);
  const safeHeight = Math.max(96, Number(height) || 320);

  return `<figure class="${className}" contenteditable="false" draggable="true" style="width:${safeWidth}px;max-width:100%;margin:0 auto 18px;">
      <img src="${escapeHtml(src)}" alt="${escapeHtml(
        alt || "Document image"
      )}" width="${safeWidth}" height="${safeHeight}" style="width:${safeWidth}px;height:${safeHeight}px;max-width:100%;display:block;" />
      ${caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : ""}
    </figure><p><br /></p>`;
}

function insertImageBlock({ src = "", alt = "", width = 520, height = 320 } = {}) {
  if (!src) return;
  insertBlockHtml(mediaFigureMarkup({ className: "gd-image-block", src, alt, width, height }));
}

function chartColor(index) {
  return ["#2563eb", "#14b8a6", "#f59e0b", "#ec4899", "#8b5cf6", "#ef4444"][index % 6];
}

function buildChartSvg({ type = "bar", title = "", labels = [], values = [] } = {}) {
  const safeLabels = labels.length ? labels : ["Q1", "Q2", "Q3", "Q4"];
  const safeValues = values.length ? values : [42, 63, 51, 78];
  const max = Math.max(...safeValues, 1);
  const width = 640;
  const height = 320;

  if (type === "pie") {
    let start = 0;
    const total = safeValues.reduce((sum, value) => sum + value, 0) || 1;
    const arcs = safeValues
      .map((value, index) => {
        const angle = (value / total) * Math.PI * 2;
        const end = start + angle;
        const largeArc = angle > Math.PI ? 1 : 0;
        const x1 = 320 + Math.cos(start - Math.PI / 2) * 90;
        const y1 = 160 + Math.sin(start - Math.PI / 2) * 90;
        const x2 = 320 + Math.cos(end - Math.PI / 2) * 90;
        const y2 = 160 + Math.sin(end - Math.PI / 2) * 90;
        const path = `M320 160 L${x1.toFixed(2)} ${y1.toFixed(2)} A90 90 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z`;
        start = end;
        return `<path d="${path}" fill="${chartColor(index)}"></path>`;
      })
      .join("");

    return `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">
        <rect width="${width}" height="${height}" rx="18" fill="#ffffff"></rect>
        <text x="40" y="38" fill="#111827" font-size="22" font-family="Arial" font-weight="700">${escapeHtml(title || "Chart")}</text>
        ${arcs}
        ${safeLabels
          .map(
            (label, index) =>
              `<rect x="452" y="${86 + index * 30}" width="12" height="12" rx="3" fill="${chartColor(index)}"></rect>
               <text x="472" y="${96 + index * 30}" fill="#374151" font-size="14" font-family="Arial">${escapeHtml(label)}</text>`
          )
          .join("")}
      </svg>`;
  }

  if (type === "line") {
    const points = safeValues
      .map((value, index) => {
        const x = 90 + index * ((width - 150) / Math.max(1, safeValues.length - 1));
        const y = 250 - (value / max) * 140;
        return `${x},${y}`;
      })
      .join(" ");

    return `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">
        <rect width="${width}" height="${height}" rx="18" fill="#ffffff"></rect>
        <text x="40" y="38" fill="#111827" font-size="22" font-family="Arial" font-weight="700">${escapeHtml(title || "Chart")}</text>
        <line x1="80" y1="70" x2="80" y2="260" stroke="#d1d5db" stroke-width="2"></line>
        <line x1="80" y1="260" x2="570" y2="260" stroke="#d1d5db" stroke-width="2"></line>
        <polyline fill="none" stroke="#2563eb" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" points="${points}"></polyline>
        ${safeValues
          .map((value, index) => {
            const x = 90 + index * ((width - 150) / Math.max(1, safeValues.length - 1));
            const y = 250 - (value / max) * 140;
            return `<circle cx="${x}" cy="${y}" r="5" fill="#2563eb"></circle>
              <text x="${x}" y="282" text-anchor="middle" fill="#6b7280" font-size="12" font-family="Arial">${escapeHtml(safeLabels[index] || "")}</text>`;
          })
          .join("")}
      </svg>`;
  }

  const barWidth = Math.max(38, 360 / safeValues.length);
  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">
      <rect width="${width}" height="${height}" rx="18" fill="#ffffff"></rect>
      <text x="40" y="38" fill="#111827" font-size="22" font-family="Arial" font-weight="700">${escapeHtml(title || "Chart")}</text>
      <line x1="80" y1="70" x2="80" y2="260" stroke="#d1d5db" stroke-width="2"></line>
      <line x1="80" y1="260" x2="570" y2="260" stroke="#d1d5db" stroke-width="2"></line>
      ${safeValues
        .map((value, index) => {
          const x = 100 + index * (barWidth + 24);
          const barHeight = (value / max) * 140;
          const y = 260 - barHeight;
          return `<rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" rx="10" fill="${chartColor(index)}"></rect>
            <text x="${x + barWidth / 2}" y="282" text-anchor="middle" fill="#6b7280" font-size="12" font-family="Arial">${escapeHtml(safeLabels[index] || "")}</text>`;
        })
        .join("")}
    </svg>`;
}

function insertChartBlock(config = {}) {
  if (config.src) {
    insertBlockHtml(
      mediaFigureMarkup({
        className: "gd-chart-block",
        src: config.src,
        alt: config.alt || `OrionAI chart: ${config.title || "Chart"}`,
        width: config.width || 640,
        height: config.height || 360,
        caption: config.caption || config.title || "Chart",
      })
    );
    return;
  }

  const svg = buildChartSvg(config);
  insertBlockHtml(
    `<figure class="gd-chart-block" contenteditable="false" draggable="true" style="width:640px;max-width:100%;margin:0 auto 18px;">
      ${svg}
      <figcaption>${escapeHtml(config.title || "Chart")}</figcaption>
    </figure><p><br /></p>`
  );
}

function execCommand(command, value = null) {
  const editor = editorRef.value;
  if (!editor || props.disabled || typeof document.execCommand !== "function") return;

  if (savedSelectionRange && isRangeInsideEditor(savedSelectionRange)) {
    setSelectionRange(savedSelectionRange);
  } else {
    focusEditor();
  }
  document.execCommand("styleWithCSS", false, true);

  if (command === "undo") {
    undoHistory();
    return;
  }

  if (command === "redo") {
    redoHistory();
    return;
  }

  // Capture history snapshot BEFORE formatting
  captureHistorySnapshot();

  if (command === "fontSize") {
    applyFontSize(value);
    handleInput();
    captureHistorySnapshot();
    emitSelectionContext();
    return;
  }

  if (command === "fontName") {
    applyFontFamily(value);
    handleInput();
    captureHistorySnapshot();
    emitSelectionContext();
    return;
  }

  if (command === "formatBlock") {
    applyFormatBlock(value);
    captureHistorySnapshot();
    emitSelectionContext();
    return;
  }

  if (command === "applyNamedStyle") {
    applyNamedStyle(value);
    captureHistorySnapshot();
    emitSelectionContext();
    return;
  }

  if (command === "applyListStyle") {
    applyListStyle(value);
    captureHistorySnapshot();
    return;
  }

  if (command === "insertTable") {
    const rows = Number(value?.rows || 3);
    const columns = Number(value?.columns || 3);
    insertBlockHtml(buildBlankTable(rows, columns));
    captureHistorySnapshot();
    return;
  }

  if (command === "insertImageBlock") {
    insertImageBlock(value || {});
    captureHistorySnapshot();
    return;
  }

  if (command === "insertChartBlock") {
    insertChartBlock(value || {});
    captureHistorySnapshot();
    return;
  }

  if (value != null) {
    document.execCommand(command, false, value);
  } else {
    document.execCommand(command, false);
  }

  captureHistorySnapshot();
  emitSelectionContext();
}

function scrollToOutline(id) {
  const safeId = String(id || "").replace(/"/g, '\\"');
  const target = editorRef.value?.querySelector(`[id="${safeId}"]`);
  target?.scrollIntoView({ behavior: "smooth", block: "center" });
}

function handleDocumentSelectionChange() {
  const editor = editorRef.value;
  const selection = window.getSelection();
  if (!editor || !selection?.anchorNode) return;
  if (!editor.contains(selection.anchorNode)) return;
  if (selection.rangeCount) {
    savedSelectionRange = selection.getRangeAt(0).cloneRange();
  }
  emitSelectionContext();
}

function captureSelection() {
  const range = currentSelectionRange();
  if (range) {
    savedSelectionRange = range.cloneRange();
    return true;
  }

  if (savedSelectionRange && isRangeInsideEditor(savedSelectionRange)) {
    return true;
  }

  return false;
}

function handleShellScroll() {
  emitMetrics();
  updateSelectedMediaOverlay();
  updateSelectedTableOverlay();
}

function handlePointerSelection() {
  emitSelectionContext();
  updateSelectedMediaOverlay();
  updateSelectedTableOverlay();
}

function handleEditorClick(event) {
  const media = event.target.closest(".gd-image-block,.gd-chart-block");
  if (media && editorRef.value?.contains(media)) {
    selectMediaElement(
      media,
      media.classList.contains("gd-chart-block") ? "chart" : "image"
    );
    return;
  }

  const cell = event.target.closest("td,th");
  const table = event.target.closest("table");
  if (table && editorRef.value?.contains(table)) {
    selectTableElement(table, cell);
    return;
  }

  clearSelections();
  closeFloatingMenu();
}

function handleContextMenu(event) {
  const media = event.target.closest(".gd-image-block,.gd-chart-block");
  if (media && editorRef.value?.contains(media)) {
    event.preventDefault();
    selectMediaElement(
      media,
      media.classList.contains("gd-chart-block") ? "chart" : "image"
    );
    openFloatingMenu("media", event.clientY, event.clientX);
    return;
  }

  const cell = event.target.closest("td,th");
  const table = event.target.closest("table");
  if (table && editorRef.value?.contains(table)) {
    event.preventDefault();
    selectTableElement(table, cell);
    openFloatingMenu("table", event.clientY, event.clientX);
  }
}

function removeSelectedMedia() {
  const element = selectedMedia.value?.element;
  if (!element) return;
  closeFloatingMenu();
  const nextFocus = element.nextElementSibling || element.previousElementSibling;
  element.remove();
  if (nextFocus) {
    const range = document.createRange();
    range.selectNodeContents(nextFocus);
    range.collapse(false);
    setSelectionRange(range);
  }
  clearSelectedMedia();
  handleInput();
}

function getMediaImageElement(element) {
  if (!element) return null;
  if (element.tagName === "IMG") return element;
  return element.querySelector("img");
}

function updateMediaDimensions(element, width, height) {
  if (!element) return;
  const safeWidth = Math.max(140, Math.round(Number(width) || 140));
  const safeHeight = Math.max(84, Math.round(Number(height) || 84));

  element.style.width = `${safeWidth}px`;
  element.style.maxWidth = "100%";

  const image = getMediaImageElement(element);
  if (image) {
    image.width = safeWidth;
    image.height = safeHeight;
    image.style.width = `${safeWidth}px`;
    image.style.height = `${safeHeight}px`;
    image.style.maxWidth = "100%";
    image.style.display = "block";
  }
}

function startResize(event) {
  const element = selectedMedia.value?.element;
  if (!element) return;

  const rect = element.getBoundingClientRect();
  const image = getMediaImageElement(element);
  const imageRect = image?.getBoundingClientRect() || rect;
  resizeState = {
    element,
    startX: event.clientX,
    startWidth: imageRect.width || rect.width,
    startHeight: imageRect.height || rect.height,
    aspectRatio: (imageRect.height || rect.height) / Math.max(1, imageRect.width || rect.width),
  };

  document.addEventListener("mousemove", handleResizeMove);
  document.addEventListener("mouseup", stopResize);
}

function handleResizeMove(event) {
  if (!resizeState) return;
  const deltaX = event.clientX - resizeState.startX;
  const nextWidth = Math.max(140, resizeState.startWidth + deltaX);
  const nextHeight = Math.max(
    84,
    resizeState.startHeight
      ? resizeState.startHeight + deltaX * resizeState.aspectRatio
      : nextWidth * resizeState.aspectRatio
  );
  updateMediaDimensions(resizeState.element, nextWidth, nextHeight);
  updateSelectedMediaOverlay();
}

function stopResize() {
  if (!resizeState) return;
  resizeState = null;
  document.removeEventListener("mousemove", handleResizeMove);
  document.removeEventListener("mouseup", stopResize);
  handleInput();
}

function handleDragStart(event) {
  const block = event.target.closest(".gd-image-block,.gd-chart-block");
  if (!block || !editorRef.value?.contains(block)) return;
  draggedBlock = block;
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", "orion-doc-block");
}

function handleDragOver(event) {
  if (!draggedBlock || !editorRef.value?.contains(event.target)) return;
  event.preventDefault();
}

function handleDrop(event) {
  if (!draggedBlock || !editorRef.value) return;
  event.preventDefault();

  const editor = editorRef.value;
  const targetBlock = topLevelChildForNode(event.target);
  if (!targetBlock || targetBlock === draggedBlock) {
    editor.appendChild(draggedBlock);
  } else {
    const rect = targetBlock.getBoundingClientRect();
    if (event.clientY < rect.top + rect.height / 2) {
      editor.insertBefore(draggedBlock, targetBlock);
    } else {
      editor.insertBefore(draggedBlock, targetBlock.nextSibling);
    }
  }

  selectMediaElement(
    draggedBlock,
    draggedBlock.classList.contains("gd-chart-block") ? "chart" : "image"
  );
  draggedBlock = null;
  handleInput();
}

function handleDragEnd() {
  draggedBlock = null;
}

function findCurrentCell() {
  const selection = window.getSelection();
  const editor = editorRef.value;
  if (!selection?.anchorNode || !editor) return selectedTable.value?.activeCell || null;

  let node =
    selection.anchorNode.nodeType === Node.ELEMENT_NODE
      ? selection.anchorNode
      : selection.anchorNode.parentElement;

  while (node && node !== editor) {
    if (node.tagName === "TD" || node.tagName === "TH") return node;
    node = node.parentElement;
  }

  return selectedTable.value?.activeCell || null;
}

function withSelectedTable(callback) {
  const table = selectedTable.value?.element;
  if (!table) return;
  const cell = findCurrentCell();
  callback(table, cell);
  if (!table.isConnected) {
    clearSelectedTable();
    closeFloatingMenu();
    handleInput();
    return;
  }
  closeFloatingMenu();
  selectTableElement(table, cell);
  handleInput();
}

function insertTableRow(position = "below") {
  withSelectedTable((table, cell) => {
    const referenceRow = cell?.closest("tr") || table.querySelector("tr");
    if (!referenceRow) return;
    const row = document.createElement("tr");
    const columnCount = referenceRow.children.length || 1;
    for (let index = 0; index < columnCount; index += 1) {
      const td = document.createElement("td");
      td.innerHTML = "<p><br /></p>";
      row.appendChild(td);
    }
    referenceRow.parentElement.insertBefore(
      row,
      position === "above" ? referenceRow : referenceRow.nextSibling
    );
  });
}

function insertTableColumn(position = "right") {
  withSelectedTable((table, cell) => {
    const index = cell?.cellIndex ?? 0;
    Array.from(table.rows).forEach((row) => {
      const td = document.createElement("td");
      td.innerHTML = "<p><br /></p>";
      const referenceCell = row.cells[index] || null;
      row.insertBefore(td, position === "left" ? referenceCell : referenceCell?.nextSibling || null);
    });
  });
}

function deleteTableRow() {
  withSelectedTable((table, cell) => {
    const row = cell?.closest("tr");
    if (!row) return;
    if (table.rows.length <= 1) {
      table.remove();
      clearSelectedTable();
      return;
    }
    row.remove();
  });
}

function deleteTableColumn() {
  withSelectedTable((table, cell) => {
    const index = cell?.cellIndex ?? 0;
    const firstRow = table.rows[0];
    if (!firstRow) return;
    if (firstRow.cells.length <= 1) {
      table.remove();
      clearSelectedTable();
      return;
    }
    Array.from(table.rows).forEach((row) => {
      row.deleteCell(Math.min(index, row.cells.length - 1));
    });
  });
}

function deleteTable() {
  const table = selectedTable.value?.element;
  if (!table) return;
  table.remove();
  clearSelectedTable();
  closeFloatingMenu();
  handleInput();
}

function runTableAction(action) {
  const actions = {
    insertRowAbove: () => insertTableRow("above"),
    insertRowBelow: () => insertTableRow("below"),
    insertColumnLeft: () => insertTableColumn("left"),
    insertColumnRight: () => insertTableColumn("right"),
    deleteRow: deleteTableRow,
    deleteColumn: deleteTableColumn,
    deleteTable,
  };
  actions[action]?.();
}

function toggleTableMenu() {
  if (!selectedTable.value) return;

  if (floatingMenu.value.visible && floatingMenu.value.type === "table") {
    closeFloatingMenu();
    return;
  }

  openFloatingMenu(
    "table",
    selectedTable.value.cornerTop + 28,
    selectedTable.value.cornerLeft + 6
  );
}

function handleKeydown(event) {
  if (event.key === "Escape") {
    closeFloatingMenu();
    return;
  }

  if ((event.key === "Backspace" || event.key === "Delete") && selectedMedia.value?.element) {
    event.preventDefault();
    removeSelectedMedia();
    return;
  }

  const isMac = typeof navigator !== "undefined" && /Mac|iPod|iPhone|iPad/.test(navigator.userAgent);
  const isMeta = isMac ? event.metaKey : event.ctrlKey;

  if (isMeta && event.key.toLowerCase() === "z") {
    event.preventDefault();
    if (event.shiftKey) {
      redoHistory();
    } else {
      undoHistory();
    }
    return;
  }

  if (isMeta && event.key.toLowerCase() === "y") {
    event.preventDefault();
    redoHistory();
    return;
  }
}

function handleGlobalPointerDown(event) {
  if (
    floatingMenu.value.visible &&
    !event.target.closest(".gd-editor-menu") &&
    !event.target.closest(".gd-table-corner")
  ) {
    closeFloatingMenu();
  }
}

function sleep(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function markdownToHtml(text = "") {
  return sanitizeHtml(
    marked.parse(String(text || ""), {
      gfm: true,
      breaks: true,
    })
  );
}

function createTopLevelNodesFromHtml(html = "") {
  if (typeof window === "undefined") return [];

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  return Array.from(doc.body.childNodes)
    .map((node) => {
      if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) {
        const paragraph = doc.createElement("p");
        paragraph.textContent = node.textContent.trim();
        return paragraph;
      }
      return node;
    })
    .filter((node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        return Boolean(node.textContent?.trim());
      }
      return node.nodeType === Node.ELEMENT_NODE;
    });
}

function copyAllowedAttributes(source, target) {
  Array.from(source.attributes || []).forEach((attribute) => {
    const name = attribute.name.toLowerCase();
    if (["href", "target", "rel", "style", "class", "src", "alt", "colspan", "rowspan"].includes(name)) {
      target.setAttribute(attribute.name, attribute.value);
    }
  });

  if (source.classList?.contains("gd-image-block") || source.classList?.contains("gd-chart-block")) {
    target.setAttribute("contenteditable", "false");
    target.setAttribute("draggable", "true");
  }
}

function buildStreamSkeleton(node) {
  if (node.nodeType === Node.TEXT_NODE) {
    return document.createTextNode("");
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return document.createTextNode("");
  }

  if (
    node.tagName === "SVG" ||
    node.closest?.("svg") ||
    node.tagName === "IMG" ||
    node.classList?.contains("gd-image-block") ||
    node.classList?.contains("gd-chart-block")
  ) {
    return node.cloneNode(true);
  }

  const clone = document.createElement(node.tagName.toLowerCase());
  copyAllowedAttributes(node, clone);
  Array.from(node.childNodes).forEach((child) => {
    clone.appendChild(buildStreamSkeleton(child));
  });
  return clone;
}

async function typeIntoTextNode(node, text) {
  const tokens = String(text || "").split(/(\s+)/).filter(Boolean);
  for (const token of tokens) {
    if (streamCancelled) break;
    node.textContent += token;
    handleInput();
    node.parentElement?.scrollIntoView({ block: "nearest" });
    await sleep(18);
  }
}

async function streamNodeContent(source, target) {
  if (!source || !target || streamCancelled) return target;

  if (source.nodeType === Node.TEXT_NODE) {
    await typeIntoTextNode(target, source.textContent || "");
    return target;
  }

  if (source.nodeType !== Node.ELEMENT_NODE) return target;

  if (
    source.tagName === "SVG" ||
    source.closest?.("svg") ||
    source.tagName === "IMG" ||
    source.classList?.contains("gd-image-block") ||
    source.classList?.contains("gd-chart-block")
  ) {
    await sleep(48);
    handleInput();
    return target;
  }

  if (!INLINE_STREAM_TAGS.has(source.tagName)) {
    const replacement = source.cloneNode(true);
    target.replaceWith(replacement);
    handleInput();
    return replacement;
  }

  const sourceChildren = Array.from(source.childNodes);
  const targetChildren = Array.from(target.childNodes);
  for (let index = 0; index < sourceChildren.length; index += 1) {
    await streamNodeContent(sourceChildren[index], targetChildren[index]);
  }
  return target;
}

function currentInsertionRange() {
  const activeRange = currentSelectionRange();
  if (activeRange) {
    savedSelectionRange = activeRange.cloneRange();
    return activeRange.cloneRange();
  }

  if (savedSelectionRange && isRangeInsideEditor(savedSelectionRange)) {
    return savedSelectionRange.cloneRange();
  }

  const editor = editorRef.value;
  if (!editor) return null;
  const plainText = editor.textContent?.replace(/\u200b/g, "").trim() || "";
  if (!plainText) {
    return createRangeAtDocumentStart();
  }

  return createRangeAtDocumentEnd();
}

async function streamInsertContent(text = "") {
  const html = markdownToHtml(text);
  const blocks = createTopLevelNodesFromHtml(html);
  if (!blocks.length || props.disabled) return;

  streamCancelled = false;
  let range = currentInsertionRange();
  if (!range) return;
  focusEditor();
  setSelectionRange(range);

  const editor = editorRef.value;
  const shouldResetBlankDocument =
    editor &&
    !editor.textContent?.replace(/\u200b/g, "").trim() &&
    Boolean(editor.innerHTML?.match(/^<p><br><\/p>$|^<p><br\s*\/?><\/p>$/i));

  if (shouldResetBlankDocument) {
    editor.innerHTML = "";
    range = createRangeAtDocumentStart();
  } else {
    range.deleteContents();
  }
  if (!range) return;

  const marker = document.createElement("span");
  marker.setAttribute("data-gd-stream-marker", "true");
  marker.style.display = "inline-block";
  marker.style.width = "0";
  marker.style.height = "0";
  range.insertNode(marker);
  let anchor = marker;

  for (const block of blocks) {
    if (streamCancelled) break;

    const targetNode = buildStreamSkeleton(block);
    const insertionAnchor =
      anchor?.isConnected ? anchor : marker?.isConnected ? marker : editor?.lastChild || null;
    const insertionParent = insertionAnchor?.parentNode || editor;
    if (!insertionParent) break;
    if (insertionAnchor?.parentNode === insertionParent) {
      insertionParent.insertBefore(targetNode, insertionAnchor.nextSibling);
    } else {
      insertionParent.appendChild(targetNode);
    }

    const afterBlockRange = document.createRange();
    afterBlockRange.setStartAfter(targetNode);
    afterBlockRange.collapse(true);
    setSelectionRange(afterBlockRange);
    anchor = (await streamNodeContent(block, targetNode)) || targetNode;
  }

  if (!streamCancelled && anchor?.parentNode) {
    const paragraph = document.createElement("p");
    paragraph.innerHTML = "<br />";
    anchor.parentNode.insertBefore(paragraph, anchor.nextSibling);
    const endRange = document.createRange();
    endRange.selectNodeContents(paragraph);
    endRange.collapse(true);
    setSelectionRange(endRange);
  }

  marker.remove();
  handleInput();
  emitSelectionContext();
}

function cancelActiveStream() {
  streamCancelled = true;
}

watch(
  () => props.modelValue,
  (value) => {
    syncFromProps(value);
  },
  { immediate: true }
);

watch(
  () => props.documentId,
  () => {
    flushHistoryCapture();
    clearSelections();
    closeFloatingMenu();
    savedSelectionRange = null;
    nextTick(() => {
      syncFromProps(props.modelValue);
    });
  }
);

watch(
  () => props.zoom,
  () => {
    nextTick(() => {
      emitMetrics();
      updateSelectedMediaOverlay();
      updateSelectedTableOverlay();
    });
  }
);

onMounted(() => {
  document.addEventListener("selectionchange", handleDocumentSelectionChange);
  document.addEventListener("keydown", handleKeydown);
  document.addEventListener("pointerdown", handleGlobalPointerDown);
  window.addEventListener("resize", updateSelectedMediaOverlay);
  window.addEventListener("resize", updateSelectedTableOverlay);
  syncFromProps(props.modelValue);
  emitOutline();
  nextTick(() => {
    emitMetrics();
  });
});

onBeforeUnmount(() => {
  document.removeEventListener("selectionchange", handleDocumentSelectionChange);
  document.removeEventListener("keydown", handleKeydown);
  document.removeEventListener("pointerdown", handleGlobalPointerDown);
  window.removeEventListener("resize", updateSelectedMediaOverlay);
  window.removeEventListener("resize", updateSelectedTableOverlay);
  flushHistoryCapture();
  stopResize();
  cancelActiveStream();
});

defineExpose({
  execCommand,
  scrollToOutline,
  focusEditor,
  captureSelection,
  insertHtml,
  insertImageBlock,
  insertChartBlock,
  streamInsertContent,
  cancelActiveStream,
});
</script>

<style scoped>
.gd-editor-shell {
  height: 100%;
  min-height: 0;
  overflow: auto;
  padding: 8px 0 20px;
  box-sizing: border-box;
}

.gd-editor-page {
  width: 100%;
  max-width: 816px;
  min-height: 1122px;
  margin: 0 auto;
  padding: 68px 78px 72px;
  border-radius: 2px;
  background: #ffffff;
  border: 1px solid rgba(15, 23, 42, 0.08);
  box-shadow:
    0 18px 42px rgba(2, 8, 24, 0.12),
    0 2px 8px rgba(2, 8, 24, 0.06);
  transform-origin: top center;
  position: relative;
}

.gd-page-break {
  position: absolute;
  left: 0;
  right: 0;
  height: 1px;
  border-top: 2px dashed #dadce0;
  z-index: 5;
  pointer-events: none;
  user-select: none;
  display: flex;
  align-items: center;
  justify-content: flex-end;
}

.gd-page-break-text {
  font-size: 10px;
  color: #70757a;
  background: #ffffff;
  padding: 2px 8px;
  margin-top: -8px;
  margin-right: 24px;
  font-family: Arial, sans-serif;
  border: 1px solid #dadce0;
  border-radius: 4px;
  font-weight: 500;
}

.gd-editor {
  min-height: 980px;
  outline: none;
  color: #202124;
  font-size: 11pt;
  line-height: 1.5;
  font-weight: 400;
}

.gd-editor :deep(h1),
.gd-editor :deep(h2),
.gd-editor :deep(h3),
.gd-editor :deep(h4) {
  color: #202124;
  line-height: 1.2;
  letter-spacing: -0.03em;
}

.gd-editor :deep(h1) {
  font-size: 26px;
  margin: 0 0 18px;
  font-weight: 700;
}

.gd-editor :deep(h2) {
  font-size: 18px;
  margin: 24px 0 12px;
  font-weight: 700;
}

.gd-editor :deep(h3) {
  font-size: 15px;
  margin: 20px 0 10px;
  font-weight: 700;
}

.gd-editor :deep(p) {
  margin: 0 0 8px;
  color: #202124;
}

.gd-editor :deep(ul),
.gd-editor :deep(ol) {
  margin: 0 0 10px 22px;
}

.gd-editor :deep(li) {
  margin-bottom: 5px;
}

.gd-editor :deep(table) {
  width: 100%;
  max-width: 100%;
  table-layout: fixed;
  border-collapse: collapse;
  margin: 18px 0;
  border-radius: 12px;
  overflow: hidden;
}

.gd-editor :deep(td),
.gd-editor :deep(th) {
  border: 1px solid #d0d7de;
  padding: 10px 12px;
  vertical-align: top;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.gd-editor :deep(td p),
.gd-editor :deep(th p) {
  margin: 0;
}

.gd-editor :deep(a) {
  color: #1a73e8;
}

.gd-editor :deep(img) {
  max-width: 100%;
  display: block;
}

.gd-editor :deep(hr) {
  border: none;
  border-top: 1px solid #dadce0;
  margin: 22px 0;
}

.gd-editor :deep(.gd-image-block),
.gd-editor :deep(.gd-chart-block) {
  margin: 0 auto 18px;
  cursor: grab;
}

.gd-editor :deep(.gd-chart-block svg) {
  width: 100%;
  height: auto;
  display: block;
}

.gd-editor :deep(.gd-chart-block figcaption) {
  margin-top: 8px;
  color: #6b7280;
  font-size: 12px;
  text-align: center;
}

.gd-editor :deep(.gd-media-selected) {
  outline: 2px solid rgba(37, 99, 235, 0.65);
  outline-offset: 3px;
}

.gd-editor :deep(.gd-table-selected) {
  box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.28);
}

.gd-media-resize-handle,
.gd-table-corner {
  position: fixed;
  z-index: 31;
  width: 16px;
  height: 16px;
  border-radius: var(--radius-sm);
  border: 2px solid white;
  background: #2563eb;
  box-shadow: 0 6px 16px rgba(37, 99, 235, 0.35);
  cursor: nwse-resize;
  color: white;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  line-height: 1;
}

.gd-table-corner {
  cursor: pointer;
}

.gd-editor-menu {
  position: fixed;
  z-index: 32;
  min-width: 170px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-default);
  background: rgba(9, 14, 24, 0.96);
  box-shadow: 0 14px 36px rgba(2, 8, 24, 0.34);
}

.gd-editor-menu button {
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

.gd-editor-menu button:hover {
  background: var(--bg-elevated);
}
</style>
