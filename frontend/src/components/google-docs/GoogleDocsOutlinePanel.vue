<template>
  <aside class="gd-outline" :class="{ 'gd-outline--collapsed': collapsed }">
    <div class="gd-outline-head">
      <div v-if="!collapsed">
        <div class="gd-outline-title">Document tabs</div>
      </div>
      <div class="gd-outline-actions">
        <button
          v-if="!collapsed"
          class="gd-outline-toggle"
          type="button"
          :disabled="loading"
          title="New blank document"
          @click="$emit('create-document')"
        >
          +
        </button>
        <button
          class="gd-outline-toggle"
          type="button"
          :title="collapsed ? 'Open sidebar' : 'Close sidebar'"
          @click="collapsed ? $emit('toggle') : $emit('close-sidebar')"
        >
          {{ collapsed ? '→' : '×' }}
        </button>
      </div>
    </div>

    <template v-if="!collapsed">
      <div class="gd-outline-search">
        <input
          v-model.trim="searchQuery"
          class="gd-outline-search-input"
          type="search"
          placeholder="Search documents..."
        />
      </div>

      <div ref="docsListRef" class="gd-outline-docs">
        <div
          v-for="doc in filteredDocuments"
          :key="doc.documentId"
          class="gd-doc-chip"
          :class="{ active: activeDocumentId === doc.documentId }"
        >
          <button
            class="gd-doc-chip-main"
            type="button"
            @click="$emit('open-document', doc.documentId)"
          >
            <span class="gd-doc-chip-icon">📄</span>
            <span class="gd-doc-chip-title">{{ doc.title }}</span>
          </button>

          <div class="gd-doc-chip-menu-wrap">
            <button
              class="gd-doc-chip-more"
              type="button"
              title="Document actions"
              @click.stop="toggleMenu(doc, $event)"
            >
              ⋮
            </button>
          </div>
        </div>

        <div v-if="!filteredDocuments.length" class="gd-outline-empty gd-outline-empty--docs">
          No documents match your search.
        </div>
      </div>

      <div class="gd-outline-card">
        <button class="gd-outline-card-head" type="button" @click="mainPointsCollapsed = !mainPointsCollapsed">
          <span>Main points</span>
          <span>{{ mainPointsCollapsed ? "▸" : "▾" }}</span>
        </button>

        <div v-if="!mainPointsCollapsed" class="gd-outline-section">
          <button
            v-for="item in outline"
            :key="item.id"
            class="gd-outline-item"
            :style="{ paddingLeft: `${12 + Math.max(0, item.level - 1) * 12}px` }"
            type="button"
            @click="$emit('jump', item.id)"
          >
            {{ item.title }}
          </button>
          <div v-if="!outline.length" class="gd-outline-empty">Main points will appear here once the document loads.</div>
        </div>
      </div>
    </template>

    <teleport to="body">
      <div
        v-if="menuState.document"
        ref="menuRef"
        class="gd-doc-chip-menu"
        :style="{ top: `${menuState.top}px`, left: `${menuState.left}px` }"
      >
        <button
          v-if="menuState.document?.permissions?.canRename"
          type="button"
          @click="emitMenuAction('rename', menuState.document)"
        >
          Rename
        </button>
        <button
          v-if="menuState.document?.permissions?.canShare"
          type="button"
          @click="emitMenuAction('share', menuState.document)"
        >
          Share
        </button>
        <button
          v-if="menuState.document?.permissions?.canDownload !== false"
          type="button"
          @click="emitMenuAction('download', menuState.document)"
        >
          Download
        </button>
        <button
          v-if="menuState.document?.permissions?.canDelete"
          type="button"
          class="gd-doc-chip-menu-danger"
          @click="emitMenuAction('delete', menuState.document)"
        >
          Delete
        </button>
        <button type="button" @click="emitMenuAction('open_in_google', menuState.document)">Open in Google Docs</button>
      </div>
    </teleport>
  </aside>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";

const props = defineProps({
  collapsed: { type: Boolean, default: false },
  documents: { type: Array, default: () => [] },
  activeDocumentId: { type: String, default: "" },
  outline: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
});

const emit = defineEmits([
  "toggle",
  "jump",
  "open-document",
  "create-document",
  "close-sidebar",
  "document-menu-action",
]);

const docsListRef = ref(null);
const menuRef = ref(null);
const searchQuery = ref("");
const mainPointsCollapsed = ref(false);
const menuState = ref({
  document: null,
  top: 0,
  left: 0,
});
let menuAnchorEl = null;

const filteredDocuments = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();
  if (!query) return props.documents;
  return props.documents.filter((doc) =>
    [doc.title, doc.ownerName, doc.ownerEmail]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(query)
  );
});

function closeMenu() {
  menuState.value = {
    document: null,
    top: 0,
    left: 0,
  };
  menuAnchorEl = null;
}

function emitMenuAction(action, document) {
  closeMenu();
  emit("document-menu-action", {
    action,
    document,
  });
}

function updateMenuPosition() {
  if (!menuState.value.document || !menuAnchorEl) return;
  const rect = menuAnchorEl.getBoundingClientRect();
  const menuWidth = menuRef.value?.offsetWidth || 178;
  const viewportWidth = window.innerWidth || 0;
  menuState.value = {
    ...menuState.value,
    top: rect.bottom + 8,
    left: Math.max(12, Math.min(rect.right - menuWidth, viewportWidth - menuWidth - 12)),
  };
}

function toggleMenu(document, event) {
  if (menuState.value.document?.documentId === document.documentId) {
    closeMenu();
    return;
  }

  menuAnchorEl = event.currentTarget;
  menuState.value = {
    document,
    top: 0,
    left: 0,
  };

  nextTick(() => {
    updateMenuPosition();
  });
}

function handleOutsideClick(event) {
  if (
    !event.target.closest(".gd-doc-chip-menu-wrap") &&
    !event.target.closest(".gd-doc-chip-menu")
  ) {
    closeMenu();
  }
}

onMounted(() => {
  document.addEventListener("click", handleOutsideClick);
  window.addEventListener("resize", updateMenuPosition);
  window.addEventListener("scroll", updateMenuPosition, true);
  docsListRef.value?.addEventListener("scroll", updateMenuPosition, { passive: true });
});

onBeforeUnmount(() => {
  document.removeEventListener("click", handleOutsideClick);
  window.removeEventListener("resize", updateMenuPosition);
  window.removeEventListener("scroll", updateMenuPosition, true);
  docsListRef.value?.removeEventListener("scroll", updateMenuPosition);
});

watch(
  () => props.collapsed,
  (collapsed) => {
    if (collapsed) closeMenu();
  }
);

watch(
  () => props.documents.map((doc) => doc.documentId).join("|"),
  () => {
    if (
      menuState.value.document &&
      !props.documents.some((doc) => doc.documentId === menuState.value.document.documentId)
    ) {
      closeMenu();
    }
  }
);
</script>

<style scoped>
.gd-outline {
  width: 196px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px 12px 14px;
  border-radius: 18px;
  background: linear-gradient(180deg, rgba(19, 25, 39, 0.96), rgba(14, 20, 32, 0.96));
  border: 1px solid rgba(176, 201, 255, 0.06);
  min-height: 0;
  min-width: 0;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.02);
}

.gd-outline--collapsed {
  width: 56px;
  padding-inline: 10px;
}

.gd-outline-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.gd-outline-actions {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.gd-outline-title {
  font-size: 13px;
  font-weight: 600;
  color: rgba(244, 248, 255, 0.92);
}

.gd-outline-toggle {
  width: 28px;
  height: 28px;
  border-radius: 10px;
  border: 1px solid rgba(176, 201, 255, 0.08);
  background: rgba(255, 255, 255, 0.04);
  color: var(--text-secondary);
  cursor: pointer;
}

.gd-outline-toggle:disabled {
  opacity: 0.55;
  cursor: default;
}

.gd-outline-docs,
.gd-outline-section {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-height: 0;
}

.gd-outline-docs {
  flex: 1;
  min-height: 120px;
  overflow: auto;
}

.gd-outline-section {
  max-height: 220px;
  overflow: auto;
  padding-top: 4px;
}

.gd-outline-search {
  margin-top: -4px;
}

.gd-outline-search-input {
  width: 100%;
  box-sizing: border-box;
  min-height: 34px;
  border-radius: 12px;
  border: 1px solid rgba(176, 201, 255, 0.08);
  background: rgba(255, 255, 255, 0.04);
  color: rgba(236, 242, 252, 0.86);
  font: inherit;
  font-size: 12px;
  padding: 0 12px;
}

.gd-outline-card {
  border-radius: 14px;
  border: 1px solid rgba(176, 201, 255, 0.06);
  background: rgba(255, 255, 255, 0.02);
  padding: 8px;
}

.gd-outline-card-head {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border: none;
  background: transparent;
  color: rgba(238, 244, 255, 0.9);
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  padding: 2px 2px 4px;
  cursor: pointer;
}

.gd-doc-chip,
.gd-outline-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  text-align: left;
  padding: 8px 10px;
  border-radius: 14px;
  border: 1px solid transparent;
  background: transparent;
  color: rgba(214, 223, 238, 0.8);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  transition: background 0.16s ease, color 0.16s ease, border-color 0.16s ease;
}

.gd-doc-chip:hover,
.gd-outline-item:hover {
  background: rgba(255, 255, 255, 0.04);
  color: var(--text-primary);
}

.gd-doc-chip.active {
  background: linear-gradient(180deg, rgba(51, 90, 190, 0.88), rgba(40, 72, 163, 0.88));
  color: var(--text-primary);
  border-color: rgba(123, 164, 255, 0.18);
}

.gd-doc-chip-main {
  flex: 1;
  min-width: 0;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: none;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  padding: 0;
}

.gd-doc-chip-icon {
  opacity: 0.9;
  font-size: 11px;
}

.gd-doc-chip-title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
}

.gd-doc-chip-menu-wrap {
  position: relative;
}

.gd-doc-chip-more {
  opacity: 0.58;
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
  border-radius: 8px;
  width: 22px;
  height: 22px;
  flex-shrink: 0;
}

.gd-doc-chip-more:hover {
  background: rgba(255, 255, 255, 0.08);
  opacity: 1;
}

.gd-doc-chip-menu {
  position: fixed;
  min-width: 168px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px;
  border-radius: 14px;
  border: 1px solid rgba(176, 201, 255, 0.12);
  background: rgba(9, 14, 24, 0.98);
  box-shadow: 0 14px 36px rgba(2, 8, 24, 0.34);
  z-index: 3;
}

.gd-doc-chip-menu button {
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

.gd-doc-chip-menu button:hover {
  background: rgba(255, 255, 255, 0.06);
}

.gd-doc-chip-menu-danger {
  color: rgba(255, 176, 176, 0.92);
}

.gd-outline-item {
  display: block;
  padding-block: 6px;
  color: rgba(214, 223, 238, 0.74);
  font-size: 11.5px;
}

.gd-outline-empty {
  padding: 8px 10px;
  color: var(--text-faint);
  font-size: 11.5px;
  line-height: 1.5;
}

.gd-outline-empty--docs {
  padding-inline: 2px;
}

@media (max-width: 1320px) {
  .gd-outline,
  .gd-outline--collapsed {
    width: 100%;
  }

  .gd-outline-docs {
    max-height: min(28dvh, 280px);
  }
}

@media (max-width: 640px) {
  .gd-outline {
    padding: 14px 10px 12px;
    border-radius: 16px;
  }

  .gd-outline-head {
    flex-wrap: wrap;
  }

  .gd-outline-actions {
    margin-left: auto;
  }

  .gd-outline-search-input {
    min-height: 40px;
  }
}
</style>
