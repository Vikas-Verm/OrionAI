<template>
  <div class="gd-page">
    <div class="gd-shell">
      <input
        ref="localImageInputRef"
        type="file"
        accept="image/*"
        hidden
        @change="handleLocalImageSelected"
      />
      <!-- <div class="gd-app-tabs">
        <button
          v-for="tab in workspaceTabs"
          :key="tab.label"
          class="gd-app-tab"
          :class="{ active: tab.active }"
          type="button"
        >
          <span class="gd-app-tab-icon" :class="tab.iconClass">{{ tab.iconLabel }}</span>
          <span>{{ tab.label }}</span>
        </button>
        <button class="gd-app-tab gd-app-tab--add" type="button">+</button>
      </div> -->

      <div v-if="pageError" class="gd-state">
        <div class="gd-state-card">
          <div class="gd-state-title">Google Docs isn’t ready yet</div>
          <div class="gd-state-copy">{{ pageError }}</div>
          <button class="gd-state-btn" type="button" @click="emit('open-integrations')">
            Open Integrations
          </button>
        </div>
      </div>

      <div v-else-if="loading && !currentDocument" class="gd-state">
        <div class="gd-editor-loading">
          <span class="gd-spinner"></span>
          Loading Google Docs...
        </div>
      </div>

      <div v-else-if="!currentDocument && !loading && !documentLoading" class="gd-state">
        <div class="gd-state-card">
          <div class="gd-state-title">No Google Docs found</div>
          <div class="gd-state-copy">
            Connect Google Docs and OrionAI will open your recent files here in a native writing workspace.
          </div>
          <button class="gd-state-btn" type="button" @click="emit('open-integrations')">
            Connect Google Docs
          </button>
        </div>
      </div>

      <template v-else>
        <section class="gd-top-shell" :class="{ 'gd-top-shell--collapsed': topShellCollapsed }">
          <div class="gd-top-shell-main">
            <div class="gd-docbar">
              <div class="gd-docbar-left">
                <div class="gd-doc-badge" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                    <path d="M7 4.5h7l4 4v11a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 19.5v-13A2 2 0 0 1 8 4.5Z"/>
                    <path d="M14 4.5v4h4"/>
                    <path d="M8.5 13.5h7"/>
                    <path d="M8.5 16.5h7"/>
                  </svg>
                </div>
                <div class="gd-doc-meta">
                  <div class="gd-doc-breadcrumb">
                    <span>Google Docs</span>
                    <span class="gd-doc-sep">›</span>
                    <input
                      ref="titleInputRef"
                      v-model="editableTitle"
                      class="gd-doc-title-input"
                      type="text"
                      :disabled="documentLoading || !currentPermissions.canRename"
                      spellcheck="false"
                      @keydown.enter.prevent="$event.target.blur()"
                      @blur="saveNow"
                    />
                    <span class="gd-doc-star">☆</span>
                  </div>
                </div>
              </div>

              <div class="gd-docbar-center">
                <span class="gd-save-dot" :class="{ 'gd-save-dot--error': saveError }"></span>
                <span class="gd-save-text" :class="{ 'gd-save-text--error': saveError }">
                  {{ saveError || driveSaveLabel }}
                </span>
              </div>

              <div class="gd-docbar-right">
                <button class="gd-icon-btn" type="button" title="Open in Google Docs" @click="openDocumentInGoogle">⧉</button>
                <button class="gd-icon-btn" type="button" title="Version history" @click="openDocumentInGoogle">🕘</button>
                <button
                  v-if="isPhoneLayout"
                  class="gd-mobile-pill"
                  type="button"
                  @click="outlineCollapsed = !outlineCollapsed"
                >
                  {{ outlineCollapsed ? "Outline" : "Hide tabs" }}
                </button>
                <button
                  v-if="isPhoneLayout"
                  class="gd-mobile-pill"
                  type="button"
                  @click="aiPanelOpen = !aiPanelOpen"
                >
                  {{ aiPanelOpen ? "Hide AI" : "AI" }}
                </button>
                <div v-if="currentPermissions.canDownload" class="gd-menu-wrap">
                  <button
                    class="gd-icon-btn"
                    type="button"
                    title="Export"
                    :disabled="exportLoading"
                    @click.stop="toggleExportMenu"
                  >
                    {{ exportLoading ? "…" : "⇩" }}
                  </button>
                  <div v-if="exportMenuOpen" class="gd-menu gd-menu--export">
                    <button type="button" :disabled="exportLoading" @click.stop="handleExport('pdf')">Export PDF</button>
                    <button type="button" :disabled="exportLoading" @click.stop="handleExport('docx')">Export DOCX</button>
                    <button type="button" :disabled="exportLoading" @click.stop="handleExport('markdown')">Export Markdown</button>
                    <button type="button" :disabled="exportLoading" @click.stop="handleExport('txt')">Export Text</button>
                  </div>
                </div>
                <button class="gd-icon-btn" type="button" title="Refresh" @click="handleRefresh">↻</button>
                <button
                  v-if="currentPermissions.canShare"
                  class="gd-share-btn"
                  type="button"
                  @click="openShareDialog"
                >
                  Share
                </button>
                <div class="gd-menu-wrap">
                  <button class="gd-plus-btn" type="button" title="More" @click.stop="toggleMoreMenu">+</button>
                  <div v-if="moreMenuOpen" class="gd-menu">
                    <button
                      v-if="currentPermissions.canEdit || currentPermissions.canRename"
                      type="button"
                      @click.stop="saveNow"
                    >
                      Save now
                    </button>
                    <button type="button" @click.stop="printCurrentDocument">Print</button>
                    <button
                      v-if="currentPermissions.canDelete"
                      type="button"
                      class="gd-menu-danger"
                      @click.stop="openDeleteDialog()"
                    >
                      Delete document
                    </button>
                    <button type="button" @click.stop="openDocumentInGoogle">Open in Google Docs</button>
                    <button type="button" @click.stop="emit('open-integrations')">Manage integration</button>
                  </div>
                </div>
              </div>
            </div>

            <div class="gd-menubar">
              <div
                v-for="item in visibleEditorMenuItems"
                :key="item"
                class="gd-menu-wrap gd-menubar-wrap"
              >
                <button
                  class="gd-menubar-item"
                  type="button"
                  @click.stop="toggleHeaderMenu(item)"
                >
                  {{ item }}
                </button>
                <div v-if="activeHeaderMenu === item" class="gd-menu gd-menu--header">
                  <button
                    v-for="menuAction in headerMenus[item]"
                    :key="menuAction.action"
                    type="button"
                    @click.stop="handleHeaderMenuAction(menuAction.action)"
                  >
                    {{ menuAction.label }}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <GoogleDocsToolbar
            :disabled="!currentDocument || documentLoading || !currentPermissions.canEdit"
            :zoom="zoom"
            :header-collapsed="topShellCollapsed"
            @action="handleToolbarAction"
          />
        </section>

        <div class="gd-workspace" :class="{ 'gd-workspace--ai-closed': !aiPanelOpen }">
          <GoogleDocsOutlinePanel
            v-if="!isPhoneLayout || !outlineCollapsed"
            :collapsed="outlineCollapsed"
            :documents="documents"
            :active-document-id="currentDocument?.documentId || ''"
            :outline="outline"
            :loading="documentLoading"
            @toggle="outlineCollapsed = !outlineCollapsed"
            @close-sidebar="outlineCollapsed = true"
            @create-document="handleCreateBlankDocument"
            @jump="jumpToSection"
            @open-document="handleOpenDocument"
            @document-menu-action="handleDocumentMenuAction"
          />

          <section class="gd-center" :class="{ 'gd-center--wide': !aiPanelOpen }">
            <div class="gd-center-surface">
              <GoogleDocsEditor
                v-if="currentDocument"
                ref="editorRef"
                :model-value="editorHtml"
                :zoom="zoom"
                :document-id="currentDocument.documentId"
                :disabled="!currentPermissions.canEdit"
                @update:model-value="updateEditorHtml"
                @outline-change="updateOutline"
                @selection-change="updateSelectionContext"
                @metrics-change="pageMetrics = $event"
              />

              <div v-if="!aiPanelOpen" class="gd-side-rail">
                <button class="gd-side-rail-btn" type="button" title="Open AI Assistant" @click="aiPanelOpen = true">AI</button>
                <button class="gd-side-rail-btn" type="button" title="Summarize" @click="handleQuickAction('summarize')">⌘</button>
                <button class="gd-side-rail-btn" type="button" title="Insights" @click="handleQuickAction('insights')">◎</button>
                <button class="gd-side-rail-btn" type="button" title="Outline" @click="handleQuickAction('create_outline')">☰</button>
                <button class="gd-side-rail-btn" type="button" title="Improve writing" @click="handleQuickAction('improve_writing')">✦</button>
              </div>

              <div v-if="documentLoading" class="gd-editor-loading-overlay">
                <span class="gd-spinner"></span>
                <span>Loading document...</span>
              </div>
            </div>
          </section>

          <GoogleDocsAiPanel
            v-if="aiPanelOpen"
            :active-tab="activeAiTab"
            :loading="aiLoading"
            :messages="aiMessages"
            :user-name="userName"
            @set-tab="activeAiTab = $event"
            @quick-action="handleQuickAction"
            @send="handleAiSend"
            @close="aiPanelOpen = false"
          />
        </div>

        <footer class="gd-statusbar">
          <div class="gd-statusbar-left">
            <span>{{ wordCount.toLocaleString('en-IN') }} words</span>
            <span>{{ characterCount.toLocaleString('en-IN') }} characters</span>
          </div>

          <div class="gd-statusbar-right">
            <span class="gd-page-indicator">Page {{ currentPage }} of {{ pageCount }}</span>
            <button class="gd-zoom-btn" type="button" @click="setZoom(zoom - 10)">−</button>
            <input
              class="gd-zoom-slider"
              type="range"
              min="70"
              max="130"
              step="10"
              :value="zoom"
              @input="setZoom($event.target.value)"
            />
            <span>{{ zoom }}%</span>
            <button class="gd-zoom-btn" type="button" @click="setZoom(zoom + 10)">+</button>
          </div>
        </footer>

        <div
          v-if="shareDialogOpen"
          class="gd-dialog-backdrop"
          @click.self="closeShareDialog"
        >
          <div class="gd-dialog">
            <div class="gd-dialog-head">
              <div>
                <div class="gd-dialog-title">Share in OrionAI</div>
                <div class="gd-dialog-copy">
                  Share access to <strong>{{ currentTitle }}</strong> without leaving OrionAI.
                </div>
              </div>
              <button class="gd-dialog-close" type="button" @click="closeShareDialog">×</button>
            </div>

            <div class="gd-dialog-section">
              <div class="gd-dialog-label">Document link</div>
              <div class="gd-share-link-row">
                <input class="gd-share-link-input" type="text" :value="shareLink" readonly />
                <button class="gd-dialog-btn" type="button" @click="copyShareLink">Copy link</button>
              </div>
            </div>

            <form class="gd-dialog-section" @submit.prevent="handleShareSubmit">
              <div class="gd-dialog-label">Invite by email</div>
              <div class="gd-share-form">
                <input
                  v-model.trim="shareEmail"
                  class="gd-dialog-input"
                  type="email"
                  placeholder="name@company.com"
                  required
                />
                <select v-model="shareRole" class="gd-dialog-select">
                  <option value="writer">Editor</option>
                  <option value="commenter">Commenter</option>
                  <option value="reader">Viewer</option>
                </select>
                <button class="gd-dialog-btn gd-dialog-btn--primary" type="submit" :disabled="shareLoading">
                  {{ shareLoading ? "Sharing..." : "Share" }}
                </button>
              </div>
              <div v-if="shareNotice" class="gd-dialog-note">{{ shareNotice }}</div>
            </form>
          </div>
        </div>

        <div
          v-if="linkDialogOpen"
          class="gd-dialog-backdrop"
          @click.self="closeLinkDialog"
        >
          <div class="gd-dialog gd-dialog--compact">
            <div class="gd-dialog-head">
              <div>
                <div class="gd-dialog-title">Insert link</div>
                <div class="gd-dialog-copy">Add a URL to the current selection.</div>
              </div>
              <button class="gd-dialog-close" type="button" @click="closeLinkDialog">×</button>
            </div>
            <form class="gd-dialog-section" @submit.prevent="submitLinkDialog">
              <input
                v-model.trim="linkDraft"
                class="gd-dialog-input"
                type="url"
                placeholder="https://example.com"
                required
              />
              <div class="gd-dialog-actions">
                <button class="gd-dialog-btn" type="button" @click="closeLinkDialog">Cancel</button>
                <button class="gd-dialog-btn gd-dialog-btn--primary" type="submit">Insert link</button>
              </div>
            </form>
          </div>
        </div>

        <div
          v-if="imageDialogOpen"
          class="gd-dialog-backdrop"
          @click.self="closeImageDialog"
        >
          <div class="gd-dialog">
            <div class="gd-dialog-head">
              <div>
                <div class="gd-dialog-title">Insert image</div>
                <div class="gd-dialog-copy">Upload from your computer or add an image by URL.</div>
              </div>
              <button class="gd-dialog-close" type="button" @click="closeImageDialog">×</button>
            </div>
            <div class="gd-dialog-section">
              <div class="gd-dialog-label">From local computer</div>
              <div class="gd-dialog-actions">
                <button class="gd-dialog-btn gd-dialog-btn--primary" type="button" @click="openLocalImagePicker">
                  Choose image
                </button>
              </div>
            </div>
            <form class="gd-dialog-section" @submit.prevent="submitImageUrl">
              <div class="gd-dialog-label">From URL</div>
              <div class="gd-share-form">
                <input
                  v-model.trim="imageUrlDraft"
                  class="gd-dialog-input"
                  type="url"
                  placeholder="https://example.com/image.png"
                />
                <button class="gd-dialog-btn" type="submit">Insert from URL</button>
              </div>
            </form>
          </div>
        </div>

        <div
          v-if="chartDialogOpen"
          class="gd-dialog-backdrop"
          @click.self="closeChartDialog"
        >
          <div class="gd-dialog">
            <div class="gd-dialog-head">
              <div>
                <div class="gd-dialog-title">Insert chart</div>
                <div class="gd-dialog-copy">Create a chart block directly inside the current document.</div>
              </div>
              <button class="gd-dialog-close" type="button" @click="closeChartDialog">×</button>
            </div>
            <form class="gd-dialog-section gd-chart-form" @submit.prevent="submitChartDialog">
              <input v-model.trim="chartDraft.title" class="gd-dialog-input" type="text" placeholder="Chart title" />
              <select v-model="chartDraft.type" class="gd-dialog-select">
                <option value="bar">Bar chart</option>
                <option value="line">Line chart</option>
                <option value="pie">Pie chart</option>
              </select>
              <textarea
                v-model.trim="chartDraft.labels"
                class="gd-dialog-textarea"
                rows="2"
                placeholder="Labels, comma separated. Example: Q1, Q2, Q3"
              ></textarea>
              <textarea
                v-model.trim="chartDraft.values"
                class="gd-dialog-textarea"
                rows="2"
                placeholder="Values, comma separated. Example: 42, 63, 78"
              ></textarea>
              <div class="gd-dialog-actions">
                <button class="gd-dialog-btn" type="button" @click="closeChartDialog">Cancel</button>
                <button class="gd-dialog-btn gd-dialog-btn--primary" type="submit">Insert chart</button>
              </div>
            </form>
          </div>
        </div>

        <div
          v-if="tablePickerOpen"
          class="gd-dialog-backdrop"
          @click.self="closeTablePicker"
        >
          <div class="gd-dialog gd-dialog--compact">
            <div class="gd-dialog-head">
              <div>
                <div class="gd-dialog-title">Insert table</div>
                <div class="gd-dialog-copy">
                  {{ tableHover.rows && tableHover.columns ? `${tableHover.rows} × ${tableHover.columns}` : "Choose a table size" }}
                </div>
              </div>
              <button class="gd-dialog-close" type="button" @click="closeTablePicker">×</button>
            </div>
            <div class="gd-table-grid">
              <button
                v-for="cell in tableGridCells"
                :key="`${cell.rows}-${cell.columns}`"
                class="gd-table-grid-cell"
                :class="{ active: cell.rows <= tableHover.rows && cell.columns <= tableHover.columns }"
                type="button"
                @mouseenter="tableHover = { rows: cell.rows, columns: cell.columns }"
                @focus="tableHover = { rows: cell.rows, columns: cell.columns }"
                @click="selectTableSize(cell.rows, cell.columns)"
              ></button>
            </div>
          </div>
        </div>

        <div
          v-if="downloadDialogOpen"
          class="gd-dialog-backdrop"
          @click.self="closeDownloadDialog"
        >
          <div class="gd-dialog gd-dialog--compact">
            <div class="gd-dialog-head">
              <div>
                <div class="gd-dialog-title">Download document</div>
                <div class="gd-dialog-copy">Export the current document in your preferred format.</div>
              </div>
              <button class="gd-dialog-close" type="button" @click="closeDownloadDialog">×</button>
            </div>
            <div class="gd-download-grid">
              <button class="gd-dialog-btn" type="button" @click="downloadAndClose('docx')">DOCX</button>
              <button class="gd-dialog-btn" type="button" @click="downloadAndClose('pdf')">PDF</button>
              <button class="gd-dialog-btn" type="button" @click="downloadAndClose('markdown')">Markdown</button>
              <button class="gd-dialog-btn" type="button" @click="downloadAndClose('txt')">Text</button>
            </div>
          </div>
        </div>

        <div
          v-if="renameDialogOpen"
          class="gd-dialog-backdrop"
          @click.self="closeRenameDialog"
        >
          <div class="gd-dialog gd-dialog--compact">
            <div class="gd-dialog-head">
              <div>
                <div class="gd-dialog-title">Rename document</div>
                <div class="gd-dialog-copy">Update the document title without changing its content.</div>
              </div>
              <button class="gd-dialog-close" type="button" @click="closeRenameDialog">×</button>
            </div>
            <form class="gd-dialog-section" @submit.prevent="submitRenameDialog">
              <input
                v-model.trim="renameDraftTitle"
                class="gd-dialog-input"
                type="text"
                placeholder="Document title"
                required
              />
              <div class="gd-dialog-actions">
                <button class="gd-dialog-btn" type="button" @click="closeRenameDialog">Cancel</button>
                <button class="gd-dialog-btn gd-dialog-btn--primary" type="submit">Rename</button>
              </div>
            </form>
          </div>
        </div>

        <div
          v-if="deleteDialogOpen"
          class="gd-dialog-backdrop"
          @click.self="closeDeleteDialog"
        >
          <div class="gd-dialog gd-dialog--compact">
            <div class="gd-dialog-head">
              <div>
                <div class="gd-dialog-title">Delete document</div>
                <div class="gd-dialog-copy">
                  Move <strong>{{ deleteTargetTitle }}</strong> to trash from OrionAI.
                </div>
              </div>
              <button class="gd-dialog-close" type="button" @click="closeDeleteDialog">×</button>
            </div>
            <div class="gd-dialog-actions">
              <button class="gd-dialog-btn" type="button" @click="closeDeleteDialog">Cancel</button>
              <button
                class="gd-dialog-btn gd-dialog-btn--danger"
                type="button"
                :disabled="deleteLoading"
                @click="confirmDeleteDocument"
              >
                {{ deleteLoading ? "Deleting..." : "Delete document" }}
              </button>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { store } from "../stores/app";
import { useGoogleDocs } from "../composables/useGoogleDocs";
import GoogleDocsToolbar from "../components/google-docs/GoogleDocsToolbar.vue";
import GoogleDocsOutlinePanel from "../components/google-docs/GoogleDocsOutlinePanel.vue";
import GoogleDocsEditor from "../components/google-docs/GoogleDocsEditor.vue";
import GoogleDocsAiPanel from "../components/google-docs/GoogleDocsAiPanel.vue";
import { executeScopedAssistantCommand } from "../services/orionAssistant/orchestrator";
import { buildChartSnapshot } from "../services/googleDocsVisuals";

const emit = defineEmits(["close", "open-integrations"]);

const editorRef = ref(null);
const localImageInputRef = ref(null);
const titleInputRef = ref(null);
const viewportWidth = ref(typeof window !== "undefined" ? window.innerWidth : 1280);
const outlineCollapsed = ref(false);
const aiPanelOpen = ref(true);
const activeAiTab = ref("chat");
const activeHeaderMenu = ref("");
const exportMenuOpen = ref(false);
const moreMenuOpen = ref(false);
const topShellCollapsed = ref(false);
const shareDialogOpen = ref(false);
const shareEmail = ref("");
const shareRole = ref("writer");
const shareLoading = ref(false);
const shareNotice = ref("");
const linkDialogOpen = ref(false);
const linkDraft = ref("");
const imageDialogOpen = ref(false);
const imageUrlDraft = ref("");
const chartDialogOpen = ref(false);
const chartDraft = ref({
  type: "bar",
  title: "",
  labels: "",
  values: "",
});
const tablePickerOpen = ref(false);
const tableHover = ref({ rows: 0, columns: 0 });
const downloadDialogOpen = ref(false);
const renameDialogOpen = ref(false);
const renameDraftTitle = ref("");
const renameTargetDocumentId = ref("");
const deleteDialogOpen = ref(false);
const deleteLoading = ref(false);
const deleteTargetDocumentId = ref("");
const deleteTargetTitle = ref("");
const pageError = ref("");
const pageMetrics = ref({ pageCount: 1, currentPage: 1 });
const aiMessages = ref([]);
const aiRequestCounter = ref(0);
const isPhoneLayout = computed(() => viewportWidth.value <= 640);

// const workspaceTabs = [
//   { label: "Chat", iconLabel: "◔", iconClass: "gd-app-tab-icon--chat", active: false },
//   { label: "Jira", iconLabel: "J", iconClass: "gd-app-tab-icon--jira", active: false },
//   { label: "Gmail", iconLabel: "M", iconClass: "gd-app-tab-icon--gmail", active: false },
//   { label: "Calendar", iconLabel: "C", iconClass: "gd-app-tab-icon--calendar", active: false },
//   { label: "Drive", iconLabel: "D", iconClass: "gd-app-tab-icon--drive", active: false },
//   { label: "Google Docs", iconLabel: "D", iconClass: "gd-app-tab-icon--docs", active: true },
//   { label: "Sheets", iconLabel: "S", iconClass: "gd-app-tab-icon--sheets", active: false },
//   { label: "Slides", iconLabel: "S", iconClass: "gd-app-tab-icon--slides", active: false },
// ];

const editorMenuItems = [
  "File",
  "Edit",
  "View",
  "Insert",
  "Format",
  "Tools",
  "Extensions",
  "Help",
];

const {
  documents,
  loading,
  documentLoading,
  currentDocument,
  documentTitle,
  editorHtml,
  outline,
  plainText,
  wordCount,
  characterCount,
  saveLabel,
  saveError,
  aiLoading,
  exportLoading,
  zoom,
  selectionText,
  currentSectionText,
  loadInitialDocument,
  openDocument,
  createDocument,
  updateEditorHtml,
  updateTitle,
  updateOutline,
  updateSelectionContext,
  renameDocument,
  deleteDocument,
  saveDocumentNow,
  refreshCurrentDocument,
  runAiAction,
  shareCurrentDocument,
  exportCurrentDocument,
  setZoom,
  openDocumentInGoogle,
} = useGoogleDocs();

const actionLabels = {
  summarize: "Summarize this document",
  improve_writing: "Improve writing",
  fix_grammar: "Fix grammar",
  rewrite_selection: "Rewrite selection",
  extract_action_items: "Extract next steps",
  create_outline: "Create outline",
  shorten_text: "Shorten this",
  expand_text: "Expand this",
  insights: "Generate insights",
  chat: "Ask OrionAI",
};

const currentTitle = computed(
  () => documentTitle.value || currentDocument.value?.title || "Untitled document"
);
const editableTitle = computed({
  get: () => currentTitle.value,
  set: (value) => updateTitle(value),
});

const pageCount = computed(() => Math.max(1, Number(pageMetrics.value?.pageCount || 1)));
const currentPage = computed(() => Math.max(1, Number(pageMetrics.value?.currentPage || 1)));
const userName = computed(() => store.user?.username || "there");
const activeDocumentId = computed(() => currentDocument.value?.documentId || "");
const currentPermissions = computed(() => ({
  canEdit: currentDocument.value?.permissions?.canEdit !== false,
  canRename: currentDocument.value?.permissions?.canRename !== false,
  canShare: currentDocument.value?.permissions?.canShare !== false,
  canDelete: Boolean(currentDocument.value?.permissions?.canDelete),
  canDownload: currentDocument.value?.permissions?.canDownload !== false,
}));
const shareLink = computed(
  () =>
    currentDocument.value?.webViewUrl ||
    (currentDocument.value?.documentId
      ? `https://docs.google.com/document/d/${currentDocument.value.documentId}/edit`
      : "")
);
const tableGridCells = computed(() =>
  Array.from({ length: 48 }, (_, index) => ({
    rows: Math.floor(index / 8) + 1,
    columns: (index % 8) + 1,
  }))
);

const headerMenus = computed(() => ({
  File: [
    { label: "New blank document", action: "new_blank" },
    ...(currentPermissions.value.canDownload ? [{ label: "Download document", action: "download_doc" }] : []),
    { label: "Print", action: "print_doc" },
    ...(currentPermissions.value.canShare ? [{ label: "Share", action: "share_doc" }] : []),
    ...(currentPermissions.value.canEdit || currentPermissions.value.canRename
      ? [{ label: "Save now", action: "save_now" }]
      : []),
    ...(currentPermissions.value.canDelete ? [{ label: "Delete document", action: "delete_doc" }] : []),
    { label: "Export PDF", action: "export_pdf" },
    { label: "Open in Google Docs", action: "open_google" },
  ],
  Edit: [
    { label: "Undo", action: "undo" },
    { label: "Redo", action: "redo" },
    { label: "Select all", action: "select_all" },
  ],
  View: [
    { label: "Toggle document tabs", action: "toggle_outline" },
    { label: "Toggle AI assistant", action: "toggle_ai" },
    { label: "Zoom in", action: "zoom_in" },
    { label: "Zoom out", action: "zoom_out" },
  ],
  Insert: currentPermissions.value.canEdit
    ? [
        { label: "Insert link", action: "insert_link" },
        { label: "Image from local computer", action: "insert_image_local" },
        { label: "Image by URL", action: "insert_image_url" },
        { label: "Chart", action: "insert_chart" },
        { label: "Insert table", action: "insert_table" },
      ]
    : [],
  Format: currentPermissions.value.canEdit
    ? [
        { label: "Bold", action: "bold" },
        { label: "Italic", action: "italic" },
        { label: "Underline", action: "underline" },
        { label: "Bulleted list", action: "list_disc" },
        { label: "A, B, C list", action: "list_upper_alpha" },
        { label: "a, b, c list", action: "list_lower_alpha" },
        { label: "I, II, III list", action: "list_upper_roman" },
        { label: "i, ii, iii list", action: "list_lower_roman" },
        { label: "Align left", action: "align_left" },
        { label: "Align center", action: "align_center" },
        { label: "Align right", action: "align_right" },
      ]
    : [],
  Tools: [
    { label: "Summarize document", action: "summarize" },
    { label: "Improve writing", action: "improve_writing" },
    { label: "Fix grammar", action: "fix_grammar" },
  ],
  Extensions: [
    { label: "Create outline", action: "create_outline" },
    { label: "Generate insights", action: "insights" },
  ],
  Help: [
    { label: "Ask AI about this document", action: "ask_ai" },
    { label: "Manage integration", action: "manage_integration" },
  ],
}));
const visibleEditorMenuItems = computed(() =>
  editorMenuItems.filter((item) => (headerMenus.value[item] || []).length)
);

const driveSaveLabel = computed(() => {
  if (saveLabel.value === "Saving...") return "Saving to Drive";
  if (saveLabel.value === "Saved") return "Saved to Drive";
  if (saveLabel.value === "Save failed") return "Drive sync failed";
  if (saveLabel.value === "Unsaved changes") return "Changes not synced yet";
  return "Ready in Drive";
});

function buildPromptForAction(action) {
  return actionLabels[action] || "Run AI action";
}

function ensureActiveDocsScope() {
  return !store.moduleContext?.module || store.moduleContext.module === "google_docs";
}

function parseCsvList(value = "") {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Failed to read image."));
    reader.readAsDataURL(file);
  });
}

function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to load image."));
    image.src = src;
  });
}

async function optimizeImageFile(file) {
  const originalDataUrl = await readFileAsDataUrl(file);
  if (!file?.type?.startsWith("image/")) {
    return {
      src: originalDataUrl,
      width: 520,
      height: 320,
    };
  }

  const image = await loadImageElement(originalDataUrl);
  const maxWidth = 1600;
  const scale = Math.min(1, maxWidth / Math.max(1, image.naturalWidth || image.width || 1));
  const shouldCompress = file.size > 1_800_000 || scale < 1;
  let src = originalDataUrl;

  if (!shouldCompress || typeof document === "undefined") {
    const baseWidth = Math.min(640, image.naturalWidth || image.width || 640);
    const ratio = (image.naturalHeight || image.height || 1) / Math.max(1, image.naturalWidth || image.width || 1);
    return {
      src,
      width: Math.round(baseWidth),
      height: Math.round(baseWidth * ratio),
      naturalWidth: image.naturalWidth || image.width || baseWidth,
      naturalHeight: image.naturalHeight || image.height || Math.round(baseWidth * ratio),
    };
  }

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round((image.naturalWidth || image.width) * scale));
  canvas.height = Math.max(1, Math.round((image.naturalHeight || image.height) * scale));
  const context = canvas.getContext("2d");
  if (!context) {
    return {
      src,
      width: 520,
      height: 320,
      naturalWidth: image.naturalWidth || image.width || 520,
      naturalHeight: image.naturalHeight || image.height || 320,
    };
  }

  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  src = canvas.toDataURL("image/jpeg", 0.84);
  const optimizedImage = await loadImageElement(src).catch(() => image);
  const naturalWidth = optimizedImage.naturalWidth || optimizedImage.width || canvas.width;
  const naturalHeight = optimizedImage.naturalHeight || optimizedImage.height || canvas.height;
  const width = Math.min(640, naturalWidth);
  const height = Math.round(width * (naturalHeight / Math.max(1, naturalWidth)));
  return {
    src,
    width,
    height,
    naturalWidth,
    naturalHeight,
  };
}

async function boot() {
  pageError.value = "";
  try {
    await loadInitialDocument();
  } catch (error) {
    pageError.value =
      error.response?.data?.error || error.message || "Failed to open Google Docs.";
  }
}

async function handleOpenDocument(documentId) {
  if (!documentId) return;
  pageError.value = "";
  activeHeaderMenu.value = "";
  exportMenuOpen.value = false;
  moreMenuOpen.value = false;
  shareDialogOpen.value = false;
  shareNotice.value = "";
  try {
    await openDocument(documentId);
  } catch (error) {
    pageError.value =
      error.response?.data?.error || error.message || "Failed to open document.";
  }
}

function toggleExportMenu() {
  activeHeaderMenu.value = "";
  closeTablePicker();
  exportMenuOpen.value = !exportMenuOpen.value;
  if (exportMenuOpen.value) moreMenuOpen.value = false;
}

function toggleMoreMenu() {
  activeHeaderMenu.value = "";
  closeTablePicker();
  moreMenuOpen.value = !moreMenuOpen.value;
  if (moreMenuOpen.value) exportMenuOpen.value = false;
}

function toggleHeaderMenu(menu) {
  exportMenuOpen.value = false;
  moreMenuOpen.value = false;
  closeTablePicker();
  editorRef.value?.captureSelection?.();
  activeHeaderMenu.value = activeHeaderMenu.value === menu ? "" : menu;
}

async function handleExport(format) {
  exportMenuOpen.value = false;
  try {
    await exportCurrentDocument(format);
  } catch (error) {
    pageError.value =
      error.response?.data?.error || error.message || "Failed to export document.";
  }
}

async function saveNow() {
  if (!currentPermissions.value.canEdit && !currentPermissions.value.canRename) return;
  moreMenuOpen.value = false;
  try {
    await saveDocumentNow();
  } catch (error) {
    pageError.value =
      error.response?.data?.error || error.message || "Failed to save document.";
  }
}

async function handleRefresh() {
  activeHeaderMenu.value = "";
  exportMenuOpen.value = false;
  moreMenuOpen.value = false;
  pageError.value = "";
  try {
    await refreshCurrentDocument();
  } catch (error) {
    pageError.value =
      error.response?.data?.error || error.message || "Failed to refresh document.";
  }
}

function handleToolbarAction(action) {
  const editor = editorRef.value;
  if (!editor) return;

  if (action.type === "toggleTopShell") {
    topShellCollapsed.value = !topShellCollapsed.value;
    return;
  }

  if (action.type === "downloadDocument") {
    openDownloadDialog();
    return;
  }

  if (action.type === "printDocument") {
    printCurrentDocument();
    return;
  }

  if (action.type === "openLinkDialog") {
    editor.captureSelection?.();
    linkDraft.value = "";
    linkDialogOpen.value = true;
    return;
  }

  if (action.type === "openImageDialog") {
    editor.captureSelection?.();
    imageDialogOpen.value = true;
    return;
  }

  if (action.type === "openChartDialog") {
    editor.captureSelection?.();
    chartDialogOpen.value = true;
    return;
  }

  if (action.type === "openTablePicker") {
    editor.captureSelection?.();
    tablePickerOpen.value = true;
    return;
  }

  editor.execCommand(action.type, action.value);
}

function jumpToSection(id) {
  editorRef.value?.scrollToOutline(id);
}

async function handleCreateBlankDocument() {
  pageError.value = "";
  activeHeaderMenu.value = "";
  shareDialogOpen.value = false;
  try {
    await createDocument("Untitled document");
    outlineCollapsed.value = false;
    aiMessages.value = [];
  } catch (error) {
    pageError.value =
      error.response?.data?.error || error.message || "Failed to create document.";
  }
}

async function handleDocumentMenuAction({ action, document }) {
  if (!document?.documentId) return;

  if (action === "rename") {
    renameTargetDocumentId.value = document.documentId;
    renameDraftTitle.value = document.title || "";
    renameDialogOpen.value = true;
    return;
  }

  if (action === "share") {
    if (activeDocumentId.value !== document.documentId) {
      await handleOpenDocument(document.documentId);
    }
    openShareDialog();
    return;
  }

  if (action === "download") {
    if (activeDocumentId.value !== document.documentId) {
      await handleOpenDocument(document.documentId);
    }
    openDownloadDialog();
    return;
  }

  if (action === "delete") {
    openDeleteDialog(document);
    return;
  }

  if (action === "open_in_google") {
    window.open(
      document.webViewUrl ||
        `https://docs.google.com/document/d/${document.documentId}/edit`,
      "_blank",
      "noopener,noreferrer"
    );
  }
}

function openShareDialog() {
  if (!currentPermissions.value.canShare) return;
  activeHeaderMenu.value = "";
  exportMenuOpen.value = false;
  moreMenuOpen.value = false;
  shareDialogOpen.value = true;
  shareEmail.value = "";
  shareRole.value = "writer";
  shareNotice.value = "";
}

function closeShareDialog() {
  shareDialogOpen.value = false;
  shareLoading.value = false;
  shareNotice.value = "";
}

function closeLinkDialog() {
  linkDialogOpen.value = false;
  linkDraft.value = "";
}

function closeImageDialog() {
  imageDialogOpen.value = false;
  imageUrlDraft.value = "";
}

function closeChartDialog() {
  chartDialogOpen.value = false;
}

function closeTablePicker() {
  tablePickerOpen.value = false;
  tableHover.value = { rows: 0, columns: 0 };
}

function openDownloadDialog() {
  if (!currentPermissions.value.canDownload) return;
  downloadDialogOpen.value = true;
}

function closeDownloadDialog() {
  downloadDialogOpen.value = false;
}

function closeRenameDialog() {
  renameDialogOpen.value = false;
  renameDraftTitle.value = "";
  renameTargetDocumentId.value = "";
}

function openDeleteDialog(document = currentDocument.value) {
  if (!document?.documentId) return;
  activeHeaderMenu.value = "";
  exportMenuOpen.value = false;
  moreMenuOpen.value = false;
  deleteTargetDocumentId.value = document.documentId;
  deleteTargetTitle.value = document.title || "Untitled document";
  deleteDialogOpen.value = true;
}

function closeDeleteDialog() {
  deleteDialogOpen.value = false;
  deleteLoading.value = false;
  deleteTargetDocumentId.value = "";
  deleteTargetTitle.value = "";
}

async function confirmDeleteDocument() {
  if (!deleteTargetDocumentId.value) return;
  deleteLoading.value = true;
  pageError.value = "";
  try {
    await deleteDocument(deleteTargetDocumentId.value);
    closeDeleteDialog();
  } catch (error) {
    pageError.value =
      error.response?.data?.error || error.message || "Failed to delete document.";
    deleteLoading.value = false;
  }
}

async function copyShareLink() {
  if (!shareLink.value || typeof navigator === "undefined" || !navigator.clipboard) return;
  await navigator.clipboard.writeText(shareLink.value);
  shareNotice.value = "Document link copied.";
}

async function handleShareSubmit() {
  if (!shareEmail.value) return;
  shareLoading.value = true;
  shareNotice.value = "";
  try {
    const data = await shareCurrentDocument({
      emails: [shareEmail.value],
      role: shareRole.value,
    });
    shareNotice.value = `Shared with ${data.sharedWith} as ${data.role}.`;
    shareEmail.value = "";
  } catch (error) {
    shareNotice.value =
      error.response?.data?.error || error.message || "Failed to share document.";
  } finally {
    shareLoading.value = false;
  }
}

function openLocalImagePicker() {
  localImageInputRef.value?.click();
}

function handleLocalImageSelected(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  optimizeImageFile(file)
    .then((imageAsset) => {
      editorRef.value?.execCommand("insertImageBlock", {
        ...imageAsset,
        alt: file.name || "Uploaded image",
      });
      closeImageDialog();
      event.target.value = "";
    })
    .catch((error) => {
      pageError.value = error.message || "Failed to insert image.";
      event.target.value = "";
    });
}

async function submitImageUrl() {
  if (!imageUrlDraft.value) return;
  try {
    const image = await loadImageElement(imageUrlDraft.value);
    const width = Math.min(640, image.naturalWidth || image.width || 640);
    const height = Math.round(
      width * ((image.naturalHeight || image.height || 1) / Math.max(1, image.naturalWidth || image.width || 1))
    );
    editorRef.value?.execCommand("insertImageBlock", {
      src: imageUrlDraft.value,
      alt: "Inserted image",
      width,
      height,
      naturalWidth: image.naturalWidth || image.width || width,
      naturalHeight: image.naturalHeight || image.height || height,
    });
    closeImageDialog();
  } catch (error) {
    pageError.value = error.message || "Failed to insert image.";
  }
}

function submitLinkDialog() {
  if (!linkDraft.value) return;
  editorRef.value?.execCommand("createLink", linkDraft.value);
  closeLinkDialog();
}

async function submitChartDialog() {
  const labels = parseCsvList(chartDraft.value.labels);
  const values = parseCsvList(chartDraft.value.values)
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item));

  try {
    const snapshot = await buildChartSnapshot({
      type: chartDraft.value.type,
      title: chartDraft.value.title || "Chart",
      labels,
      values,
    });

    editorRef.value?.execCommand("insertChartBlock", {
      type: chartDraft.value.type,
      title: chartDraft.value.title || "Chart",
      labels,
      values,
      ...snapshot,
    });
    closeChartDialog();
  } catch (error) {
    pageError.value = error.message || "Failed to insert chart.";
  }
}

function selectTableSize(rows, columns) {
  editorRef.value?.execCommand("insertTable", { rows, columns });
  closeTablePicker();
}

async function downloadAndClose(format) {
  await handleExport(format);
  closeDownloadDialog();
}

function buildPrintHtml() {
  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <title>${currentTitle.value}</title>
      <style>
        body {
          background: #f3f4f6;
          margin: 0;
          padding: 24px;
          font-family: Arial, sans-serif;
        }
        .page {
          width: 816px;
          min-height: 1122px;
          margin: 0 auto;
          background: white;
          padding: 68px 78px 72px;
          box-sizing: border-box;
          color: #202124;
        }
        h1,h2,h3,h4,h5,h6 { color: #202124; }
        table { width: 100%; border-collapse: collapse; }
        td, th { border: 1px solid #d0d7de; padding: 10px 12px; }
        img, svg { max-width: 100%; }
      </style>
    </head>
    <body>
      <div class="page">${editorHtml.value || "<p><br /></p>"}</div>
    </body>
  </html>`;
}

function printCurrentDocument() {
  if (typeof window === "undefined") return;
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  document.body.appendChild(iframe);

  const iframeDoc = iframe.contentWindow?.document;
  if (!iframeDoc) {
    iframe.remove();
    return;
  }

  iframeDoc.open();
  iframeDoc.write(buildPrintHtml());
  iframeDoc.close();
  iframe.contentWindow?.focus();
  iframe.contentWindow?.print();
  window.setTimeout(() => iframe.remove(), 1200);
}

async function submitRenameDialog() {
  if (!renameTargetDocumentId.value || !renameDraftTitle.value) return;
  try {
    await renameDocument(renameTargetDocumentId.value, renameDraftTitle.value);
    closeRenameDialog();
  } catch (error) {
    pageError.value =
      error.response?.data?.error || error.message || "Failed to rename document.";
  }
}

async function pushAiResponse(action, question = "") {
  if (!ensureActiveDocsScope()) return;

  const userText = question || buildPromptForAction(action);
  const documentIdAtStart = activeDocumentId.value;
  const requestId = ++aiRequestCounter.value;
  aiMessages.value.push({
    id: `${Date.now()}-user`,
    role: "user",
    text: userText,
  });

  try {
    const data = await runAiAction({ action, question });
    if (requestId !== aiRequestCounter.value || documentIdAtStart !== activeDocumentId.value) {
      return;
    }
    aiMessages.value.push({
      id: `${Date.now()}-assistant`,
      role: "assistant",
      text: data?.result || "No response returned.",
    });
  } catch (error) {
    aiMessages.value.push({
      id: `${Date.now()}-assistant-error`,
      role: "assistant",
      text:
        error.response?.data?.error ||
        error.message ||
        "AI couldn’t complete that request.",
    });
  }
}

function handleQuickAction(action) {
  aiPanelOpen.value = true;
  pushAiResponse(action);
}

function buildDocsAssistantRuntime() {
  return {
    getScope: () => store.moduleContext?.module || "google_docs",
    getActiveEntityId: () => activeDocumentId.value,
    getActiveEntityTitle: () => currentTitle.value,
    getSelectionText: () => selectionText.value || "",
    getCurrentSectionText: () => currentSectionText.value || "",
    getDocumentText: () => plainText.value || "",
    getPermissions: () => currentPermissions.value,
    runAiAction,
    streamInsertContent: (text) => editorRef.value?.streamInsertContent(text),
    shareCurrentDocument,
    renameCurrentDocument: (title) =>
      activeDocumentId.value ? renameDocument(activeDocumentId.value, title) : null,
    exportCurrentDocument,
    printCurrentDocument,
    execEditorAction: (type, value) => editorRef.value?.execCommand(type, value),
    deleteCurrentDocument: () =>
      activeDocumentId.value ? deleteDocument(activeDocumentId.value) : null,
  };
}

async function handleAiSend(question) {
  aiPanelOpen.value = true;
  if (!ensureActiveDocsScope()) return;
  const trimmedQuestion = String(question || "").trim();
  if (!trimmedQuestion) return;

  const requestId = ++aiRequestCounter.value;
  aiMessages.value.push({
    id: `${Date.now()}-user`,
    role: "user",
    text: trimmedQuestion,
  });

  try {
    const result = await executeScopedAssistantCommand({
      question: trimmedQuestion,
      scope: "google_docs",
      runtime: buildDocsAssistantRuntime(),
    });

    if (requestId !== aiRequestCounter.value) {
      return;
    }

    aiMessages.value.push({
      id: `${Date.now()}-assistant`,
      role: "assistant",
      text: result?.assistantText || "No response returned.",
    });
  } catch (error) {
    aiMessages.value.push({
      id: `${Date.now()}-assistant-agent-error`,
      role: "assistant",
      text:
        error.response?.data?.error ||
        error.message ||
        "I couldn’t complete that document action.",
    });
    return;
  }
}

async function handleHeaderMenuAction(action) {
  activeHeaderMenu.value = "";
console.log("Header menu action:", action);
  if (action === "new_blank") {
    await handleCreateBlankDocument();
    return;
  }

  if (action === "share_doc") {
    openShareDialog();
    return;
  }

  if (action === "save_now") {
    await saveNow();
    return;
  }

  if (action === "delete_doc") {
    openDeleteDialog();
    return;
  }

  if (action === "download_doc") {
    openDownloadDialog();
    return;
  }

  if (action === "print_doc") {
    console.log("Printing document...");
    printCurrentDocument();
    return;
  }

  if (action === "export_pdf") {
    await handleExport("pdf");
    return;
  }

  if (action === "open_google") {
    openDocumentInGoogle();
    return;
  }

  if (action === "toggle_outline") {
    outlineCollapsed.value = !outlineCollapsed.value;
    return;
  }

  if (action === "toggle_ai") {
    aiPanelOpen.value = !aiPanelOpen.value;
    return;
  }

  if (action === "zoom_in") {
    setZoom(zoom.value + 10);
    return;
  }

  if (action === "zoom_out") {
    setZoom(zoom.value - 10);
    return;
  }

  if (action === "summarize" || action === "improve_writing" || action === "fix_grammar" || action === "create_outline" || action === "insights") {
    handleQuickAction(action);
    return;
  }

  if (action === "ask_ai") {
    aiPanelOpen.value = true;
    handleAiSend("Help me understand and work with this document.");
    return;
  }

  if (action === "manage_integration") {
    emit("open-integrations");
    return;
  }

  if (action === "select_all") {
    editorRef.value?.focusEditor();
    document.execCommand("selectAll", false);
    return;
  }

  const actionMap = {
    undo: { type: "undo" },
    redo: { type: "redo" },
    insert_link: { type: "openLinkDialog" },
    insert_image_local: { type: "openImageDialog" },
    insert_image_url: { type: "openImageDialog" },
    insert_chart: { type: "openChartDialog" },
    insert_table: { type: "openTablePicker" },
    bold: { type: "bold" },
    italic: { type: "italic" },
    underline: { type: "underline" },
    list_disc: { type: "applyListStyle", value: "disc" },
    list_upper_alpha: { type: "applyListStyle", value: "upper-alpha" },
    list_lower_alpha: { type: "applyListStyle", value: "lower-alpha" },
    list_upper_roman: { type: "applyListStyle", value: "upper-roman" },
    list_lower_roman: { type: "applyListStyle", value: "lower-roman" },
    align_left: { type: "justifyLeft" },
    align_center: { type: "justifyCenter" },
    align_right: { type: "justifyRight" },
  };

  const nextAction = actionMap[action];
  if (nextAction) {
    handleToolbarAction(nextAction);
  }
}

function handleOutsideClick(event) {
  if (!event.target.closest(".gd-menu-wrap")) {
    activeHeaderMenu.value = "";
    exportMenuOpen.value = false;
    moreMenuOpen.value = false;
  }
}

watch(
  () => currentDocument.value?.documentId,
  () => {
    aiRequestCounter.value += 1;
    editorRef.value?.cancelActiveStream?.();
    aiMessages.value = [];
    closeLinkDialog();
    closeImageDialog();
    closeChartDialog();
    closeTablePicker();
    closeDownloadDialog();
    closeRenameDialog();
    closeDeleteDialog();
  }
);

watch(
  () => [store.moduleContext?.module, store.moduleContext?.documentId],
  async ([module, documentId]) => {
    if (module !== "google_docs" || !documentId || documentId === activeDocumentId.value) return;
    await handleOpenDocument(documentId);
  }
);

function handleViewportResize() {
  viewportWidth.value = window.innerWidth;
}

onMounted(async () => {
  handleViewportResize();
  if (isPhoneLayout.value) {
    outlineCollapsed.value = true;
    aiPanelOpen.value = false;
    activeHeaderMenu.value = "";
    exportMenuOpen.value = false;
    moreMenuOpen.value = false;
  }
  document.addEventListener("click", handleOutsideClick);
  window.addEventListener("resize", handleViewportResize);
  await boot();
});

onBeforeUnmount(() => {
  document.removeEventListener("click", handleOutsideClick);
  window.removeEventListener("resize", handleViewportResize);
  editorRef.value?.cancelActiveStream?.();
});
</script>

<style scoped>
.gd-page {
  flex: 1;
  min-width: 0;
  min-height: 0;
  background:
    radial-gradient(circle at 16% 8%, rgba(53, 94, 214, 0.09), transparent 24%),
    linear-gradient(180deg, #0b1120 0%, #09111a 100%);
}

.gd-shell {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 14px 12px;
  min-height: 0;
  box-sizing: border-box;
}

.gd-app-tabs {
  display: flex;
  align-items: center;
  gap: 6px;
  overflow-x: auto;
  padding: 0 6px;
}

.gd-app-tab {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 28px;
  padding: 0 12px 0 9px;
  border-radius: 10px;
  border: 1px solid rgba(176, 201, 255, 0.06);
  background: rgba(24, 31, 49, 0.9);
  color: rgba(214, 223, 238, 0.78);
  font: inherit;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.02);
}

.gd-app-tab.active {
  background: linear-gradient(180deg, rgba(52, 99, 222, 0.88), rgba(42, 84, 193, 0.9));
  color: var(--text-primary);
  border-color: rgba(123, 164, 255, 0.18);
}

.gd-app-tab--add {
  border-radius: 999px;
  width: 28px;
  justify-content: center;
  padding: 0;
}

.gd-app-tab-icon {
  width: 14px;
  height: 14px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 8px;
  font-weight: 800;
  color: white;
  flex-shrink: 0;
}

.gd-app-tab-icon--chat {
  background: linear-gradient(180deg, #6f87ff, #4d65da);
}

.gd-app-tab-icon--jira {
  background: linear-gradient(180deg, #8f78ff, #6b58d8);
}

.gd-app-tab-icon--gmail {
  background: linear-gradient(180deg, #ff8477, #d8574c);
}

.gd-app-tab-icon--calendar {
  background: linear-gradient(180deg, #8fa3bf, #617389);
}

.gd-app-tab-icon--drive {
  background: linear-gradient(180deg, #59d38d, #249d5c);
}

.gd-app-tab-icon--docs {
  background: linear-gradient(180deg, #74a6ff, #3a75ea);
}

.gd-app-tab-icon--sheets {
  background: linear-gradient(180deg, #6fd99b, #2ea96b);
}

.gd-app-tab-icon--slides {
  background: linear-gradient(180deg, #ffba55, #e48a2d);
}

.gd-top-shell {
  padding: 10px 10px 8px;
  border-radius: 18px 18px 14px 14px;
  background: linear-gradient(180deg, rgba(13, 19, 32, 0.98), rgba(11, 17, 28, 0.96));
  border: 1px solid rgba(176, 201, 255, 0.06);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.02);
}

.gd-top-shell-main {
  overflow: visible;
  max-height: 120px;
  transition: max-height 0.22s ease, opacity 0.18s ease, margin-bottom 0.18s ease;
}

.gd-top-shell--collapsed .gd-top-shell-main {
  max-height: 0;
  opacity: 0;
  margin-bottom: 0;
  overflow: hidden;
  pointer-events: none;
}

.gd-docbar,
.gd-docbar-left,
.gd-docbar-center,
.gd-docbar-right,
.gd-menubar,
.gd-statusbar,
.gd-statusbar-left,
.gd-statusbar-right {
  display: flex;
  align-items: center;
}

.gd-docbar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  gap: 14px;
  min-height: 34px;
}

.gd-docbar-left {
  gap: 12px;
  min-width: 0;
}

.gd-doc-badge {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(66, 133, 244);
  border: 1px solid rgba(93, 219, 137, 0.18);
  color: #d9f7e1;
}

.gd-doc-badge svg {
  width: 15px;
  height: 15px;
}

.gd-doc-meta {
  min-width: 0;
}

.gd-doc-breadcrumb {
  display: flex;
  align-items: center;
  gap: 7px;
  color: rgba(237, 243, 255, 0.9);
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
}

.gd-doc-sep,
.gd-doc-star {
  color: var(--text-faint);
}

.gd-doc-title-input {
  min-width: 0;
  width: min(340px, 38vw);
  border: none;
  background: transparent;
  color: #7fb4ff;
  font: inherit;
  font-weight: 600;
  padding: 0;
  outline: none;
}

.gd-doc-title-input:focus {
  color: #a4c7ff;
}

.gd-doc-title-input:disabled {
  opacity: 0.6;
}

.gd-docbar-center {
  justify-self: center;
  gap: 8px;
  color: rgba(149, 224, 190, 0.86);
  font-size: 11px;
  font-weight: 700;
}

.gd-save-dot {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: #58d9a4;
}

.gd-save-dot--error {
  background: #ff6a6a;
}

.gd-save-text--error {
  color: rgba(255, 157, 157, 0.92);
}

.gd-docbar-right {
  gap: 8px;
  position: relative;
  justify-self: end;
}

.gd-menubar {
  gap: 14px;
  min-height: 20px;
  padding: 2px 0 8px 40px;
}

.gd-menubar-wrap {
  display: inline-flex;
}

.gd-menubar-item {
  border: none;
  background: transparent;
  color: var(--text-muted);
  font: inherit;
  font-size: 11px;
  cursor: pointer;
  padding: 0;
}

.gd-menubar-item:hover {
  color: var(--text-primary);
}

.gd-icon-btn,
.gd-plus-btn,
.gd-share-btn,
.gd-state-btn,
.gd-zoom-btn,
.gd-mobile-pill {
  border: 1px solid rgba(176, 201, 255, 0.08);
  background: rgba(255, 255, 255, 0.035);
  color: rgba(228, 236, 250, 0.82);
  border-radius: 999px;
  min-height: 32px;
  padding: 0 10px;
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.gd-icon-btn {
  min-width: 32px;
  padding: 0;
}

.gd-plus-btn {
  width: 32px;
  min-width: 32px;
  padding: 0;
}

.gd-mobile-pill {
  min-height: 32px;
  padding: 0 12px;
}

.gd-share-btn,
.gd-state-btn {
  padding: 0 16px;
  border-radius: 999px;
  background: #2d6df6;
  color: white;
  border-color: rgba(45, 109, 246, 0.6);
}

.gd-menu-wrap {
  position: relative;
}

.gd-menu {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  min-width: 180px;
  z-index: 12;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px;
  border-radius: 16px;
  border: 1px solid rgba(176, 201, 255, 0.12);
  background: rgba(10, 16, 28, 0.98);
  box-shadow: var(--shadow-md);
}

.gd-menu--export {
  right: 0;
}

.gd-menu--header {
  top: calc(100% + 10px);
  left: 0;
  right: auto;
  min-width: 190px;
}

.gd-menu button {
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

.gd-menu button:hover {
  background: rgba(255, 255, 255, 0.05);
  color: white;
}

.gd-menu-danger {
  color: rgba(255, 173, 173, 0.95);
}

.gd-menu button:disabled,
.gd-icon-btn:disabled,
.gd-plus-btn:disabled {
  opacity: 0.55;
  cursor: default;
}

.gd-workspace {
  flex: 1;
  display: grid;
  grid-template-columns: 196px minmax(0, 1fr) 260px;
  gap: 14px;
  min-height: 0;
}

.gd-workspace--ai-closed {
  grid-template-columns: 196px minmax(0, 1fr);
}

.gd-center {
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.gd-center-surface {
  position: relative;
  height: 100%;
  min-height: 0;
  border-radius: 12px;
  background: transparent;
  border: none;
  overflow: auto;
}

.gd-center--wide .gd-center-surface {
  padding-right: 68px;
}

.gd-side-rail {
  position: absolute;
  right: 16px;
  top: 112px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 8px;
  border-radius: 18px;
  background: rgba(20, 29, 47, 0.92);
  border: 1px solid rgba(176, 201, 255, 0.08);
  z-index: 2;
}

.gd-side-rail-btn {
  width: 30px;
  height: 30px;
  border-radius: 10px;
  border: 1px solid transparent;
  background: transparent;
  color: rgba(230, 236, 246, 0.82);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

.gd-side-rail-btn:hover {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(176, 201, 255, 0.08);
}

.gd-editor-loading,
.gd-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 0;
}

.gd-editor-loading {
  flex-direction: column;
  gap: 12px;
  color: var(--text-secondary);
}

.gd-editor-loading-overlay {
  position: absolute;
  inset: 0;
  background: rgba(9, 14, 24, 0.52);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 10px;
  color: rgba(240, 245, 255, 0.86);
  z-index: 3;
}

.gd-spinner {
  width: 24px;
  height: 24px;
  border-radius: 999px;
  border: 3px solid rgba(176, 201, 255, 0.16);
  border-top-color: var(--accent);
  animation: gd-spin 0.9s linear infinite;
}

.gd-state-card {
  max-width: 420px;
  padding: 28px;
  border-radius: 28px;
  border: 1px solid var(--border-default);
  background: var(--surface-glass-strong);
  box-shadow: var(--shadow-md);
  text-align: center;
}

.gd-state-title {
  font-size: 24px;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: -0.04em;
}

.gd-state-copy {
  margin: 12px 0 18px;
  color: var(--text-secondary);
  line-height: 1.7;
}

.gd-statusbar {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  gap: 18px;
  min-height: 34px;
  padding: 0 6px;
  color: rgba(193, 204, 222, 0.68);
  font-size: 12px;
  font-weight: 600;
}

.gd-statusbar-left,
.gd-statusbar-right {
  gap: 14px;
}

.gd-statusbar-right {
  justify-self: end;
}

.gd-page-indicator {
  color: rgba(214, 223, 238, 0.78);
  min-width: 96px;
  text-align: right;
}

.gd-dialog-backdrop {
  position: fixed;
  inset: 0;
  z-index: 40;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(4, 8, 16, 0.62);
  backdrop-filter: blur(10px);
}

.gd-dialog {
  width: min(560px, calc(100vw - 32px));
  border-radius: 24px;
  border: 1px solid rgba(176, 201, 255, 0.1);
  background: linear-gradient(180deg, rgba(18, 25, 40, 0.98), rgba(12, 18, 31, 0.98));
  box-shadow: 0 26px 90px rgba(2, 8, 24, 0.45);
  padding: 20px;
}

.gd-dialog-btn--danger {
  background: rgba(190, 57, 57, 0.9);
  border-color: rgba(235, 99, 99, 0.4);
  color: white;
}

.gd-dialog--compact {
  width: min(420px, calc(100vw - 32px));
}

.gd-dialog-head,
.gd-share-link-row,
.gd-share-form {
  display: flex;
  align-items: center;
  gap: 12px;
}

.gd-dialog-head {
  justify-content: space-between;
  margin-bottom: 18px;
}

.gd-dialog-title {
  color: var(--text-primary);
  font-size: 18px;
  font-weight: 700;
}

.gd-dialog-copy {
  margin-top: 4px;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.6;
}

.gd-dialog-close {
  border: none;
  background: transparent;
  color: var(--text-faint);
  font-size: 20px;
  cursor: pointer;
}

.gd-dialog-section + .gd-dialog-section {
  margin-top: 18px;
}

.gd-dialog-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 14px;
}

.gd-dialog-label {
  margin-bottom: 10px;
  color: rgba(232, 239, 255, 0.86);
  font-size: 12px;
  font-weight: 700;
}

.gd-share-link-input,
.gd-dialog-input,
.gd-dialog-select,
.gd-dialog-textarea {
  width: 100%;
  min-height: 42px;
  border-radius: 14px;
  border: 1px solid rgba(176, 201, 255, 0.1);
  background: rgba(255, 255, 255, 0.04);
  color: var(--text-primary);
  font: inherit;
  font-size: 13px;
  padding: 0 14px;
  box-sizing: border-box;
}

.gd-dialog-textarea {
  padding: 12px 14px;
  resize: vertical;
}

.gd-share-form {
  align-items: stretch;
}

.gd-dialog-select {
  width: 128px;
  flex-shrink: 0;
}

.gd-dialog-btn {
  min-height: 42px;
  padding: 0 16px;
  border-radius: 14px;
  border: 1px solid rgba(176, 201, 255, 0.12);
  background: rgba(255, 255, 255, 0.05);
  color: var(--text-primary);
  font: inherit;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  flex-shrink: 0;
}

.gd-dialog-btn--primary {
  background: #2d6df6;
  border-color: rgba(45, 109, 246, 0.6);
  color: white;
}

.gd-dialog-btn:disabled {
  opacity: 0.6;
  cursor: default;
}

.gd-dialog-note {
  margin-top: 10px;
  color: rgba(149, 224, 190, 0.92);
  font-size: 12px;
  line-height: 1.5;
}

.gd-chart-form {
  display: grid;
  gap: 12px;
}

.gd-table-grid {
  display: grid;
  grid-template-columns: repeat(8, 28px);
  gap: 6px;
  justify-content: center;
}

.gd-table-grid-cell {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  border: 1px solid rgba(176, 201, 255, 0.1);
  background: rgba(255, 255, 255, 0.04);
  cursor: pointer;
}

.gd-table-grid-cell.active,
.gd-table-grid-cell:hover {
  background: rgba(45, 109, 246, 0.35);
  border-color: rgba(123, 164, 255, 0.22);
}

.gd-download-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.gd-zoom-btn {
  min-width: 26px;
  min-height: 26px;
  padding: 0;
  border-radius: 999px;
}

.gd-zoom-slider {
  width: 72px;
  accent-color: #6aa4ff;
}

@keyframes gd-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 1320px) {
  .gd-workspace {
    grid-template-columns: 1fr;
  }

  .gd-workspace--ai-closed {
    grid-template-columns: 1fr;
  }

  .gd-center {
    min-height: 520px;
  }

  .gd-side-rail {
    display: none;
  }
}

@media (max-width: 1024px) {
  .gd-docbar,
  .gd-statusbar {
    flex-wrap: wrap;
  }

  .gd-docbar-center {
    order: 3;
    width: 100%;
  }

  .gd-menubar {
    padding-left: 0;
    overflow-x: auto;
  }

  .gd-share-link-row,
  .gd-share-form {
    flex-direction: column;
    align-items: stretch;
  }

  .gd-dialog-select,
  .gd-dialog-btn {
    width: 100%;
  }
}

@media (max-width: 1366px) {
  .gd-shell {
    padding: 10px 12px 12px;
  }

  .gd-docbar {
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .gd-docbar-right {
    flex-wrap: wrap;
    justify-content: flex-end;
  }
}

@media (max-width: 1320px) {
  .gd-outline,
  .gd-outline--collapsed,
  .gd-ai {
    width: 100%;
    max-width: none;
  }

  .gd-center--wide .gd-center-surface {
    padding-right: 0;
  }
}

@media (max-width: 1024px) {
  .gd-shell {
    gap: 8px;
    padding: 8px 10px 10px;
  }

  .gd-top-shell {
    padding: 10px 8px 8px;
  }

  .gd-app-tabs {
    padding-inline: 0;
    gap: 4px;
  }

  .gd-docbar {
    grid-template-columns: minmax(0, 1fr);
    gap: 10px;
  }

  .gd-docbar-left,
  .gd-docbar-center,
  .gd-docbar-right,
  .gd-statusbar-left,
  .gd-statusbar-right {
    flex-wrap: wrap;
  }

  .gd-docbar-center,
  .gd-docbar-right {
    justify-self: start;
    width: 100%;
  }

  .gd-doc-title-input {
    width: 100%;
  }

  .gd-menubar,
  .gd-statusbar {
    gap: 10px;
    overflow-x: auto;
  }

  .gd-statusbar {
    grid-template-columns: minmax(0, 1fr);
  }

  .gd-dialog-backdrop {
    padding: 16px;
  }

  .gd-dialog {
    max-height: min(88dvh, 720px);
    overflow: auto;
  }
}

@media (max-width: 640px) {
  .gd-shell {
    padding: 8px;
  }

  .gd-top-shell {
    padding: 8px;
    border-radius: 16px 16px 12px 12px;
  }

  .gd-docbar {
    gap: 8px;
  }

  .gd-doc-meta {
    flex: 1;
  }

  .gd-docbar-center {
    order: 3;
    width: 100%;
    justify-self: start;
    font-size: 10px;
  }

  .gd-docbar-right {
    width: 100%;
    justify-self: start;
  }

  .gd-doc-breadcrumb {
    flex-wrap: wrap;
    white-space: normal;
  }

  .gd-menubar {
    display: none;
  }

  .gd-docbar-right,
  .gd-dialog-head,
  .gd-dialog-actions {
    align-items: stretch;
  }

  .gd-dialog {
    width: 100%;
    padding: 16px;
    border-radius: 20px;
  }

  .gd-dialog-btn,
  .gd-dialog-select {
    width: 100%;
  }
}
</style>
