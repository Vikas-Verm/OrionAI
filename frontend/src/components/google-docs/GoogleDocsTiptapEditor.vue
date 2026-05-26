<template>
  <div ref="shellRef" class="gd-editor-shell" @scroll.passive="handleShellScroll">
    <div ref="pageRef" class="gd-editor-page" :style="{ zoom: zoom / 100 }">
      <!-- Page breaks -->
      <div
        v-for="p in localPageCount - 1"
        :key="p"
        class="gd-page-break"
        :style="{ top: `${p * PAGE_HEIGHT}px` }"
        contenteditable="false"
      >
        <span class="gd-page-break-text">Page {{ p + 1 }}</span>
      </div>

      <editor-content
        v-if="editor"
        :editor="editor"
        class="gd-editor"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onBeforeUnmount, nextTick, computed } from "vue";
import { useEditor, EditorContent } from "@tiptap/vue-3";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import { TextStyle } from "@tiptap/extension-text-style";
import FontFamily from "@tiptap/extension-font-family";
import Color from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import { Table, TableRow, TableCell, TableHeader } from "@tiptap/extension-table";
import Placeholder from "@tiptap/extension-placeholder";
import CharacterCount from "@tiptap/extension-character-count";
import FontSize from "./extensions/FontSize";
import ImageBlock from "./extensions/ImageBlock";
import OrderedListStyled from "./extensions/OrderedListStyled";

const PAGE_HEIGHT = 1122;

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

const shellRef = ref(null);
const pageRef = ref(null);
const localPageCount = ref(1);
let syncingFromProps = false;
let streamInsertTimer = null;

// ── Tiptap editor instance ──────────────────────────────────────

const editor = useEditor({
  content: props.modelValue || "<p><br /></p>",
  editable: !props.disabled,
  extensions: [
    StarterKit.configure({
      orderedList: false, // replaced by OrderedListStyled
      history: { depth: 100 },
    }),
    OrderedListStyled,
    Underline,
    TextAlign.configure({
      types: ["heading", "paragraph"],
    }),
    TextStyle,
    FontFamily,
    FontSize,
    Color,
    Highlight.configure({ multicolor: true }),
    Link.configure({
      openOnClick: false,
      HTMLAttributes: { target: "_blank", rel: "noopener noreferrer" },
    }),
    Image,
    ImageBlock,
    Table.configure({ resizable: true }),
    TableRow,
    TableCell,
    TableHeader,
    Placeholder.configure({
      placeholder: "Start typing...",
    }),
    CharacterCount,
  ],

  onUpdate({ editor: ed }) {
    if (syncingFromProps) return;
    const html = ed.getHTML();
    emit("update:modelValue", html);
    emitOutline();
    emitMetrics();
  },

  onSelectionUpdate({ editor: ed }) {
    emitSelectionContext(ed);
  },

  onCreate({ editor: ed }) {
    nextTick(() => {
      emitOutline();
      emitMetrics();
      emitSelectionContext(ed);
    });
  },
});

// ── Prop watchers ───────────────────────────────────────────────

watch(
  () => props.modelValue,
  (value) => {
    if (!editor.value) return;
    const current = editor.value.getHTML();
    const next = value || "<p><br /></p>";
    // Avoid re-setting content when the change came from us
    if (current === next) return;
    syncingFromProps = true;
    editor.value.commands.setContent(next, false);
    nextTick(() => {
      syncingFromProps = false;
      emitOutline();
      emitMetrics();
    });
  }
);

watch(
  () => props.documentId,
  () => {
    if (!editor.value) return;
    syncingFromProps = true;
    editor.value.commands.setContent(props.modelValue || "<p><br /></p>", false);
    nextTick(() => {
      syncingFromProps = false;
      emitOutline();
      emitMetrics();
    });
  }
);

watch(
  () => props.disabled,
  (val) => {
    if (editor.value) {
      editor.value.setEditable(!val);
    }
  }
);

watch(
  () => props.zoom,
  () => {
    nextTick(() => emitMetrics());
  }
);

// ── Emitters ────────────────────────────────────────────────────

function emitSelectionContext(ed) {
  const e = ed || editor.value;
  if (!e) return;

  const { state } = e;
  const { from, to } = state.selection;
  const selectionText = state.doc.textBetween(from, to, " ").trim();

  // Current section text: find the nearest heading before the cursor and grab text until the next heading
  let currentSectionText = "";
  const resolvedPos = state.doc.resolve(from);
  const docContent = state.doc;
  let startOfSection = 0;
  let endOfSection = docContent.content.size;

  docContent.descendants((node, pos) => {
    if (node.type.name === "heading" && pos + node.nodeSize <= from) {
      startOfSection = pos;
    }
    if (node.type.name === "heading" && pos > from && endOfSection === docContent.content.size) {
      endOfSection = pos;
    }
  });

  currentSectionText = docContent.textBetween(startOfSection, Math.min(endOfSection, docContent.content.size), "\n").trim();

  // Active formatting state
  const attrs = e.getAttributes("textStyle");
  const fontSize = attrs.fontSize || "";
  const fontFamily = attrs.fontFamily || "";
  const bold = e.isActive("bold");
  const italic = e.isActive("italic");
  const underline = e.isActive("underline");

  let align = "left";
  const pAttrs = e.getAttributes("paragraph");
  const hAttrs = e.getAttributes("heading");
  align = pAttrs.textAlign || hAttrs.textAlign || "left";

  let style = "P";
  if (e.isActive("heading", { level: 1 })) style = "H1";
  else if (e.isActive("heading", { level: 2 })) style = "H2";
  else if (e.isActive("heading", { level: 3 })) style = "H3";
  else if (e.isActive("heading", { level: 4 })) style = "H4";
  else if (e.isActive("heading", { level: 5 })) style = "H5";
  else if (e.isActive("heading", { level: 6 })) style = "H6";

  emit("selection-change", {
    selectionText,
    currentSectionText: currentSectionText.slice(0, 8000),
    fontFamily,
    fontSize,
    bold,
    italic,
    underline,
    align,
    style,
  });
}

function emitOutline() {
  if (!editor.value) return;
  const outline = [];
  let counter = 1;

  editor.value.state.doc.descendants((node) => {
    if (node.type.name === "heading") {
      const text = node.textContent.trim();
      if (text) {
        const level = node.attrs.level || 1;
        const id = `${slugify(text)}-${counter++}`;
        outline.push({ id, title: text, level });
      }
    }
  });

  emit("outline-change", outline);
}

function emitMetrics() {
  if (!editor.value) return;
  const editorDom = editor.value.view.dom;
  const shell = shellRef.value;
  const scale = props.zoom / 100 || 1;

  const pageCount = Math.max(1, Math.ceil(editorDom.scrollHeight / PAGE_HEIGHT));
  localPageCount.value = pageCount;

  const currentPage = shell
    ? Math.min(
        pageCount,
        Math.max(
          1,
          Math.floor(
            (shell.scrollTop + shell.clientHeight * 0.35) /
              (PAGE_HEIGHT * scale)
          ) + 1
        )
      )
    : 1;

  emit("metrics-change", { pageCount, currentPage });
}

function handleShellScroll() {
  emitMetrics();
}

// ── Helpers ─────────────────────────────────────────────────────

function slugify(value = "") {
  return (
    String(value)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "section"
  );
}

// ── Exposed API — matches old editor interface ──────────────────

function focusEditor() {
  editor.value?.commands.focus();
}

function captureSelection() {
  return !!editor.value;
}

function scrollToOutline(id) {
  const dom = editor.value?.view.dom;
  if (!dom) return;
  const target = dom.querySelector(`[id="${id}"]`);
  if (!target) {
    // Try to find a heading with matching text
    const headings = dom.querySelectorAll("h1,h2,h3,h4,h5,h6");
    for (const h of headings) {
      const slug = slugify(h.textContent);
      if (id.startsWith(slug)) {
        h.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
    }
    return;
  }
  target.scrollIntoView({ behavior: "smooth", block: "center" });
}

function execCommand(command, value = null) {
  const ed = editor.value;
  if (!ed || props.disabled) return;

  const commandMap = {
    bold: () => ed.chain().focus().toggleBold().run(),
    italic: () => ed.chain().focus().toggleItalic().run(),
    underline: () => ed.chain().focus().toggleUnderline().run(),
    strikeThrough: () => ed.chain().focus().toggleStrike().run(),

    fontSize: () => ed.chain().focus().setFontSize(value).run(),
    fontName: () => {
      const primary = String(value || "Inter")
        .split(",")[0]
        .trim()
        .replace(/^['"]|['"]$/g, "");
      return ed.chain().focus().setFontFamily(primary).run();
    },

    foreColor: () => ed.chain().focus().setColor(value).run(),
    hiliteColor: () =>
      ed.chain().focus().toggleHighlight({ color: value }).run(),

    justifyLeft: () => ed.chain().focus().setTextAlign("left").run(),
    justifyCenter: () => ed.chain().focus().setTextAlign("center").run(),
    justifyRight: () => ed.chain().focus().setTextAlign("right").run(),
    justifyFull: () => ed.chain().focus().setTextAlign("justify").run(),

    applyNamedStyle: () => {
      const tag = String(value || "P").toUpperCase();
      if (tag === "P" || tag === "NORMAL_TEXT") {
        return ed.chain().focus().setParagraph().run();
      }
      const level = Number(tag.replace("H", "")) || 1;
      return ed.chain().focus().toggleHeading({ level }).run();
    },

    formatBlock: () => {
      const tag = String(value || "p").toLowerCase();
      if (tag === "p") {
        return ed.chain().focus().setParagraph().run();
      }
      const level = Number(tag.replace("h", "")) || 1;
      return ed.chain().focus().toggleHeading({ level }).run();
    },

    applyListStyle: () => {
      const ordered = ["decimal", "upper-alpha", "lower-alpha", "upper-roman", "lower-roman"].includes(value);
      if (ordered) {
        ed.chain().focus().toggleOrderedList().run();
        // Set list style type after toggling
        nextTick(() => {
          if (ed.isActive("orderedList")) {
            ed.commands.setOrderedListStyle(value);
          }
        });
      } else {
        ed.chain().focus().toggleBulletList().run();
      }
    },

    indent: () => ed.chain().focus().sinkListItem("listItem").run(),
    outdent: () => ed.chain().focus().liftListItem("listItem").run(),

    insertTable: () => {
      const rows = Number(value?.rows || 3);
      const cols = Number(value?.columns || 3);
      ed.chain().focus().insertTable({ rows, cols, withHeaderRow: false }).run();
    },

    insertImageBlock: () => {
      if (value?.src) {
        ed.chain().focus().insertImageBlock({
          src: value.src,
          alt: value.alt || "Document image",
          width: value.width || null,
          height: value.height || null,
        }).run();
      }
    },

    insertChartBlock: () => {
      if (value?.src) {
        ed.chain().focus().insertImageBlock({
          src: value.src,
          alt: value.alt || "Chart",
          width: value.width || null,
          height: value.height || null,
          isChart: true,
        }).run();
      }
    },

    createLink: () => {
      if (value) {
        ed.chain().focus().setLink({ href: value }).run();
      } else {
        ed.chain().focus().unsetLink().run();
      }
    },

    removeFormat: () =>
      ed.chain().focus().unsetAllMarks().clearNodes().run(),

    undo: () => ed.chain().focus().undo().run(),
    redo: () => ed.chain().focus().redo().run(),

    selectAll: () => ed.chain().focus().selectAll().run(),

    // Table operations
    addColumnBefore: () => ed.chain().focus().addColumnBefore().run(),
    addColumnAfter: () => ed.chain().focus().addColumnAfter().run(),
    addRowBefore: () => ed.chain().focus().addRowBefore().run(),
    addRowAfter: () => ed.chain().focus().addRowAfter().run(),
    deleteColumn: () => ed.chain().focus().deleteColumn().run(),
    deleteRow: () => ed.chain().focus().deleteRow().run(),
    deleteTable: () => ed.chain().focus().deleteTable().run(),
    mergeCells: () => ed.chain().focus().mergeCells().run(),
    splitCell: () => ed.chain().focus().splitCell().run(),
    toggleHeaderRow: () => ed.chain().focus().toggleHeaderRow().run(),
  };

  const handler = commandMap[command];
  if (handler) {
    handler();
  } else {
    console.warn(`Tiptap editor: unknown command "${command}"`);
  }
}

function insertHtml(html) {
  if (!editor.value || props.disabled) return;
  editor.value.chain().focus().insertContent(html).run();
}

function insertImageBlock(config) {
  execCommand("insertImageBlock", config);
}

function insertChartBlock(config) {
  execCommand("insertChartBlock", config);
}

async function streamInsertContent(text) {
  if (!editor.value || props.disabled || !text) return;

  // Convert markdown to simple HTML paragraphs
  const lines = String(text).split("\n").filter(Boolean);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Simple markdown heading detection
    let html;
    if (line.startsWith("### ")) {
      html = `<h3>${line.slice(4)}</h3>`;
    } else if (line.startsWith("## ")) {
      html = `<h2>${line.slice(3)}</h2>`;
    } else if (line.startsWith("# ")) {
      html = `<h1>${line.slice(2)}</h1>`;
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      html = `<ul><li>${line.slice(2)}</li></ul>`;
    } else {
      html = `<p>${line}</p>`;
    }

    editor.value.chain().focus("end").insertContent(html).run();

    // Small delay for visual streaming effect
    if (i < lines.length - 1) {
      await new Promise((resolve) => {
        streamInsertTimer = setTimeout(resolve, 20);
      });
    }
  }
}

function cancelActiveStream() {
  if (streamInsertTimer) {
    clearTimeout(streamInsertTimer);
    streamInsertTimer = null;
  }
}

function getEditorHtml() {
  return editor.value?.getHTML() || "";
}

// ── Cleanup ─────────────────────────────────────────────────────

onBeforeUnmount(() => {
  cancelActiveStream();
});

// ── Expose for parent component ─────────────────────────────────

defineExpose({
  focusEditor,
  captureSelection,
  scrollToOutline,
  execCommand,
  insertHtml,
  insertImageBlock,
  insertChartBlock,
  streamInsertContent,
  cancelActiveStream,
  getEditorHtml,
});
</script>

<style scoped>
.gd-editor-shell {
  flex: 1;
  overflow: auto;
  padding: 28px 14px 60px;
  background: #e8eaed;
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

/* ProseMirror focused state */
.gd-editor :deep(.ProseMirror) {
  outline: none;
  min-height: 980px;
}

.gd-editor :deep(.ProseMirror p.is-editor-empty:first-child::before) {
  content: attr(data-placeholder);
  color: #adb5bd;
  pointer-events: none;
  float: left;
  height: 0;
}

/* Headings */
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

/* Lists */
.gd-editor :deep(ul),
.gd-editor :deep(ol) {
  margin: 0 0 10px 22px;
}

.gd-editor :deep(li) {
  margin-bottom: 5px;
}

/* Tables */
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

/* Links */
.gd-editor :deep(a) {
  color: #1a73e8;
  text-decoration: underline;
  cursor: pointer;
}

/* Horizontal rule */
.gd-editor :deep(hr) {
  border: none;
  border-top: 1px solid #dadce0;
  margin: 18px 0;
}

/* Image blocks */
.gd-editor :deep(.gd-image-block),
.gd-editor :deep(.gd-chart-block) {
  max-width: 100%;
  margin: 0 auto 18px;
}

.gd-editor :deep(.gd-image-block img),
.gd-editor :deep(.gd-chart-block img) {
  max-width: 100%;
  display: block;
}

/* Table column resize handle */
.gd-editor :deep(.column-resize-handle) {
  position: absolute;
  right: -2px;
  top: 0;
  bottom: -2px;
  width: 4px;
  background-color: #4e7fff;
  pointer-events: auto;
  cursor: col-resize;
}

/* Selected cell */
.gd-editor :deep(.selectedCell::after) {
  z-index: 2;
  position: absolute;
  content: "";
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
  background: rgba(78, 127, 255, 0.1);
  pointer-events: none;
}

/* Gapcursor */
.gd-editor :deep(.ProseMirror-gapcursor) {
  display: none;
  pointer-events: none;
  position: absolute;
}

.gd-editor :deep(.ProseMirror-gapcursor::after) {
  content: "";
  display: block;
  position: absolute;
  top: -2px;
  width: 20px;
  border-top: 1px solid #202124;
  animation: ProseMirror-cursor-blink 1.1s steps(2, start) infinite;
}

@keyframes ProseMirror-cursor-blink {
  to {
    visibility: hidden;
  }
}
</style>
